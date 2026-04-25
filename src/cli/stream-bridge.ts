import type { MastraModelOutput } from "@mastra/core/stream";
import type { Scope, StreamToggles, UiEvent } from "./events";

type FullStreamChunk = {
	type: string;
	payload?: unknown;
};

const SUBAGENT_TOOL_PREFIX = "agent-";

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

const scopeFromSub = (subId?: string): Scope =>
	subId ? { sub: subId } : "main";

export async function* streamToEvents(
	stream: MastraModelOutput<unknown>,
	toggles: StreamToggles,
): AsyncGenerator<UiEvent> {
	const reader = stream.fullStream.getReader();
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
				if (!toggles.toolCall) {
					break;
				}
				const payload = chunk.payload as
					| { toolName?: string; args?: unknown; toolCallId?: string }
					| undefined;
				yield {
					kind: "tool-call",
					scope,
					id: String(payload?.toolCallId ?? payload?.toolName ?? ""),
					name: String(payload?.toolName ?? "?"),
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
				yield {
					kind: "tool-result",
					scope,
					id: String(payload?.toolCallId ?? payload?.toolName ?? ""),
					name: String(payload?.toolName ?? "?"),
					ok: true,
					preview: payload?.result ? String(payload.result) : undefined,
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
						preview: String(payload?.error ?? "Unknown tool error"),
					};
				}
				yield {
					kind: "error",
					message: `tool: ${String(payload?.toolName ?? "?")} >> ${String(payload?.error ?? "Unknown tool error")}`,
				};
				break;
			}
			case "error": {
				const payload = chunk.payload as { error?: unknown } | undefined;
				yield {
					kind: "error",
					message: String(payload?.error ?? "Stream error"),
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
					chunk.type === "tool-error" ? String(payload.error ?? "") : undefined,
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
