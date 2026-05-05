import type {
	AgentRunEvent,
	AgentRunScope,
} from "../../app/session/agent-run-event";
import type {
	ExecutionRuntimeState as AppExecutionRuntimeState,
	ExecutionTimelineEntry as AppExecutionTimelineEntry,
} from "../../app/session/runtime-state";

export type Scope = AgentRunScope;

export type StreamToggles = {
	reason: boolean;
	toolCall: boolean;
	usage: boolean;
};

export type UiEvent = AgentRunEvent;

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
	| { id: string; type: "usage"; input: string; output: string; total: string }
	| { id: string; type: "system"; text: string };

export type UsageState = {
	input: number;
	output: number;
	total: number;
};

/** 来自 `todo` 工具列表项（与 runtime-reducer 中解析的 status 一致） */
export type AgentTodoStatus =
	| "pending"
	| "in_progress"
	| "completed"
	| "cancelled";

export type AgentTodoItem = {
	id: string;
	label: string;
	status: AgentTodoStatus;
};

export type DebugState = "idle" | "running" | "done" | "aborted" | "error";

export type TurnStats = {
	startAtMs: number | null;
	toolCalls: number;
};

export type ExecutionRuntimeState = AppExecutionRuntimeState;

export type ExecutionTimelineEntry = AppExecutionTimelineEntry;

export interface Command {
	id: string;
	label: string;
	description?: string;
	shortcut?: string;
	onSelect?: () => void;
	group?: string;
}
