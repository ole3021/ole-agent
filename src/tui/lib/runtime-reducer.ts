import { maybeExtractTodoStateFromCallArgs } from "../../app/session/runtime-state";
import type {
	AgentTodoItem,
	DebugState,
	TurnStats,
	UiEvent,
	UsageState,
} from "../store/types";

export const updateTodoState = (
	agentTodos: AgentTodoItem[],
	event: UiEvent,
): AgentTodoItem[] => {
	if (event.kind === "tool-call" && event.name === "todo") {
		const parsed = maybeExtractTodoStateFromCallArgs(event.args);
		if (parsed) {
			return parsed.items.map((item) => ({
				id: item.id,
				label: item.label,
				status: item.status,
			}));
		}
	}
	return agentTodos;
};

export const updateTurnStats = (
	turnStats: TurnStats,
	event: UiEvent,
): TurnStats => {
	if (event.kind === "turn-start") {
		return { startAtMs: Date.now(), toolCalls: 0 };
	}
	if (event.kind === "tool-call") {
		return { ...turnStats, toolCalls: turnStats.toolCalls + 1 };
	}
	return turnStats;
};

export const updateDebugState = (
	debugState: DebugState,
	event: UiEvent,
	assistantText: string,
): DebugState => {
	if (event.kind === "error") {
		return event.message === "[aborted]" ? "aborted" : "error";
	}
	if (event.kind === "turn-end" && debugState === "running") {
		return assistantText ? "done" : "idle";
	}
	return debugState;
};

export const updateUsage = (usage: UsageState, event: UiEvent): UsageState => {
	if (event.kind === "usage") {
		return {
			input: event.inTokens ?? 0,
			output: event.outTokens ?? 0,
			total: event.totalTokens ?? 0,
		};
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
