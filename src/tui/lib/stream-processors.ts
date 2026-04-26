import type {
	AgentTodoItem,
	AgentTodoStatus,
	DebugState,
	StreamToggles,
	TodoStats,
	TranscriptBlock,
	TurnStats,
	UiEvent,
	UsageState,
} from "../store/types";
import { formatTokens } from "./text-utils";

let nextIdCounter = 1;

const nextId = (prefix: string): string => {
	const id = nextIdCounter;
	nextIdCounter += 1;
	return `${prefix}-${id}`;
};

const scopeKey = (scope: string | { sub: string }): string =>
	typeof scope === "string" ? scope : `sub:${scope.sub}`;

const stringifySafe = (value: unknown): string => {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const toTodoStatus = (raw: string | undefined): AgentTodoStatus => {
	if (raw === "in_progress") return "in_progress";
	if (raw === "completed") return "completed";
	if (raw === "cancelled") return "cancelled";
	return "pending";
};

export const parseAgentTodoFromArgs = (
	args: unknown,
): { stats: TodoStats; items: AgentTodoItem[] } | undefined => {
	if (!args || typeof args !== "object") return undefined;
	const a = args as { items?: unknown; todos?: unknown };
	const list = Array.isArray(a.items)
		? a.items
		: Array.isArray(a.todos)
			? a.todos
			: null;
	if (!list || list.length === 0) return undefined;
	const items: AgentTodoItem[] = list.map((raw, i) => {
		const o = raw as {
			id?: string;
			content?: string;
			title?: string;
			task?: string;
			status?: string;
		};
		const status = toTodoStatus(o.status);
		const label = String(
			o.content || o.title || o.task || `任务 ${i + 1}`,
		).trim();
		return { id: String(o.id ?? `todo-${i + 1}`), label, status };
	});
	const stats: TodoStats = {
		pending: 0,
		inProgress: 0,
		completed: 0,
		cancelled: 0,
	};
	for (const t of items) {
		if (t.status === "pending") stats.pending += 1;
		else if (t.status === "in_progress") stats.inProgress += 1;
		else if (t.status === "completed") stats.completed += 1;
		else if (t.status === "cancelled") stats.cancelled += 1;
	}
	return { stats, items };
};

export const updateTodoState = (
	todoStats: TodoStats,
	agentTodos: AgentTodoItem[],
	event: UiEvent,
): { todoStats: TodoStats; agentTodos: AgentTodoItem[] } => {
	if (event.kind === "tool-call" && event.name === "todo") {
		const parsed = parseAgentTodoFromArgs(event.args);
		if (parsed) {
			return { todoStats: parsed.stats, agentTodos: parsed.items };
		}
	}
	return { todoStats, agentTodos };
};

export const applyEvent = (
	blocks: TranscriptBlock[],
	event: UiEvent,
	toggles: StreamToggles,
): TranscriptBlock[] => {
	switch (event.kind) {
		case "turn-start":
			return blocks;
		case "text-delta": {
			const last = blocks[blocks.length - 1];
			if (
				last &&
				last.type === "assistant" &&
				scopeKey(last.scope) === scopeKey(event.scope)
			) {
				return [
					...blocks.slice(0, -1),
					{ ...last, text: last.text + event.text, streaming: true },
				];
			}
			return [
				...blocks,
				{
					id: nextId("assistant"),
					type: "assistant",
					text: event.text,
					scope: event.scope,
					streaming: true,
				},
			];
		}
		case "reasoning-start":
			return [
				...blocks,
				{
					id: nextId("reasoning"),
					type: "reasoning",
					text: "",
					scope: event.scope,
					streaming: true,
				},
			];
		case "reasoning-delta": {
			const idx = [...blocks]
				.reverse()
				.findIndex(
					(b) =>
						b.type === "reasoning" &&
						scopeKey(b.scope) === scopeKey(event.scope),
				);
			if (idx === -1) {
				return [
					...blocks,
					{
						id: nextId("reasoning"),
						type: "reasoning",
						text: event.text,
						scope: event.scope,
						streaming: true,
					},
				];
			}
			const realIdx = blocks.length - 1 - idx;
			const block = blocks[realIdx] as Extract<
				TranscriptBlock,
				{ type: "reasoning" }
			>;
			return [
				...blocks.slice(0, realIdx),
				{ ...block, text: block.text + event.text },
				...blocks.slice(realIdx + 1),
			];
		}
		case "reasoning-end":
			return blocks.map((b) =>
				b.type === "reasoning" && scopeKey(b.scope) === scopeKey(event.scope)
					? { ...b, streaming: false }
					: b,
			);
		case "tool-call": {
			/** 关闭工具行展示时，仍经流以更新侧栏，但不写入转写区 */
			if (!toggles.toolCall && event.name === "todo") {
				return blocks;
			}
			const newBlock: TranscriptBlock = {
				id: event.id || nextId("tool"),
				type: "tool",
				scope: event.scope,
				toolName: event.name,
				args: stringifySafe(event.args),
				status: "running",
			};
			return [...blocks, newBlock];
		}
		case "tool-result":
			return blocks.map((b) =>
				b.type === "tool" && b.id === event.id
					? { ...b, status: event.ok ? "ok" : "error", preview: event.preview }
					: b,
			);
		case "subagent-start":
			return [
				...blocks,
				{
					id: nextId("subagent"),
					type: "subagent",
					agentId: event.id,
					status: "running",
				},
			];
		case "subagent-end":
			return blocks.map((b) =>
				b.type === "subagent" && b.agentId === event.id
					? { ...b, status: event.ok ? "ok" : "error", error: event.error }
					: b,
			);
		case "usage": {
			const inTokens = event.inTokens ?? 0;
			const outTokens = event.outTokens ?? 0;
			const total = event.totalTokens ?? 0;
			return [
				...blocks,
				{
					id: nextId("usage"),
					type: "usage",
					input: formatTokens(inTokens),
					output: formatTokens(outTokens),
					total: formatTokens(total),
				},
			];
		}
		case "error":
			return [
				...blocks,
				{ id: nextId("error"), type: "error", message: event.message },
			];
		case "turn-end":
			return blocks.map((b) =>
				b.type === "assistant" || b.type === "reasoning"
					? { ...b, streaming: false }
					: b,
			);
		default:
			return blocks;
	}
};

export const updateTurnStats = (
	turnStats: TurnStats,
	event: UiEvent,
): TurnStats => {
	if (event.kind === "turn-start")
		return { startAtMs: Date.now(), toolCalls: 0 };
	if (event.kind === "tool-call")
		return { ...turnStats, toolCalls: turnStats.toolCalls + 1 };
	return turnStats;
};

export const updateDebugState = (
	debugState: DebugState,
	event: UiEvent,
	assistantText: string,
): DebugState => {
	if (event.kind === "error")
		return event.message === "[aborted]" ? "aborted" : "error";
	if (event.kind === "turn-end") {
		if (debugState === "running") return assistantText ? "done" : "idle";
	}
	return debugState;
};

export const updateUsage = (usage: UsageState, event: UiEvent): UsageState => {
	if (event.kind === "usage") {
		const inTokens = event.inTokens ?? 0;
		const outTokens = event.outTokens ?? 0;
		const total = event.totalTokens ?? 0;
		return { input: inTokens, output: outTokens, total };
	}
	return usage;
};

export const updateTotalUsage = (
	totalUsage: UsageState,
	event: UiEvent,
): UsageState => {
	if (event.kind === "usage") {
		const inTokens = event.inTokens ?? 0;
		const outTokens = event.outTokens ?? 0;
		const total = event.totalTokens ?? 0;
		return {
			input: totalUsage.input + inTokens,
			output: totalUsage.output + outTokens,
			total: totalUsage.total + total,
		};
	}
	return totalUsage;
};

export const resetIdCounter = (): void => {
	nextIdCounter = 1;
};
