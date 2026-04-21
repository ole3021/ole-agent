import { readFile } from "node:fs/promises";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	assertRegularFile,
	assertTextContent,
	atomicWriteFile,
	errorMessage,
	looksBinary,
	MAX_READ_BYTES,
	MAX_WRITE_BYTES,
	resolveSafePath,
} from "../../util/fs-safety";

const inputSchema = z.object({
	path: z.string().describe("Workspace-relative path of the file to edit."),
	oldText: z
		.string()
		.min(1)
		.describe(
			"Exact text to replace. Must appear verbatim in the file. When replaceAll is false (default), must appear exactly once.",
		),
	newText: z
		.string()
		.describe("Replacement text. May be an empty string to delete oldText."),
	replaceAll: z
		.boolean()
		.default(false)
		.describe("If true, replace every occurrence of oldText."),
});

const outputSchema = z.object({
	output: z.string(),
});

function countOccurrences(haystack: string, needle: string): number {
	if (needle.length === 0) {
		return 0;
	}
	let count = 0;
	let from = 0;
	while (true) {
		const idx = haystack.indexOf(needle, from);
		if (idx === -1) {
			break;
		}
		count += 1;
		from = idx + needle.length;
	}
	return count;
}

export const editFileTool = createTool({
	id: "edit_file",
	description:
		"Replace exact text in an existing UTF-8 file via atomic write. Refuses symlinks, binary files, and protected paths. When replaceAll is false, oldText must match exactly one location (ambiguous edits are rejected).",
	inputSchema,
	outputSchema,
	execute: async ({
		path,
		oldText,
		newText,
		replaceAll = false,
	}: z.input<typeof inputSchema>) => {
		try {
			assertTextContent(oldText, "oldText");
			assertTextContent(newText, "newText");

			if (oldText === newText) {
				return { output: "Error: oldText and newText are identical" };
			}

			const resolved = await resolveSafePath(path);
			if (!resolved.exists) {
				return {
					output: `Error: File not found: ${resolved.relativeToRoot}`,
				};
			}

			const size = await assertRegularFile(resolved.absolute);
			if (size > MAX_READ_BYTES) {
				return {
					output: `Error: File too large to edit (${size} bytes > ${MAX_READ_BYTES} byte limit): ${resolved.relativeToRoot}`,
				};
			}

			const buf = await readFile(resolved.absolute);
			if (looksBinary(buf)) {
				return {
					output: `Error: Refusing to edit binary file: ${resolved.relativeToRoot}`,
				};
			}

			const original = buf.toString("utf8");
			const occurrences = countOccurrences(original, oldText);
			if (occurrences === 0) {
				return {
					output: `Error: oldText not found in ${resolved.relativeToRoot}`,
				};
			}
			if (!replaceAll && occurrences > 1) {
				return {
					output: `Error: oldText appears ${occurrences} times in ${resolved.relativeToRoot}. Provide more context to make it unique, or pass replaceAll: true.`,
				};
			}

			const updated = replaceAll
				? original.split(oldText).join(newText)
				: original.replace(oldText, newText);

			if (updated === original) {
				return { output: "Error: Edit produced no changes" };
			}

			const nextSize = Buffer.byteLength(updated, "utf8");
			if (nextSize > MAX_WRITE_BYTES) {
				return {
					output: `Error: Resulting file too large (${nextSize} bytes > ${MAX_WRITE_BYTES} byte limit)`,
				};
			}

			await atomicWriteFile(resolved.absolute, updated);

			const replaced = replaceAll ? occurrences : 1;
			return {
				output: `Edited ${resolved.relativeToRoot} (${replaced} replacement${replaced === 1 ? "" : "s"})`,
			};
		} catch (err) {
			return { output: `Error: ${errorMessage(err)}` };
		}
	},
});
