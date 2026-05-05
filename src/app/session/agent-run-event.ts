export type AgentRunScope = "main" | { sub: string };

export type AgentRunEvent =
	| { kind: "turn-start" }
	| { kind: "text-delta"; scope: AgentRunScope; text: string }
	| { kind: "reasoning-start"; scope: AgentRunScope; id: string }
	| { kind: "reasoning-delta"; scope: AgentRunScope; id: string; text: string }
	| { kind: "reasoning-end"; scope: AgentRunScope; id: string }
	| {
			kind: "tool-call";
			scope: AgentRunScope;
			id: string;
			name: string;
			args: unknown;
	  }
	| {
			kind: "tool-result";
			scope: AgentRunScope;
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
