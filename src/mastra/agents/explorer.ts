import { Agent } from "@mastra/core/agent";
import { workspaceRoot } from "../../config/workspace-root";
import { Envs } from "../../util/env";
import { bashTool } from "../tools/bash";
import { readFileTool } from "../tools/file-read";

export const explorerAgent = new Agent({
	id: "explorer-agent",
	name: "Explorer Agent",
	description:
		"Read-only exploration of the workspace. Use for 'find where X is defined', 'summarize this directory', 'list usages of Y', or any investigation that produces noisy tool traffic (many file reads, greps, shell listings). Returns a concise textual summary with file:line references. Does NOT modify files.",
	instructions: `You are a read-only exploration subagent at ${workspaceRoot}.
You may use \`skill\` / \`skill_read\` / \`skill_search\` for packaged instructions; use \`bash\` and \`read_file\` for the project (no writes).

Investigate the task end-to-end using bash and read_file, then return a concise summary:
- Key findings (bullet points with file:line references).
- Relevant code excerpts when useful (<=10 lines each).
- Any unresolved questions or caveats.
Rules:
- Do NOT modify files. No write_file, no edit_file, no destructive bash.
- Do NOT ask clarifying questions — make reasonable assumptions and proceed.
- Do NOT narrate progress; act through tools and deliver the summary at the end.`,
	model: Envs.MODEL_ID,
	maxRetries: 3,
	tools: {
		bash: bashTool,
		read_file: readFileTool,
	},
	defaultOptions: {
		maxSteps: Envs.AGENT_MAX_STEPS,
	},
});
