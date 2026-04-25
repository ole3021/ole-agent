import { useCallback, useMemo, useRef, useState } from "react";
import { Envs } from "../../util/env";
import type { Scope, StreamToggles, UiEvent } from "../events";
import { AgentSession } from "../session";

export type TranscriptBlock =
	| { id: string; type: "user"; text: string }
	| {
			id: string;
			type: "assistant";
			text: string;
			scope: Scope;
			streaming: boolean;
	  }
	| {
			id: string;
			type: "reasoning";
			text: string;
			scope: Scope;
			streaming: boolean;
	  }
	| {
			id: string;
			type: "tool";
			scope: Scope;
			toolName: string;
			args: string;
			status: "running" | "ok" | "error";
			preview?: string;
	  }
	| {
			id: string;
			type: "subagent";
			agentId: string;
			status: "running" | "ok" | "error";
			error?: string;
	  }
	| { id: string; type: "error"; message: string }
	| { id: string; type: "usage"; input: string; output: string; total: string };

type UsageState = {
	input: number;
	output: number;
	total: number;
};

type TodoStats = {
	pending: number;
	inProgress: number;
	completed: number;
	cancelled: number;
};

type DebugState = "idle" | "running" | "done" | "aborted" | "error";

type TurnStats = {
	startAtMs: number | null;
	toolCalls: number;
};

const scopeKey = (scope: Scope): string =>
	typeof scope === "string" ? scope : `sub:${scope.sub}`;

