import type { AgentRunEvent } from "./agent-run-event";

export type TodoItemStatus =
	| "pending"
	| "in_progress"
	| "completed"
	| "cancelled";

export type TodoRuntimeItem = {
	id: string;
	label: string;
	status: TodoItemStatus;
};

export type TodoStatusCounts = {
	pending: number;
	inProgress: number;
	completed: number;
	cancelled: number;
};

export type TodoRuntimeState = {
	pending: number;
	inProgress: number;
	completed: number;
	cancelled: number;
	items: TodoRuntimeItem[];
};

export type ExecutionRuntimeState = {
	thinkingActive: number;
	subagentsRunning: number;
	subagentsCompleted: number;
	subagentsFailed: number;
	lastToolName: string | null;
};

export type ExecutionTimelineEntry = {
	id: string;
	text: string;
};

let timelineSeq = 1;

export function resetExecutionTimelineCounter(): void {
	timelineSeq = 1;
}

export function createEmptyExecutionRuntimeState(): ExecutionRuntimeState {
	return {
		thinkingActive: 0,
		subagentsRunning: 0,
		subagentsCompleted: 0,
		subagentsFailed: 0,
		lastToolName: null,
	};
}

function normalizeTodoStatus(value: unknown): TodoItemStatus {
	if (value === "in_progress") return "in_progress";
	if (value === "completed") return "completed";
	if (value === "cancelled") return "cancelled";
	return "pending";
}

export function maybeExtractTodoStateFromCallArgs(
	args: unknown,
): TodoRuntimeState | null {
	if (!args || typeof args !== "object") {
		return null;
	}
	const obj = args as { items?: unknown; todos?: unknown };
	const list = Array.isArray(obj.items)
		? obj.items
		: Array.isArray(obj.todos)
			? obj.todos
			: null;
	if (!list || list.length === 0) {
		return null;
	}
	const items = list.map((raw, i) => {
		const item = raw as {
			id?: string;
			content?: string;
			title?: string;
			task?: string;
			status?: unknown;
		};
		return {
			id: String(item.id ?? `todo-${i + 1}`),
			label: String(
				item.content ?? item.title ?? item.task ?? `任务 ${i + 1}`,
			).trim(),
			status: normalizeTodoStatus(item.status),
		};
	});
	const counts = countTodoStatuses(items);
	const out: TodoRuntimeState = {
		pending: counts.pending,
		inProgress: counts.inProgress,
		completed: counts.completed,
		cancelled: counts.cancelled,
		items,
	};
	return out;
}

export function countTodoStatuses(
	items: ReadonlyArray<{ status: TodoItemStatus }>,
): TodoStatusCounts {
	const counts: TodoStatusCounts = {
		pending: 0,
		inProgress: 0,
		completed: 0,
		cancelled: 0,
	};
	for (const item of items) {
		if (item.status === "in_progress") counts.inProgress += 1;
		else if (item.status === "completed") counts.completed += 1;
		else if (item.status === "cancelled") counts.cancelled += 1;
		else counts.pending += 1;
	}
	return counts;
}

export function formatTodoCallSummary(state: TodoRuntimeState): string {
	return `todo pending=${state.pending} in_progress=${state.inProgress} completed=${state.completed} cancelled=${state.cancelled}`;
}

export function updateExecutionRuntime(
	runtime: ExecutionRuntimeState,
	event: AgentRunEvent,
): ExecutionRuntimeState {
	if (event.kind === "reasoning-start") {
		return { ...runtime, thinkingActive: runtime.thinkingActive + 1 };
	}
	if (event.kind === "reasoning-end") {
		return {
			...runtime,
			thinkingActive: Math.max(0, runtime.thinkingActive - 1),
		};
	}
	if (event.kind === "tool-call") {
		return { ...runtime, lastToolName: event.name };
	}
	if (event.kind === "subagent-start") {
		return {
			...runtime,
			subagentsRunning: runtime.subagentsRunning + 1,
		};
	}
	if (event.kind === "subagent-end") {
		return {
			...runtime,
			subagentsRunning: Math.max(0, runtime.subagentsRunning - 1),
			subagentsCompleted: runtime.subagentsCompleted + (event.ok ? 1 : 0),
			subagentsFailed: runtime.subagentsFailed + (event.ok ? 0 : 1),
		};
	}
	return runtime;
}

export function appendExecutionTimeline(
	timeline: ExecutionTimelineEntry[],
	event: AgentRunEvent,
	maxEntries = 12,
): ExecutionTimelineEntry[] {
	let next: string | null = null;
	if (event.kind === "reasoning-start") {
		next = "开始思考";
	} else if (event.kind === "reasoning-end") {
		next = "结束思考";
	} else if (event.kind === "tool-call") {
		next = `工具调用: ${event.name}`;
	} else if (event.kind === "tool-result") {
		next = `${event.ok ? "工具成功" : "工具失败"}: ${event.name}`;
	} else if (event.kind === "subagent-start") {
		next = `子代理开始: ${event.id}`;
	} else if (event.kind === "subagent-end") {
		next = `子代理${event.ok ? "完成" : "失败"}: ${event.id}`;
	} else if (event.kind === "error") {
		next = `错误: ${event.message}`;
	}
	if (!next) {
		return timeline;
	}
	const merged = [...timeline, { id: `evt-${timelineSeq++}`, text: next }];
	return merged.length > maxEntries
		? merged.slice(merged.length - maxEntries)
		: merged;
}
