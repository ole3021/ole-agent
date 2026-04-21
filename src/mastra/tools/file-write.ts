import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	assertRegularFile,
	assertTextContent,
	atomicWriteFile,
	errorMessage,
	MAX_WRITE_BYTES,
	resolveSafePath,
} from "../../util/fs-safety";

const inputSchema = z.object({
	path: z
		.string()
		.describe("Workspace-relative path of the file to create or overwrite."),
	content: z.string().describe("UTF-8 text content to write."),
	overwrite: z
		.boolean()
		.default(false)
		.describe(
			"Must be true to replace an existing file. Defaults to false so accidental overwrites are rejected.",
		),
});

const outputSchema = z.object({
	output: z.string(),
});

export const writeFileTool = createTool({
	id: "write_file",
	description:
		"Write UTF-8 text to a file in the workspace with atomic replace (tmp file + rename). Refuses symlinks, binary content, protected paths (.git, .env*, node_modules, .ssh), and content larger than 2MB. Requires explicit `overwrite: true` to replace existing files.",
	inputSchema,
	outputSchema,
	execute: async ({
		path,
		content,
		overwrite = false,
	}: z.input<typeof inputSchema>) => {
		try {
			assertTextContent(content);

			const byteLength = Buffer.byteLength(content, "utf8");
			if (byteLength > MAX_WRITE_BYTES) {
				return {
					output: `Error: Content too large (${byteLength} bytes > ${MAX_WRITE_BYTES} byte limit)`,
				};
			}

			const resolved = await resolveSafePath(path);
			let replacing = false;
			if (resolved.exists) {
				await assertRegularFile(resolved.absolute);
				if (!overwrite) {
					return {
						output: `Error: File exists at ${resolved.relativeToRoot}. Pass overwrite: true to replace it.`,
					};
				}
				replacing = true;
			}

			await atomicWriteFile(resolved.absolute, content);

			return {
				output: `${replacing ? "Overwrote" : "Created"} ${resolved.relativeToRoot} (${byteLength} bytes)`,
			};
		} catch (err) {
			return { output: `Error: ${errorMessage(err)}` };
		}
	},
});
