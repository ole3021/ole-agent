import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { errorMessage } from "../../util/fs-safety";
import { MAX_ITEMS, todoManager } from "../state/todo-manager";

const planItemSchema = z.object({
	content: z
		.string()
		.min(1)
		.describe("Imperative description of this plan step."),
	status: z
		.enum(["pending", "in_progress", "completed"])
		.describe("Current status of this item."),
	activeForm: z
		.string()
		.optional()
		.describe(
			"Optional present-continuous label shown next to the active item (e.g. 'Writing tests').",
		),
});

const inputSchema = z.object({
	items: z
		.array(planItemSchema)
		.min(1)
		.max(MAX_ITEMS)
		.describe(
			`The complete new plan. Must include every step (pending, in_progress, completed). Keep under ${MAX_ITEMS} items and at most one in_progress.`,
		),
});

const outputSchema = z.object({
	output: z.string(),
});

export const todoTool = createTool({
	id: "todo",
	description:
		"Session plan for multi-step work. Call first for any task needing 2+ tool calls, multi-file changes, or project analysis; skip for single-shot requests. Pass the full updated list every call, keep exactly one item in_progress, and re-call to advance items.",
	inputSchema,
	outputSchema,
	execute: async ({ items }: z.input<typeof inputSchema>) => {
		try {
			return { output: todoManager.update(items) };
		} catch (err) {
			return { output: `Error: ${errorMessage(err)}` };
		}
	},
});
