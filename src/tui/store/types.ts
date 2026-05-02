export type Message = {
	role: "user" | "assistant";
	content: string;
};

export type Scope = "main" | { sub: string };

export type StreamToggles = {
	reason: boolean;
	toolCall: boolean;
	usage: boolean;
};

export type UiEvent =
	| { kind: "turn-start" }
	| { kind: "text-delta"; scope: Scope; text: string }
	| { kind: "reasoning-start"; scope: Scope; id: string }
	| { kind: "reasoning-delta"; scope: Scope; id: string; text: string }
	| { kind: "reasoning-end"; scope: Scope; id: string }
	| { kind: "tool-call"; scope: Scope; id: string; name: string; args: unknown }
	| {
			kind: "tool-result";
			scope: Scope;
			id: string;
			name: string;
			ok: boolean;
			preview?: string;
	  }
	| { kind: "subagent-start"; id: string }
	| { kind: "subagent-end"; id: string; ok: boolean; error?: string }
	| {
			kind: "usage";
			inTokens?: number;
			outTokens?: number;
			totalTokens?: number;
	  }
	| { kind: "error"; message: string }
	| { kind: "turn-end"; assistantText: string };

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

export type TodoStats = {
	pending: number;
	inProgress: number;
	completed: number;
	cancelled: number;
};

/** 来自 `todo` 工具列表项（与 stream-processors 中解析的 status 一致） */
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

export interface Command {
	id: string;
	label: string;
	description?: string;
	shortcut?: string;
	onSelect?: () => void;
	group?: string;
}
