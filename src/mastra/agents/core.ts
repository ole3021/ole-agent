import { Agent } from "@mastra/core/agent";
import { workspaceRoot } from "../../config/workspace-root";
import { Envs } from "../../util/env";
import { createPlanReminderPrepareStep } from "../hooks/plan-reminder";
import { bashTool } from "../tools/bash";
import { editFileTool } from "../tools/file-edit";
import { readFileTool } from "../tools/file-read";
import { writeFileTool } from "../tools/file-write";
import { todoTool } from "../tools/todo";
import { coderAgent } from "./coder";
import { explorerAgent } from "./explorer";

// How many trailing parent messages to forward to a subagent. Mastra's default
// is to pass the full conversation; we keep a small tail so the subagent sees
// just enough recent supervisor context to disambiguate its delegation prompt
// without dragging the whole history.
const SUBAGENT_CONTEXT_TAIL = 3;

export const coreAgent = new Agent({
	id: "core-agent",
	name: "Core Agent",
	instructions: `You are a coding supervisor at ${workspaceRoot}.

Direct tools: \`todo\`, \`bash\`, \`read_file\`, \`write_file\`, \`edit_file\`.

Subagents (delegate via their agent id; intermediate reasoning / tool traffic streams live under a yellow :S: marker):
- \`explorer-agent\`: read-only exploration, search, summarization. Use when you need many file reads / greps / shell listings whose intermediate traffic would pollute the main thread. Returns a concise summary.
- \`coder-agent\`: isolated code changes in a well-defined area. Use when you have a clearly scoped edit / refactor / bugfix to execute. Returns a summary of changes.

Delegation strategy:
1. Small and local? Use tools directly; do not delegate.
2. Noisy exploration (grep/list/read many files)? Delegate to \`explorer-agent\` first and act on its summary.
3. Well-scoped implementation step? Delegate to \`coder-agent\` and integrate its summary.
4. Only delegate pieces whose intermediate tool traffic is not worth carrying in the main thread.

Planning: for multi-step work (2+ tool calls, multi-file changes, project analysis) call \`todo\` FIRST with the full plan, then keep it updated. Skip \`todo\` for single-shot requests.

Act through tools; don't narrate progress in prose.`,
	model: Envs.MODEL_ID,
	maxRetries: 3,
	tools: {
		todo: todoTool,
		bash: bashTool,
		read_file: readFileTool,
		write_file: writeFileTool,
		edit_file: editFileTool,
	},
	agents: { explorerAgent, coderAgent },
	// Applied to every `stream()` / `generate()` call, including those issued by
	// the `mastra dev` Playground. Per-call options (e.g. CLI's explicit
	// `maxSteps`) still win, but the Playground has no such override so these
	// become the effective defaults there.
	//
	// `maxSteps` is critical: Mastra's built-in loop default is `stepCountIs(5)`,
	// which cuts off any multi-step investigation after five tool rounds.
	defaultOptions: {
		prepareStep: createPlanReminderPrepareStep(),
		maxSteps: Envs.AGENT_MAX_STEPS,
		delegation: {
			// Trim each subagent's input to the trailing N parent messages.
			// Mastra forwards the full supervisor conversation by default; we
			// opt for a small tail so the subagent gets the current intent
			// without the whole history. The delegation `prompt` is always
			// sent separately, so returning a short tail is safe.
			messageFilter: ({ messages }) => messages.slice(-SUBAGENT_CONTEXT_TAIL),
		},
	},
});
