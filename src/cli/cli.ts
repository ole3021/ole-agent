import { isWorkspaceRootValid, workspaceRoot } from "../config/workspace-root";
import { logStartupSkillsLines } from "../mastra/index";
import { runAgentLoop } from "./loop";
import { color } from "./style";

if (!isWorkspaceRootValid()) {
	console.error(`Workspace root does not exist: ${workspaceRoot}`);
	process.exit(1);
}

for (const line of await logStartupSkillsLines()) {
	console.log(`${color.cyan}${line}${color.reset}`);
}
console.log();

await runAgentLoop();
