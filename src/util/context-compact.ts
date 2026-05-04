import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceRoot } from "../config/workspace-root";
import { contextCompactAgent } from "../mastra/agents/compact";
import type { TranscriptMessage } from "../types/message";
import { Envs } from "./env";

export function estimateTranscriptChars(messages: TranscriptMessage[]): number {
	let n = 0;
	for (const m of messages) {
		n += m.content.length + 8;
	}
	return n;
}

export async function writeTranscriptJsonl(
	messages: TranscriptMessage[],
): Promise<string> {
	const dir = join(workspaceRoot, ".transcripts");
	await mkdir(dir, { recursive: true });
	const path = join(dir, `transcript_${Date.now()}.jsonl`);
	const lines = messages.map((m) => JSON.stringify(m));
	await writeFile(path, `${lines.join("\n")}\n`, "utf8");
	return path;
}

function buildSummaryUserPayload(serializedConversation: string): string {
	return [
		"Summarize this coding-agent conversation so work can continue.",
		"Preserve:",
		"1. The current goal",
		"2. Important findings and decisions",
		"3. Files read or changed",
		"4. Remaining work",
		"5. User constraints and preferences",
		"Be compact but concrete.",
		"",
		serializedConversation,
	].join("\n");
}

export async function summarizeConversationWithCompactAgent(
	messages: TranscriptMessage[],
): Promise<string> {
	const raw = JSON.stringify(messages);
	const clipped = raw.slice(0, Envs.CONTEXT_SUMMARY_MAX_INPUT_CHARS);
	const prompt = buildSummaryUserPayload(clipped);
	const result = await contextCompactAgent.generate(
		[{ role: "user", content: prompt }],
		{ maxSteps: 1 },
	);
	const text = result.text?.trim() ?? "";
	if (!text) {
		return "(Summary empty; continue from transcript file if needed.)";
	}
	return text;
}

export function buildCompactUserMessage(summary: string): TranscriptMessage {
	return {
		role: "user",
		content: [
			"This conversation was compacted so the agent can continue working.",
			"",
			summary,
		].join("\n"),
	};
}

/**
 * 若启用且超字符阈值：写 transcript、调用 contextCompactAgent、返回单条 user 摘要消息。
 */
export async function prepareTranscriptForStream(
	messages: TranscriptMessage[],
): Promise<{ messages: TranscriptMessage[]; compacted: boolean }> {
	if (!Envs.CONTEXT_COMPACT_ENABLED) {
		return { messages, compacted: false };
	}
	const size = estimateTranscriptChars(messages);
	if (size <= Envs.CONTEXT_LIMIT_CHARS) {
		return { messages, compacted: false };
	}

	const transcriptFile = await writeTranscriptJsonl(messages);
	// eslint-disable-next-line no-console
	console.log(
		`[context-compact] over limit (${size} > ${Envs.CONTEXT_LIMIT_CHARS}), transcript: ${transcriptFile}`,
	);

	const summary = await summarizeConversationWithCompactAgent(messages);
	const compactUser = buildCompactUserMessage(summary);
	// eslint-disable-next-line no-console
	console.log(
		`[context-compact] summarized to ~${estimateTranscriptChars([compactUser])} chars`,
	);
	return { messages: [compactUser], compacted: true };
}
