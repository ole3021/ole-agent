import { Mastra } from "@mastra/core";
import { coreAgent } from "./agents/core";
import { getStartupSkillLogLines } from "../util/skill-startup";
import { createOleAgentWorkspace } from "./workspace-factory";

export const oleAgentWorkspace = createOleAgentWorkspace();

export const mastra = new Mastra({
	workspace: oleAgentWorkspace,
	agents: { coreAgent },
});

let workspaceReady = false;

export async function ensureOleAgentWorkspaceReady(): Promise<void> {
	if (workspaceReady) {
		return;
	}
	await oleAgentWorkspace.init();
	workspaceReady = true;
}

/** 在 workspace 就绪后枚举 skills；供 CLI/TUI 启动日志使用。 */
export async function logStartupSkillsLines(): Promise<string[]> {
	await ensureOleAgentWorkspaceReady();
	return getStartupSkillLogLines(oleAgentWorkspace);
}
