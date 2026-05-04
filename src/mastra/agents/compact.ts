import { Agent } from "@mastra/core/agent";
import { Envs } from "../../util/env";

/**
 * 仅用于「长上下文摘要」的独立 Agent：无工具、无委派、无 plan-reminder，
 */
export const contextCompactAgent = new Agent({
	id: "context-compact-agent",
	name: "Context Compact Agent",
	instructions: `You only summarize prior agent-user conversation so work can continue in a smaller context.
Preserve in your output (use clear sections or bullets):
1. The current goal
2. Important findings and decisions
3. Files read or changed (paths when known)
4. Remaining work
5. User constraints and preferences
Be compact but concrete. Do not call tools. Output plain text only.`,
	model: (Envs.COMPACT_MODEL_ID ?? Envs.MODEL_ID) as string,
	maxRetries: 1,
	defaultOptions: {
		maxSteps: 1,
	},
});
