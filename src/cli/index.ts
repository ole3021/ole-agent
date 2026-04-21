import "../util/env";
import { isWorkspaceRootValid, workspaceRoot } from "../config/workspace-root";
import { runAgentLoop } from "./loop";

if (!isWorkspaceRootValid()) {
	console.error(`Workspace root does not exist: ${workspaceRoot}`);
	process.exit(1);
}

await runAgentLoop();
