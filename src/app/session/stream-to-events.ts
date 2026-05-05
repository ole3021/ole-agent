import type { MastraModelOutput } from "@mastra/core/stream";
import {
	formatSkillToolResultPreview,
	isMastraSkillTool,
} from "../../util/skill-log-format";
import type { AgentRunEvent, AgentRunScope } from "./agent-run-event";

type FullStreamChunk = {
	type: string;
	payload?: unknown;
};

export type StreamToggles = {
	reason: boolean;
	toolCall: boolean;
	usage: boolean;
};

const SUBAGENT_TOOL_PREFIX = "agent-";

const previewTextFromUnknown = (value: unknown): string => {
	if (value === undefined || value === null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const scopeFromSub = (subId?: string): AgentRunScope =>
	subId ? { sub: subId } : "main";

export async function* streamToAgentRunEvents(
	stream: MastraModelOutput<unknown>,
	signal?: AbortSignal,
): AsyncGenerator<AgentRunEvent> {
	const reader = stream.fullStream.getReader();
	if (signal) {
		const onAbort = () => {
			void reader.cancel("aborted");
		};
		if (signal.aborted) {
			onAbort();
		} else {
			signal.addEventListener("abort", onAbort, { once: true });
		}
	}
	const reasoningIds = new Set<string>();
	let assistantText = "";

	yield { kind: "turn-start" };

	const emitChunk = function* (
		chunk: FullStreamChunk,
		scope: AgentRunScope,
		countsTowardAssistant: boolean,
	): Generator<AgentRunEvent> {
		switch (chunk.type) {
			case "reasoning-start": {
				const id = String(
					(chunk.payload as { id?: string } | undefined)?.id ?? "",
				);
				if (id) {
					reasoningIds.add(id);
				}
				yield { kind: "reasoning-start", scope, id };
				break;
			}
			case "reasoning-delta": {
				const payload = chunk.payload as
					| { id?: string; text?: string }
					| undefined;
				const id = String(payload?.id ?? "");
				const text = String(payload?.text ?? "");
				if (!id || reasoningIds.has(id)) {
					yield { kind: "reasoning-delta", scope, id, text };
				}
				break;
			}
			case "reasoning-end": {
				const id = String(
					(chunk.payload as { id?: string } | undefined)?.id ?? "",
				);
				if (id) {
					reasoningIds.delete(id);
				}
				yield { kind: "reasoning-end", scope, id };
				break;
			}
			case "tool-call": {
				const payload = chunk.payload as
					| { toolName?: string; args?: unknown; toolCallId?: string }
					| undefined;
				const toolName = String(payload?.toolName ?? "?");
				yield {
					kind: "tool-call",
					scope,
					id: String(payload?.toolCallId ?? payload?.toolName ?? ""),
					name: toolName,
					args: payload?.args ?? {},
				};
				break;
			}
			case "tool-result": {
				const payload = chunk.payload as
					| { toolName?: string; toolCallId?: string; result?: unknown }
					| undefined;
				const toolName = String(payload?.toolName ?? "?");
				const res = payload?.result;
				const preview =
					res !== undefined && res !== null
						? isMastraSkillTool(toolName)
							? formatSkillToolResultPreview(toolName, res)
							: previewTextFromUnknown(res)
						: undefined;
				yield {
					kind: "tool-result",
					scope,
					id: String(payload?.toolCallId ?? payload?.toolName ?? ""),
					name: toolName,
					ok: true,
					preview,
				};
				break;
			}
			case "tool-error": {
				const payload = chunk.payload as
					| { toolName?: string; toolCallId?: string; error?: unknown }
					| undefined;
				const tn = String(payload?.toolName ?? "?");
				yield {
					kind: "tool-result",
					scope,
					id: String(payload?.toolCallId ?? payload?.toolName ?? ""),
					name: tn,
					ok: false,
					preview: previewTextFromUnknown(
						payload?.error ?? "Unknown tool error",
					),
				};
				yield {
					kind: "error",
					message: `tool: ${String(payload?.toolName ?? "?")} >> ${previewTextFromUnknown(payload?.error ?? "Unknown tool error")}`,
				};
				break;
			}
			case "error": {
				const payload = chunk.payload as { error?: unknown } | undefined;
				yield {
					kind: "error",
					message: previewTextFromUnknown(payload?.error ?? "Stream error"),
				};
				break;
			}
			case "text-delta": {
				const payload = chunk.payload as { text?: string } | undefined;
				const text = String(payload?.text ?? "");
				yield { kind: "text-delta", scope, text };
				if (countsTowardAssistant) {
					assistantText += text;
				}
				break;
			}
			default:
				break;
		}
	};

	while (true) {
		if (signal?.aborted) {
			break;
		}
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		const chunk = value as unknown as FullStreamChunk;
		const payload = (chunk.payload ?? {}) as {
			toolName?: string;
			toolCallId?: string;
			output?: FullStreamChunk;
			error?: unknown;
		};

		if (
			chunk.type === "tool-call" &&
			typeof payload.toolName === "string" &&
			payload.toolName.startsWith(SUBAGENT_TOOL_PREFIX)
		) {
			for (const event of emitChunk(chunk, "main", true)) {
				yield event;
			}
			const subId = payload.toolName.slice(SUBAGENT_TOOL_PREFIX.length);
			yield { kind: "subagent-start", id: subId };
			continue;
		}

		if (
			(chunk.type === "tool-result" || chunk.type === "tool-error") &&
			typeof payload.toolName === "string" &&
			payload.toolName.startsWith(SUBAGENT_TOOL_PREFIX)
		) {
			const subId = payload.toolName.slice(SUBAGENT_TOOL_PREFIX.length);
			yield {
				kind: "subagent-end",
				id: subId,
				ok: chunk.type === "tool-result",
				error:
					chunk.type === "tool-error"
						? previewTextFromUnknown(payload.error ?? "")
						: undefined,
			};
			continue;
		}

		if (
			chunk.type === "tool-output" &&
			typeof payload.toolName === "string" &&
			payload.toolName.startsWith(SUBAGENT_TOOL_PREFIX) &&
			payload.output
		) {
			const subId = payload.toolName.slice(SUBAGENT_TOOL_PREFIX.length);
			for (const event of emitChunk(
				payload.output,
				scopeFromSub(subId),
				false,
			)) {
				yield event;
			}
			continue;
		}

		for (const event of emitChunk(chunk, "main", true)) {
			yield event;
		}
	}

	if (signal?.aborted) {
		return;
	}

	const [finalText] = await Promise.all([stream.text, stream.finishReason]);
	if (assistantText.length === 0 && finalText) {
		assistantText = finalText;
		yield { kind: "text-delta", scope: "main", text: finalText };
	}

	const usage = await stream.usage;
	yield {
		kind: "usage",
		inTokens: usage.inputTokens,
		outTokens: usage.outputTokens,
		totalTokens: usage.totalTokens,
	};

	yield { kind: "turn-end", assistantText };
}

export function isAgentRunEventVisible(
	event: AgentRunEvent,
	toggles: StreamToggles,
): boolean {
	if (
		event.kind === "reasoning-start" ||
		event.kind === "reasoning-delta" ||
		event.kind === "reasoning-end"
	) {
		return toggles.reason;
	}
	if (event.kind === "usage") {
		return toggles.usage;
	}
	if (event.kind === "tool-call" || event.kind === "tool-result") {
		if (event.name === "todo" || isMastraSkillTool(event.name)) {
			return true;
		}
		return toggles.toolCall;
	}
	return true;
}
