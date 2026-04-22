import { Agent } from "@mastra/core/agent";
import { workspaceRoot } from "../../config/workspace-root";
import { Envs } from "../../util/env";
import { createPlanReminderPrepareStep } from "../hooks/plan-reminder";
import { bashTool } from "../tools/bash";
import { editFileTool } from "../tools/file-edit";
import { readFileTool } from "../tools/file-read";
import { writeFileTool } from "../tools/file-write";
import { todoTool } from "../tools/todo";

export const coreAgent = new Agent({
	id: "core-agent",
	name: "Core Agent",
	instructions: `You are a coding agent at ${workspaceRoot}.
Tools: \`todo\`, \`bash\`, \`read_file\`, \`write_file\`, \`edit_file\`. Prefer the dedicated file tools for file ops; use \`bash\` for everything else.
For multi-step work (2+ tool calls, multi-file changes, project analysis), call \`todo\` first with the full plan, then keep it updated as items complete. Skip it for single-shot requests.
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
	},
});
