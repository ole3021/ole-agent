import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Envs } from "../util/env";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const workspaceRoot =
	Envs.WORKSPACE_ROOT?.trim() || resolve(moduleDir, "../..");

export function isWorkspaceRootValid(): boolean {
	return existsSync(workspaceRoot);
}
