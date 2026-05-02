import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalFilesystem, Workspace } from "@mastra/core/workspace";
import { workspaceRoot } from "../config/workspace-root";

const mastraDir = dirname(fileURLToPath(import.meta.url));

export const agentSkillsDir = join(mastraDir, "skills");

export const projectDotSkillsDir = join(workspaceRoot, "skills");

export function createOleAgentWorkspace(): Workspace {
	const skillPaths: string[] = [agentSkillsDir];
	if (existsSync(projectDotSkillsDir)) {
		skillPaths.push(projectDotSkillsDir);
	}

	return new Workspace({
		name: "ole-agent-workspace",
		filesystem: new LocalFilesystem({ basePath: workspaceRoot }),
		skills: skillPaths,
		tools: {
			enabled: false,
		},
	});
}