const formatTokens = (n: number | undefined): string => {
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

const stringifySafe = (value: unknown): string => {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const toTodoStats = (args: unknown): TodoStats | undefined => {
	if (!args || typeof args !== "object") {
		return undefined;
	}
	const todos = (args as { todos?: unknown }).todos;
	if (!Array.isArray(todos)) {
		return undefined;
	}
	const stats: TodoStats = {
		pending: 0,
		inProgress: 0,
		completed: 0,
		cancelled: 0,
	};
	for (const item of todos) {
		const status = (item as { status?: string })?.status;
		if (status === "pending") {
			stats.pending += 1;
		} else if (status === "in_progress") {
			stats.inProgress += 1;
		} else if (status === "completed") {
			stats.completed += 1;
		} else if (status === "cancelled") {
			stats.cancelled += 1;
		}
	}
	return stats;
};

export const useAgentSession = () => {
	const sessionRef = useRef(new AgentSession());
	const nextIdRef = useRef(1);
	const nextId = useCallback((prefix: string): string => {
		const id = nextIdRef.current;
		nextIdRef.current += 1;
		return `${prefix}-${id}`;
	}, []);
	const [blocks, setBlocks] = useState<TranscriptBlock[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [usage, setUsage] = useState<UsageState>({
		input: 0,
		output: 0,
		total: 0,
	});
	const [totalUsage, setTotalUsage] = useState<UsageState>({
		input: 0,
		output: 0,
		total: 0,
	});
	const [todoStats, setTodoStats] = useState<TodoStats>({
		pending: 0,
		inProgress: 0,
		completed: 0,
		cancelled: 0,
	});
	const [debugState, setDebugState] = useState<DebugState>("idle");
	const [toggles, setToggles] = useState<StreamToggles>({
		reason: Envs.CLI_REASON,
		toolCall: Envs.CLI_TOOL_CALL,
		usage: Envs.CLI_USAGE,
	});
	const [turnStats, setTurnStats] = useState<TurnStats>({
		startAtMs: null,
		toolCalls: 0,
	});

	const appendBlock = useCallback((block: TranscriptBlock) => {
		setBlocks((prev) => [...prev, block]);
	}, []);

	const upsertFromEvent = useCallback(
		(event: UiEvent) => {
			switch (event.kind) {
				case "turn-start":
					setIsStreaming(true);
					setDebugState("running");
					setTurnStats({ startAtMs: Date.now(), toolCalls: 0 });
					break;
				case "text-delta":
					setBlocks((prev) => {
						const last = prev[prev.length - 1];
						if (
							last &&
							last.type === "assistant" &&
							scopeKey(last.scope) === scopeKey(event.scope)
						) {
							const updated: TranscriptBlock = {
								...last,
								text: last.text + event.text,
								streaming: true,
							};
							return [...prev.slice(0, -1), updated];
						}
						return [
							...prev,
							{
								id: nextId("assistant"),
								type: "assistant",
								text: event.text,
								scope: event.scope,
								streaming: true,
							},
						];
					});
					break;
				case "reasoning-start":
					appendBlock({
						id: nextId("reasoning"),
						type: "reasoning",
						text: "",
						scope: event.scope,
						streaming: true,
					});
					break;
				case "reasoning-delta":
					setBlocks((prev) => {
						const idx = [...prev]
							.reverse()
							.findIndex(
								(block) =>
									block.type === "reasoning" &&
									scopeKey(block.scope) === scopeKey(event.scope),
							);
						if (idx === -1) {
							return [
								...prev,
								{
									id: nextId("reasoning"),
									type: "reasoning",
									text: event.text,
									scope: event.scope,
									streaming: true,
								},
							];
						}
						const realIdx = prev.length - 1 - idx;
						const block = prev[realIdx] as Extract<
							TranscriptBlock,
							{ type: "reasoning" }
						>;
						const updated = { ...block, text: block.text + event.text };
						return [
							...prev.slice(0, realIdx),
							updated,
							...prev.slice(realIdx + 1),
						];
					});
					break;
				case "reasoning-end":
					setBlocks((prev) =>
						prev.map((block) =>
							block.type === "reasoning" &&
							scopeKey(block.scope) === scopeKey(event.scope)
								? { ...block, streaming: false }
								: block,
						),
					);
					break;
				case "tool-call":
					appendBlock({
						id: event.id || nextId("tool"),
						type: "tool",
						scope: event.scope,
						toolName: event.name,
						args: stringifySafe(event.args),
						status: "running",
					});
					if (event.name === "todo") {
						const parsed = toTodoStats(event.args);
						if (parsed) {
							setTodoStats(parsed);
						}
					}
					setTurnStats((prev) => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
					break;
				case "tool-result":
					setBlocks((prev) =>
						prev.map((block) =>
							block.type === "tool" && block.id === event.id
								? {
										...block,
										status: event.ok ? "ok" : "error",
										preview: event.preview,
									}
								: block,
						),
					);
					break;
				case "subagent-start":
					appendBlock({
						id: nextId("subagent"),
						type: "subagent",
						agentId: event.id,
						status: "running",
					});
					break;
				case "subagent-end":
					setBlocks((prev) =>
						prev.map((block) =>
							block.type === "subagent" && block.agentId === event.id
								? {
										...block,
										status: event.ok ? "ok" : "error",
										error: event.error,
									}
								: block,
						),
					);
					break;
				case "usage": {
					const input = event.inTokens ?? 0;
					const output = event.outTokens ?? 0;
					const total = event.totalTokens ?? 0;
					setUsage({ input, output, total });
					setTotalUsage((prev) => ({
						input: prev.input + input,
						output: prev.output + output,
						total: prev.total + total,
					}));
					appendBlock({
						id: nextId("usage"),
						type: "usage",
						input: formatTokens(input),
						output: formatTokens(output),
						total: formatTokens(total),
					});
					break;
				}
				case "error":
					setDebugState(event.message === "[aborted]" ? "aborted" : "error");
					appendBlock({
						id: nextId("error"),
						type: "error",
						message: event.message,
					});
					break;
				case "turn-end":
					setIsStreaming(false);
					setDebugState((prev) =>
						prev === "running" ? (event.assistantText ? "done" : "idle") : prev,
					);
					setBlocks((prev) =>
						prev.map((block) =>
							block.type === "assistant" || block.type === "reasoning"
								? { ...block, streaming: false }
								: block,
						),
					);
					break;
				default:
					break;
			}
		},
		[appendBlock, nextId],
	);

	const submit = useCallback(
		async (query: string): Promise<void> => {
			appendBlock({ id: nextId("user"), type: "user", text: query });
			for await (const event of sessionRef.current.runTurn(query, toggles)) {
				upsertFromEvent(event);
			}
		},
		[appendBlock, nextId, toggles, upsertFromEvent],
	);

	const abort = useCallback(() => {
		sessionRef.current.abortCurrentTurn();
	}, []);

	const clear = useCallback(() => {
		setBlocks([]);
		setDebugState("idle");
		setUsage({ input: 0, output: 0, total: 0 });
		setTotalUsage({ input: 0, output: 0, total: 0 });
	}, []);

	const elapsedSec = useMemo(() => {
		if (!isStreaming || turnStats.startAtMs === null) {
			return 0;
		}
		return Math.max(0, Math.floor((Date.now() - turnStats.startAtMs) / 1000));
	}, [isStreaming, turnStats.startAtMs]);

	return {
		abort,
		blocks,
		clear,
		elapsedSec,
		isStreaming,
		debugState,
		setToggles,
		submit,
		toggles,
		todoStats,
		totalUsage,
		toolCalls: turnStats.toolCalls,
		usage,
	};
};
