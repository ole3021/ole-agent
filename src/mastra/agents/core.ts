import { Agent } from "@mastra/core/agent";
import { workspaceRoot } from "../../config/workspace-root";
import { Envs } from "../../util/env";
import { bashTool } from "../tools/bash-tool";

export const coreAgent = new Agent({
	id: "core-agent",
	name: "Core Agent",
	instructions: `You are a coding agent at ${workspaceRoot}. Use bash to inspect and change the workspace. Act first, then report clearly.`,
	model: Envs.MODEL_ID,
	maxRetries: 3,
	tools: { bashTool },
});
