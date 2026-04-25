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
