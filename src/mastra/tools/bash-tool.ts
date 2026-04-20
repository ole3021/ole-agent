import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	isWorkspaceRootValid,
	workspaceRoot,
} from "../../config/workspace-root";

const runShell = promisify(exec);
const COMMAND_TIMEOUT_MS = 120_000;
const OUTPUT_LIMIT = 50_000;
const DANGEROUS_FRAGMENTS = [
	"rm -rf /",
	"sudo",
	"shutdown",
	"reboot",
	"> /dev/",
];

export const bashTool = createTool({
	id: "bash",
	description: "Run a shell command in the current workspace.",
	inputSchema: z.object({
		command: z.string().describe("The command to run"),
	}),
	outputSchema: z.object({
		output: z.string(),
	}),
	execute: async ({ command }: { command: string }) => {
		if (DANGEROUS_FRAGMENTS.some((fragment) => command.includes(fragment))) {
			return { output: "Error: Dangerous command blocked" };
		}
		if (!isWorkspaceRootValid()) {
			return {
				output: `Error: Workspace root does not exist: ${workspaceRoot}`,
			};
		}

		try {
			const { stdout, stderr } = await runShell(command, {
				cwd: workspaceRoot,
				timeout: COMMAND_TIMEOUT_MS,
				maxBuffer: OUTPUT_LIMIT * 2,
			});
			const output = `${stdout}${stderr}`.trim();
			return {
				output:
					output.length > 0 ? output.slice(0, OUTPUT_LIMIT) : "(no output)",
			};
		} catch (error) {
			const commandError = error as Error & {
				code?: string | number;
				stdout?: string;
				stderr?: string;
				killed?: boolean;
				signal?: string;
			};

			if (commandError.killed && commandError.signal === "SIGTERM") {
				return { output: "Error: Timeout (120s)" };
			}

			const combinedOutput =
				`${commandError.stdout ?? ""}${commandError.stderr ?? ""}`.trim();
			if (combinedOutput.length > 0) {
				return { output: combinedOutput.slice(0, OUTPUT_LIMIT) };
			}

			return { output: `Error: ${commandError.message}` };
		}
	},
});
