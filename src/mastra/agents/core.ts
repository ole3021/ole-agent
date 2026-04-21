import { Agent } from "@mastra/core/agent";
import { workspaceRoot } from "../../config/workspace-root";
import { Envs } from "../../util/env";
import { bashTool } from "../tools/bash";
import { editFileTool } from "../tools/file-edit";
import { readFileTool } from "../tools/file-read";
import { writeFileTool } from "../tools/file-write";

export const coreAgent = new Agent({
	id: "core-agent",
	name: "Core Agent",
	instructions: `You are a coding agent at ${workspaceRoot}. Prefer the dedicated file tools (read_file, write_file, edit_file) for file operations and use bash for everything else. Act first, then report clearly.`,
	model: Envs.MODEL_ID,
	maxRetries: 3,
	tools: { bashTool, readFileTool, writeFileTool, editFileTool },
});
