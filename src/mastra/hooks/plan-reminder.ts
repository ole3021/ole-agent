import {
	REMINDER_TEXT,
	STEP_ZERO_PRIME,
	todoManager,
} from "../state/todo-manager";

/**
 * Minimal structural view of the `prepareStep` argument. Declared locally to
 * avoid depending on the deep `@mastra/core/dist/loop/types` import path
 * (Mastra doesn't publicly re-export the loop-internal types).
 */
type PrepareStepArgs = {
	stepNumber: number;
	steps?: ReadonlyArray<{
		toolCalls?: ReadonlyArray<{ toolName?: string }>;
	}>;
	messageList: {
		add(messages: string, source: "user"): unknown;
	};
};

/**
 * Build the `prepareStep` callback that keeps the session plan on the model's
 * radar.
 *
 * Called by Mastra before every model call inside a single `stream()` /
 * `generate()` run:
 *   1. Inspect the toolCalls of the previous step (if any).
 *   2. If the agent used the `todo` tool, reset `roundsSinceUpdate`.
 *   3. Otherwise, if it used some other tool, increment the counter.
 *   4. When the counter reaches `PLAN_REMINDER_INTERVAL`, append a user-role
 *      reminder to the current step's message list so the model sees it on
 *      this turn.
 *
 * Pure text steps (no tool calls) are deliberately skipped so "thinking"
 * turns don't trip the reminder. We mutate `messageList` in place and return
 * `undefined` instead of returning `{ messages }` - the latter would demand
 * a fully-formed `MastraDBMessage` (with id/createdAt/structured content),
 * while `messageList.add()` accepts a plain string and handles the rest.
 */
export function createPlanReminderPrepareStep() {
	return (args: PrepareStepArgs): undefined => {
		const steps = args.steps ?? [];
		const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
		if (lastStep) {
			const toolCalls = lastStep.toolCalls ?? [];
			if (toolCalls.length > 0) {
				const usedTodo = toolCalls.some((c) => c.toolName === "todo");
				if (usedTodo) {
					todoManager.markRefreshed();
				} else {
					todoManager.noteNonTodoRound();
				}
			}
		}

		// Step-0 priming: push a high-priority nudge before the model has picked
		// its first tool. Non-Anthropic models often ignore the "always plan
		// first" rule in the system prompt; a short user-role preamble at the
		// start of every turn is much more reliable.
		if (args.stepNumber === 0) {
			args.messageList.add(STEP_ZERO_PRIME, "user");
		} else if (todoManager.shouldRemind()) {
			args.messageList.add(REMINDER_TEXT, "user");
		}
		return undefined;
	};
}
