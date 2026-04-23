import { Agent } from "@mastra/core/agent";
import { workspaceRoot } from "../../config/workspace-root";
import { Envs } from "../../util/env";
import { bashTool } from "../tools/bash";
import { editFileTool } from "../tools/file-edit";
import { readFileTool } from "../tools/file-read";
import { writeFileTool } from "../tools/file-write";

export const coderAgent = new Agent({
	id: "coder-agent",
	name: "Coder Agent",
	description:
		"Isolated code changes in a well-defined area. Use when the task is 'implement X in file Y', 'refactor Z', 'fix the bug in A', or any focused editing work the supervisor wants to keep out of its own context. Returns a summary of files touched, key decisions, and any follow-ups.",
	instructions: `You are a coding subagent at ${workspaceRoot}.
Complete the requested change, then return a compact summary:
- Files touched (relative paths).
- What was changed and why (1-3 bullet points each).
- Verification performed (tests run, type-check, etc.) or reason it was skipped.
- Any follow-ups the supervisor should pick up.
Rules:
- Make reasonable assumptions; do not ask clarifying questions.
- Use edit_file for existing files; write_file for new ones (overwrite:true only when explicitly asked).
- Do NOT narrate progress; act through tools and deliver the summary at the end.`,
	model: Envs.MODEL_ID,
	maxRetries: 3,
	tools: {
		bash: bashTool,
		read_file: readFileTool,
		write_file: writeFileTool,
		edit_file: editFileTool,
	},
	defaultOptions: {
		maxSteps: Envs.AGENT_MAX_STEPS,
	},
});
