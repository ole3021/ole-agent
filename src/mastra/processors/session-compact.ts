import { randomUUID } from "node:crypto";
import type { MastraDBMessage } from "@mastra/core/agent";
import type { InputProcessor, ProcessInputArgs } from "@mastra/core/processors";
import type { TranscriptMessage } from "../../types/message";
import { prepareTranscriptForStream } from "../../util/context-compact";
import {
	getTranscriptModelPrefix,
	setTranscriptModelPrefix,
} from "../../util/messages";

/**
 * Map Mastra DB messages to plain transcript turns. Returns null if the thread is not
 * expressible as user/assistant string-only (e.g. tool parts, images) — compression is skipped.
 */
function mastraDbMessagesToTranscript(
	messages: MastraDBMessage[],
): TranscriptMessage[] | null {
	const out: TranscriptMessage[] = [];
	for (const m of messages) {
		if (m.role !== "user" && m.role !== "assistant") {
			return null;
		}
		const parts = m.content?.parts;
		if (!Array.isArray(parts) || parts.length === 0) {
			return null;
		}
		let text = "";
		for (const part of parts) {
			if (!part || typeof part !== "object") {
				return null;
			}
			if ((part as { type?: string }).type !== "text") {
				return null;
			}
			const t = (part as { text?: unknown }).text;
			if (typeof t !== "string") {
				return null;
			}
			text += t;
		}
		out.push({ role: m.role, content: text });
	}
	return out.length > 0 ? out : null;
}

function transcriptToMastraDbMessages(
	messages: TranscriptMessage[],
): MastraDBMessage[] {
	return messages.map((msg) => ({
		id: randomUUID(),
		role: msg.role,
		createdAt: new Date(),
		content: {
			format: 2 as const,
			parts: [{ type: "text" as const, text: msg.content }],
		},
	}));
}

/**
 * Runs once per `stream`/`generate` before the model. Uses `prepareTranscriptForStream`
 * and keeps a compact model-prefix in the app transcript prefix store.
 *
 * Subagents (`explorer-agent`, `coder-agent`) are separate agents without this processor.
 */
export const sessionCompactProcessor: InputProcessor = {
	id: "ole-session-compact",
	name: "Transcript session compact",

	async processInput(args: ProcessInputArgs) {
		const transcript = mastraDbMessagesToTranscript(args.messages);
		if (!transcript) {
			setTranscriptModelPrefix(null);
			return args.messages;
		}

		const lastUser = transcript[transcript.length - 1];
		const sessionPrefix = getTranscriptModelPrefix();
		const usePrefixInput =
			sessionPrefix &&
			sessionPrefix.length > 0 &&
			lastUser?.role === "user" &&
			lastUser.content.length > 0;
		const inputTranscript: TranscriptMessage[] = usePrefixInput
			? [
					...sessionPrefix,
					{ role: "user" as const, content: lastUser.content },
				]
			: transcript;

		try {
			const { messages: sentTranscript, compacted } =
				await prepareTranscriptForStream(inputTranscript);
			setTranscriptModelPrefix(
				compacted ? sentTranscript : usePrefixInput ? inputTranscript : null,
			);
			if (!compacted && !usePrefixInput) {
				return args.messages;
			}
			return transcriptToMastraDbMessages(sentTranscript);
		} catch (err) {
			console.error(
				"[session-compact] prepare failed; continuing without compact:",
				err instanceof Error ? err.message : err,
			);
			setTranscriptModelPrefix(null);
			return args.messages;
		}
	},
};
