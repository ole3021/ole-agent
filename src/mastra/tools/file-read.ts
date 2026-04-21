import { readFile } from "node:fs/promises";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	assertRegularFile,
	errorMessage,
	looksBinary,
	MAX_LINES_DEFAULT,
	MAX_OUTPUT_CHARS,
	MAX_READ_BYTES,
	resolveSafePath,
} from "../../util/fs-safety";

const inputSchema = z.object({
	path: z.string().describe("Workspace-relative path of the file to read."),
	offset: z
		.number()
		.int()
		.min(1)
		.optional()
		.describe("1-based line number to start reading from."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(20_000)
		.optional()
		.describe(
			`Maximum number of lines to return (defaults to ${MAX_LINES_DEFAULT}).`,
		),
});

const outputSchema = z.object({
	output: z.string(),
});

export const readFileTool = createTool({
	id: "read_file",
	description:
		"Read a UTF-8 text file from the workspace. Safely refuses symlinks, binary files, protected paths (.git, .env*, node_modules, .ssh), and files larger than 2MB. Supports line-based pagination via offset/limit.",
	inputSchema,
	outputSchema,
	execute: async ({ path, offset, limit }: z.input<typeof inputSchema>) => {
		try {
			const resolved = await resolveSafePath(path);
			if (!resolved.exists) {
				return { output: `Error: File not found: ${resolved.relativeToRoot}` };
			}

			const size = await assertRegularFile(resolved.absolute);
			if (size > MAX_READ_BYTES) {
				return {
					output: `Error: File too large to read (${size} bytes > ${MAX_READ_BYTES} byte limit): ${resolved.relativeToRoot}`,
				};
			}

			const buf = await readFile(resolved.absolute);
			if (looksBinary(buf)) {
				return {
					output: `Error: Refusing to read binary file: ${resolved.relativeToRoot}`,
				};
			}

			const text = buf.toString("utf8");
			const lines = text.split("\n");
			const totalLines = lines.length;

			const startIdx = Math.max(0, (offset ?? 1) - 1);
			const maxLines = limit ?? MAX_LINES_DEFAULT;
			const endIdx = Math.min(totalLines, startIdx + maxLines);

			let slice = lines.slice(startIdx, endIdx).join("\n");
			const truncatedLines = endIdx < totalLines;

			if (slice.length > MAX_OUTPUT_CHARS) {
				slice = `${slice.slice(0, MAX_OUTPUT_CHARS)}\n... (output truncated at ${MAX_OUTPUT_CHARS} chars)`;
			} else if (truncatedLines) {
				slice = `${slice}\n... (${totalLines - endIdx} more line${totalLines - endIdx === 1 ? "" : "s"})`;
			}

			return { output: slice };
		} catch (err) {
			return { output: `Error: ${errorMessage(err)}` };
		}
	},
});
