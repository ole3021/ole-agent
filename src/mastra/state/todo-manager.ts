import { color } from "../../cli/style";

export type PlanStatus = "pending" | "in_progress" | "completed";

export interface PlanItem {
	content: string;
	status: PlanStatus;
	activeForm?: string;
}

export interface PlanItemInput {
	content: string;
	status: PlanStatus;
	activeForm?: string;
}

export const PLAN_REMINDER_INTERVAL = 3;
export const MAX_ITEMS = 12;
export const REMINDER_TEXT =
	"<reminder>Refresh your current plan before continuing.</reminder>";
export const STEP_ZERO_PRIME =
	"<system>Planning check: if this request needs two or more tool calls, asks you to analyze/review/explore a project or directory, or touches multiple files, your FIRST tool call MUST be `todo` with the full plan. Otherwise proceed directly.</system>";

const STATUS_MARKERS: Record<PlanStatus, string> = {
	pending: "[ ]",
	in_progress: "[ ]", // TODO: Optimize the in_progress handling
	completed: "[x]",
};

function sameContents(a: PlanItem[], b: PlanItem[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i += 1) {
		if (a[i]?.content !== b[i]?.content) {
			return false;
		}
	}
	return true;
}

/**
 * In-memory session plan. Mirrors the Python `TodoManager` in
 * `s03_todo_write.py`: holds a short list of plan items and a counter tracking
 * how many tool rounds have passed since the plan was last rewritten. The
 * counter is consumed by the `prepareStep` hook to decide whether to nudge
 * the model.
 */
export class TodoManager {
	private items: PlanItem[] = [];
	private roundsSinceUpdate = 0;

	private logPlanCreated(): void {
		const rendered = this.render()
			.split("\n")
			.map((line) => `  ${line}`)
			.join("\n");
		console.log(
			`${color.greenBold}[todo] Plan created (${this.items.length} items):${color.reset}\n${color.green}${rendered}${color.reset}`,
		);
	}

	private logCompletions(previous: PlanItem[]): void {
		const prevByContent = new Map<string, PlanItem>();
		for (const p of previous) {
			prevByContent.set(p.content, p);
		}
		const total = this.items.length;
		for (let i = 0; i < this.items.length; i += 1) {
			const current = this.items[i];
			if (!current || current.status !== "completed") {
				continue;
			}
			const prev = prevByContent.get(current.content);
			if (prev && prev.status !== "completed") {
				console.log(
					`${color.greenBold}[todo] ${STATUS_MARKERS.completed} ${current.content} (${i + 1}/${total})${color.reset}`,
				);
			}
		}
	}

	update(rawItems: PlanItemInput[]): string {
		if (!Array.isArray(rawItems) || rawItems.length === 0) {
			throw new Error("At least one plan item is required");
		}
		if (rawItems.length > MAX_ITEMS) {
			throw new Error(`Keep the session plan short (max ${MAX_ITEMS} items)`);
		}

		const normalized: PlanItem[] = [];
		let inProgress = 0;
		for (let i = 0; i < rawItems.length; i += 1) {
			const raw = rawItems[i];
			const content = (raw?.content ?? "").trim();
			if (!content) {
				throw new Error(`Item ${i}: content required`);
			}
			const status = raw?.status;
			if (
				status !== "pending" &&
				status !== "in_progress" &&
				status !== "completed"
			) {
				throw new Error(`Item ${i}: invalid status '${String(status)}'`);
			}
			if (status === "in_progress") {
				inProgress += 1;
			}
			const activeForm = raw?.activeForm?.trim();
			normalized.push({
				content,
				status,
				...(activeForm ? { activeForm } : {}),
			});
		}
		if (inProgress > 1) {
			throw new Error("Only one plan item can be in_progress");
		}

		const previous = this.items;
		this.items = normalized;
		this.roundsSinceUpdate = 0;

		if (previous.length === 0 || !sameContents(previous, normalized)) {
			this.logPlanCreated();
		} else {
			this.logCompletions(previous);
		}

		return this.render();
	}

	noteNonTodoRound(): void {
		this.roundsSinceUpdate += 1;
	}

	markRefreshed(): void {
		this.roundsSinceUpdate = 0;
	}

	shouldRemind(): boolean {
		return (
			this.items.length > 0 && this.roundsSinceUpdate >= PLAN_REMINDER_INTERVAL
		);
	}

	hasItems(): boolean {
		return this.items.length > 0;
	}

	render(): string {
		if (this.items.length === 0) {
			return "No session plan yet.";
		}
		const lines: string[] = [];
		for (const item of this.items) {
			let line = `${STATUS_MARKERS[item.status]} ${item.content}`;
			if (item.status === "in_progress" && item.activeForm) {
				line += ` (${item.activeForm})`;
			}
			lines.push(line);
		}
		const completed = this.items.filter((i) => i.status === "completed").length;
		lines.push("");
		lines.push(`(${completed}/${this.items.length} completed)`);
		return lines.join("\n");
	}
}

export const todoManager = new TodoManager();
