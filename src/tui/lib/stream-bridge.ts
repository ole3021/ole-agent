import type { MastraModelOutput } from "@mastra/core/stream";
import type { Scope, StreamToggles, UiEvent } from "../store/types";
import { previewTextFromUnknown } from "./text-utils";

type FullStreamChunk = {
	type: string;
	payload?: unknown;
};

const SUBAGENT_TOOL_PREFIX = "agent-";

export { formatTokens } from "./text-utils";

const scopeFromSub = (subId?: string): Scope =>
	subId ? { sub: subId } : "main";

export async function* streamToEvents(
	stream: MastraModelOutput<unknown>,
	toggles: StreamToggles,
	signal?: AbortSignal,
): AsyncGenerator<UiEvent> {
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
		scope: Scope,
		countsTowardAssistant: boolean,
	): Generator<UiEvent> {
		switch (chunk.type) {
			case "reasoning-start": {
				if (!toggles.reason) {
					break;
				}
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
				if (!toggles.reason) {
					break;
				}
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
				if (!toggles.reason) {
					break;
				}
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
				/** `todo` 需始终经流，供侧栏与待办归约；其它工具受 `toggles.toolCall` 控制 */
				if (!toggles.toolCall && toolName !== "todo") {
					break;
				}
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
				if (!toggles.toolCall) {
					break;
				}
				const payload = chunk.payload as
					| { toolName?: string; toolCallId?: string; result?: unknown }
					| undefined;
				const res = payload?.result;
				yield {
					kind: "tool-result",
					scope,
					id: String(payload?.toolCallId ?? payload?.toolName ?? ""),
					name: String(payload?.toolName ?? "?"),
					ok: true,
					preview:
						res !== undefined && res !== null
							? previewTextFromUnknown(res)
							: undefined,
				};
				break;
			}
			case "tool-error": {
				const payload = chunk.payload as
					| { toolName?: string; toolCallId?: string; error?: unknown }
					| undefined;
				if (toggles.toolCall) {
					yield {
						kind: "tool-result",
						scope,
						id: String(payload?.toolCallId ?? payload?.toolName ?? ""),
						name: String(payload?.toolName ?? "?"),
						ok: false,
						preview: previewTextFromUnknown(
							payload?.error ?? "Unknown tool error",
						),
					};
				}
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

	/** 中止后不再 await stream.text/usage，避免挂起与多余请求 */
	if (signal?.aborted) {
		return;
	}

	const [finalText] = await Promise.all([stream.text, stream.finishReason]);
	if (assistantText.length === 0 && finalText) {
		assistantText = finalText;
		yield { kind: "text-delta", scope: "main", text: finalText };
	}

	if (toggles.usage) {
		const usage = await stream.usage;
		yield {
			kind: "usage",
			inTokens: usage.inputTokens,
			outTokens: usage.outputTokens,
			totalTokens: usage.totalTokens,
		};
	}

	yield { kind: "turn-end", assistantText };
}
