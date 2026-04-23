import type { MastraModelOutput } from "@mastra/core/stream";
import { Envs } from "../util/env";
import { color, tag } from "./style";

export const formatTokens = (n: number | undefined): string => {
	if (n === undefined || !Number.isFinite(n)) {
		return "-";
	}
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
};

type FullStreamChunk = {
	type: string;
	payload?: unknown;
};

// Mastra's supervisor delegation wraps every sub-agent `fullStream` chunk as
// `{ type: "tool-output", payload: { output: <inner chunk>, toolName, toolCallId } }`
// when forwarding to the parent stream (see `@mastra/core` ToolStream._write).
// When we see one of those with `toolName` starting with this prefix, we
// unwrap `payload.output` and render it under a yellow sub-agent marker.
const SUBAGENT_TOOL_PREFIX = "agent-";

/** Drains a Mastra `fullStream` to stdout and returns the supervisor's final text. */
export const renderStream = async (
	stream: MastraModelOutput<unknown>,
): Promise<string> => {
	const reader = stream.fullStream.getReader();
	const reasoningIds = new Set<string>();
	let assistantText = "";
	let hasOpenMetaLine = false;
	let hasTextOutput = false;
	let metaBodyColor: string = color.cyan;
	let textLineNeedsPrefix = true;

	// The yellow `:S: <agent> ` prefix prepended before every meta tag and at
	// every line break inside deltas. Empty when rendering supervisor chunks;
	// set per-chunk when rendering a `tool-output`-wrapped sub-agent chunk.
	let currentPrefixStr = "";
	let currentIsSub = false;

	const flushText = (): void => {
		if (hasTextOutput) {
			process.stdout.write("\n");
			hasTextOutput = false;
		}
	};

	const startMetaLine = (tagStr: string, bodyColor: string): void => {
		flushText();
		metaBodyColor = bodyColor;
		process.stdout.write(`${currentPrefixStr}${bodyColor}${tagStr}`);
		hasOpenMetaLine = true;
	};

	const endMetaLine = (): void => {
		process.stdout.write(`${color.reset}\n`);
		hasOpenMetaLine = false;
	};

	// Writes delta text inside an already-open meta line. When a prefix is set,
	// any embedded '\n' breaks the line and re-emits `prefix + bodyColor` so
	// multi-line reasoning keeps its visual grouping.
	const writeMetaDelta = (text: string): void => {
		if (!currentPrefixStr) {
			process.stdout.write(text);
			return;
		}
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				process.stdout.write(
					`${color.reset}\n${currentPrefixStr}${metaBodyColor}`,
				);
			}
			process.stdout.write(parts[i]);
		}
	};

	const printMeta = (tagStr: string, body: string, bodyColor: string): void => {
		startMetaLine(tagStr, bodyColor);
		writeMetaDelta(body);
		endMetaLine();
	};

	// Free-form assistant text (outside a meta line). With a prefix set we
	// prepend it at every new line so multi-line output keeps the `:S:` marker.
	const writeText = (text: string): void => {
		if (hasOpenMetaLine) {
			endMetaLine();
			textLineNeedsPrefix = true;
		}
		if (!currentPrefixStr) {
			process.stdout.write(text);
			hasTextOutput = true;
			return;
		}
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i > 0) {
				process.stdout.write("\n");
				textLineNeedsPrefix = true;
			}
			if (part.length > 0) {
				if (textLineNeedsPrefix) {
					process.stdout.write(currentPrefixStr);
					textLineNeedsPrefix = false;
				}
				process.stdout.write(part);
			}
		}
		if (text.endsWith("\n")) {
			textLineNeedsPrefix = true;
		}
		hasTextOutput = true;
	};

	// Render a single chunk using the currently active prefix / sub flag.
	// Kept identical in shape to the pre-subagent rendering logic so the
	// supervisor output is unchanged.
	const handleChunk = (chunk: FullStreamChunk): void => {
		switch (chunk.type) {
			case "reasoning-start":
				if (Envs.CLI_REASON) {
					const id = String(
						(chunk.payload as { id?: string } | undefined)?.id ?? "",
					);
					if (id) {
						reasoningIds.add(id);
					}
					startMetaLine(tag.reason, color.cyan);
				}
				break;
			case "reasoning-delta":
				if (Envs.CLI_REASON) {
					const p = chunk.payload as { id?: string; text?: string } | undefined;
					const id = String(p?.id ?? "");
					if (!id || reasoningIds.has(id)) {
						writeMetaDelta(String(p?.text ?? ""));
					}
				}
				break;
			case "reasoning-end":
				if (Envs.CLI_REASON) {
					const id = String(
						(chunk.payload as { id?: string } | undefined)?.id ?? "",
					);
					if (id) {
						reasoningIds.delete(id);
					}
					endMetaLine();
				}
				break;
			case "tool-call":
				if (Envs.CLI_TOOL_CALL) {
					const p = chunk.payload as
						| { toolName?: string; args?: unknown }
						| undefined;
					printMeta(
						tag.tool,
						`call: ${p?.toolName ?? "?"} >> ${JSON.stringify(p?.args ?? {})} `,
						color.cyan,
					);
				}
				break;
			case "tool-result":
				if (Envs.CLI_TOOL_CALL) {
					const p = chunk.payload as { toolName?: string } | undefined;
					printMeta(tag.tool, `result: ${p?.toolName ?? "?"} `, color.cyan);
				}
				break;
			case "tool-error": {
				const p = chunk.payload as
					| { toolName?: string; error?: unknown }
					| undefined;
				printMeta(
					tag.error,
					`tool: ${p?.toolName ?? "?"} >> ${String(p?.error)} `,
					color.cyan,
				);
				break;
			}
			case "error": {
				const p = chunk.payload as { error?: unknown } | undefined;
				printMeta(tag.error, `stream: ${String(p?.error)} `, color.cyan);
				break;
			}
			case "text-delta": {
				const p = chunk.payload as { text?: string } | undefined;
				const text = String(p?.text ?? "");
				writeText(text);
				// Only supervisor text counts toward the final return value;
				// sub-agent text streams to stdout but the supervisor's own
				// summary is what we hand back to the caller.
				if (!currentIsSub) {
					assistantText += text;
				}
				break;
			}
			default:
				break;
		}
	};

	const subPrefix = (agentId: string): string =>
		`${color.yellow}${tag.sub}${agentId} ${color.reset}`;

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		const chunk = value as unknown as FullStreamChunk;
		const payload = (chunk.payload ?? {}) as {
			toolName?: string;
			toolCallId?: string;
			output?: FullStreamChunk;
		};

		// 1) Top-level delegation boundary: supervisor just asked an agent-tool.
		if (
			chunk.type === "tool-call" &&
			typeof payload.toolName === "string" &&
			payload.toolName.startsWith(SUBAGENT_TOOL_PREFIX)
		) {
			const subId = payload.toolName.slice(SUBAGENT_TOOL_PREFIX.length);
			handleChunk(chunk); // parent-level `:T: call: agent-xxx >> {...}`
			currentPrefixStr = subPrefix(subId);
			currentIsSub = true;
			printMeta(tag.sub, "start ", color.yellow);
			currentPrefixStr = "";
			currentIsSub = false;
			continue;
		}

		// 2) Top-level delegation completion. Banner replaces the otherwise
		//    empty parent tool-result line.
		if (
			(chunk.type === "tool-result" || chunk.type === "tool-error") &&
			typeof payload.toolName === "string" &&
			payload.toolName.startsWith(SUBAGENT_TOOL_PREFIX)
		) {
			const subId = payload.toolName.slice(SUBAGENT_TOOL_PREFIX.length);
			currentPrefixStr = subPrefix(subId);
			currentIsSub = true;
			if (chunk.type === "tool-error") {
				const errPayload = chunk.payload as { error?: unknown } | undefined;
				printMeta(
					tag.error,
					`delegation failed: ${String(errPayload?.error)} `,
					color.yellow,
				);
			} else {
				printMeta(tag.sub, "end ", color.yellow);
			}
			currentPrefixStr = "";
			currentIsSub = false;
			continue;
		}

		// 3) Sub-agent inner chunk, forwarded by Mastra as a `tool-output`
		//    envelope. Unwrap `payload.output` and render it under the yellow
		//    `:S: <agent> ` prefix, reusing the supervisor's own switch logic.
		if (
			chunk.type === "tool-output" &&
			typeof payload.toolName === "string" &&
			payload.toolName.startsWith(SUBAGENT_TOOL_PREFIX) &&
			payload.output
		) {
			const subId = payload.toolName.slice(SUBAGENT_TOOL_PREFIX.length);
			currentPrefixStr = subPrefix(subId);
			currentIsSub = true;
			handleChunk(payload.output);
			currentPrefixStr = "";
			currentIsSub = false;
			continue;
		}

		// 4) Regular supervisor-level chunk.
		handleChunk(chunk);
	}

	if (hasOpenMetaLine) {
		endMetaLine();
	}
	flushText();

	const [finalText] = await Promise.all([stream.text, stream.finishReason]);
	if (assistantText.length === 0 && finalText) {
		writeText(finalText);
		assistantText = finalText;
		process.stdout.write("\n");
		hasTextOutput = false;
	}

	if (Envs.CLI_USAGE) {
		console.log();
		const usage = await stream.usage;
		console.log(
			`${color.cyan}${tag.stat}usage in=${formatTokens(usage.inputTokens)} out=${formatTokens(usage.outputTokens)} tot=${formatTokens(usage.totalTokens)}`,
		);
	}

	if (assistantText.length === 0) {
		console.log("[No response]");
	}
	return assistantText;
};
