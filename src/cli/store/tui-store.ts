import { create } from "zustand";
import { coreAgent } from "../../mastra/agents/core";
import { Envs } from "../../util/env";
import type { Message, Scope, StreamToggles } from "../events";
import { streamToEvents } from "../stream-bridge";
import {
	applyEvent,
	resetIdCounter,
	updateDebugState,
	updateTodoStats,
	updateTotalUsage,
	updateTurnStats,
	updateUsage,
} from "../ui/lib/stream-processors";
import {
	calcTranscriptTotalLines,
	clamp,
	computeBreakpoints,
} from "../ui/lib/text-utils";

export type TranscriptBlock =
	| { id: string; type: "user"; text: string }
	| {
			id: string;
			type: "assistant";
			text: string;
			scope: Scope;
			streaming: boolean;
	  }
	| {
			id: string;
			type: "reasoning";
			text: string;
			scope: Scope;
			streaming: boolean;
	  }
	| {
			id: string;
			type: "tool";
			scope: Scope;
			toolName: string;
			args: string;
			status: "running" | "ok" | "error";
			preview?: string;
	  }
	| {
			id: string;
			type: "subagent";
			agentId: string;
			status: "running" | "ok" | "error";
			error?: string;
	  }
	| { id: string; type: "error"; message: string }
	| { id: string; type: "usage"; input: string; output: string; total: string };

export type UsageState = {
	input: number;
	output: number;
	total: number;
};

export type TodoStats = {
	pending: number;
	inProgress: number;
	completed: number;
	cancelled: number;
};

export type DebugState = "idle" | "running" | "done" | "aborted" | "error";

export type TurnStats = {
	startAtMs: number | null;
	toolCalls: number;
};

export interface Command {
	id: string;
	label: string;
	description?: string;
	shortcut?: string;
	onSelect?: () => void;
	group?: string;
}

export interface TuiState {
	blocks: TranscriptBlock[];
	scrollOffset: number;
	isStreaming: boolean;
	debugState: DebugState;
	elapsedSec: number;
	usage: UsageState;
	totalUsage: UsageState;
	turnStats: TurnStats;
	todoStats: TodoStats;
	toggles: StreamToggles;
	query: string;
	paletteOpen: boolean;
	commands: Command[];
	cols: number;
	rows: number;
	globalError: string | null;
}

interface TuiActions {
	setQuery: (query: string) => void;
	setScrollOffset: (offset: number) => void;
	setTerminalSize: (cols: number, rows: number) => void;
	setPaletteOpen: (open: boolean) => void;
	registerCommand: (cmd: Command) => void;
	unregisterCommand: (cmdId: string) => void;
	setToggles: (toggles: Partial<StreamToggles>) => void;
	handleKeyInput: (
		input: string,
		key: {
			ctrl?: boolean;
			pageUp?: boolean;
			pageDown?: boolean;
			upArrow?: boolean;
			downArrow?: boolean;
		},
	) => void;
	submit: (query: string) => Promise<void>;
	abort: () => void;
	clear: () => void;
	setGlobalError: (error: string | null) => void;
}

type TuiStore = TuiState & TuiActions;

export const useTuiStore = create<TuiStore>((set, get) => ({
	blocks: [],
	scrollOffset: 0,
	isStreaming: false,
	debugState: "idle",
	elapsedSec: 0,
	usage: { input: 0, output: 0, total: 0 },
	totalUsage: { input: 0, output: 0, total: 0 },
	turnStats: { startAtMs: null, toolCalls: 0 },
	todoStats: { pending: 0, inProgress: 0, completed: 0, cancelled: 0 },
	toggles: {
		reason: Envs.CLI_REASON,
		toolCall: Envs.CLI_TOOL_CALL,
		usage: Envs.CLI_USAGE,
	},
	query: "",
	paletteOpen: false,
	commands: [],
	cols: 80,
	rows: 24,
	globalError: null,

	setQuery: (query) => set({ query }),

	setScrollOffset: (scrollOffset) => set({ scrollOffset }),

	setTerminalSize: (cols, rows) => set({ cols, rows }),

	setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

	registerCommand: (cmd) =>
		set((state) => ({
			commands: state.commands.some((c) => c.id === cmd.id)
				? state.commands.map((c) => (c.id === cmd.id ? cmd : c))
				: [...state.commands, cmd],
		})),

	unregisterCommand: (cmdId) =>
		set((state) => ({
			commands: state.commands.filter((c) => c.id !== cmdId),
		})),

	setToggles: (toggles) =>
		set((state) => ({ toggles: { ...state.toggles, ...toggles } })),

	handleKeyInput: (input, key) => {
		const state = get();
		const bp = computeBreakpoints(state.cols, state.rows);
		const hasSidebar = state.cols >= 90;
		const sidebarWidth = hasSidebar ? 34 : 0;
		const leftCols = Math.max(
			20,
			state.cols - sidebarWidth - (hasSidebar ? 2 : 0),
		);
		const transcriptHeight = Math.max(
			3,
			state.rows - (bp.height === "short" ? 8 : 7),
		);
		const totalLines = calcTranscriptTotalLines(state.blocks, leftCols);
		const maxScrollOffset = Math.max(0, totalLines - transcriptHeight);

		if (key.ctrl && input === "c") {
			if (state.isStreaming) {
				get().abort();
			}
			return;
		}
		if (key.pageUp || key.upArrow) {
			set({ scrollOffset: clamp(state.scrollOffset + 1, 0, maxScrollOffset) });
			return;
		}
		if (key.pageDown || key.downArrow) {
			set({ scrollOffset: clamp(state.scrollOffset - 1, 0, maxScrollOffset) });
			return;
		}
		if (key.ctrl && input === "r") {
			get().setToggles({ reason: !state.toggles.reason });
			return;
		}
		if (key.ctrl && input === "t") {
			get().setToggles({ toolCall: !state.toggles.toolCall });
			return;
		}
		if (key.ctrl && input === "u") {
			get().setToggles({ usage: !state.toggles.usage });
			return;
		}
		if (input === "/" && !state.isStreaming) {
			set({ paletteOpen: true });
		}
	},

	submit: async (rawQuery: string) => {
		const normalized = rawQuery.trim().toLowerCase();
		if (!normalized || normalized === "q" || normalized === "exit") {
			return;
		}

		const { toggles } = get();
		const prevBlocks = get().blocks;
		const history: Message[] = [
			...prevBlocks
				.filter((b) => b.type === "user" || b.type === "assistant")
				.map((b) => ({
					role: b.type as "user" | "assistant",
					content:
						b.type === "assistant" ? b.text : (b as { text: string }).text,
				})),
			{ role: "user", content: rawQuery },
		];

		resetIdCounter();

		set({
			blocks: [
				...prevBlocks,
				{ id: `user-${Date.now()}`, type: "user", text: rawQuery },
			],
			query: "",
			scrollOffset: 0,
			isStreaming: true,
			debugState: "running",
			turnStats: { startAtMs: Date.now(), toolCalls: 0 },
			usage: { input: 0, output: 0, total: 0 },
		});

		const abortController = new AbortController();
		let currentBlocks = [
			...prevBlocks,
			{ id: `user-${Date.now()}`, type: "user", text: rawQuery },
		];
		let currentTurnStats: TurnStats = { startAtMs: Date.now(), toolCalls: 0 };
		let currentDebugState: DebugState = "running";
		let currentUsage: UsageState = { input: 0, output: 0, total: 0 };
		let currentTotalUsage = get().totalUsage;
		let currentTodoStats = get().todoStats;

		let assistantText = "";

		try {
			const stream = await coreAgent.stream(history, {
				abortSignal: abortController.signal,
			});
			for await (const event of streamToEvents(stream, toggles)) {
				currentBlocks = applyEvent(currentBlocks, event);
				currentTurnStats = updateTurnStats(currentTurnStats, event);
				currentDebugState = updateDebugState(
					currentDebugState,
					event,
					assistantText,
				);
				currentUsage = updateUsage(currentUsage, event);
				currentTotalUsage = updateTotalUsage(currentTotalUsage, event);
				currentTodoStats = updateTodoStats(currentTodoStats, event);
				if (event.kind === "text-delta") {
					assistantText += event.text;
				}

				set({
					blocks: currentBlocks,
					turnStats: currentTurnStats,
					debugState: currentDebugState,
					usage: currentUsage,
					totalUsage: currentTotalUsage,
					todoStats: currentTodoStats,
					isStreaming: event.kind !== "turn-end",
					elapsedSec: currentTurnStats.startAtMs
						? Math.floor((Date.now() - currentTurnStats.startAtMs) / 1000)
						: 0,
				});
			}
		} catch (error) {
			currentBlocks = [
				...currentBlocks,
				{
					id: `error-${Date.now()}`,
					type: "error",
					message: error instanceof Error ? error.message : "Unknown error",
				},
			];
			currentDebugState = "error";
			set({
				blocks: currentBlocks,
				debugState: currentDebugState,
				isStreaming: false,
			});
		}
	},

	abort: () => {
		set({ debugState: "aborted", isStreaming: false });
	},

	clear: () =>
		set({
			blocks: [],
			debugState: "idle",
			usage: { input: 0, output: 0, total: 0 },
			totalUsage: { input: 0, output: 0, total: 0 },
			todoStats: { pending: 0, inProgress: 0, completed: 0, cancelled: 0 },
		}),

	setGlobalError: (globalError) => set({ globalError }),
}));

export const useBlocks = () => useTuiStore((s) => s.blocks);
export const useIsStreaming = () => useTuiStore((s) => s.isStreaming);
export const useScrollOffset = () => useTuiStore((s) => s.scrollOffset);
export const useDebugState = () => useTuiStore((s) => s.debugState);
export const useQuery = () => useTuiStore((s) => s.query);
export const usePaletteOpen = () => useTuiStore((s) => s.paletteOpen);
export const useCommands = () => useTuiStore((s) => s.commands);
export const useToggles = () => useTuiStore((s) => s.toggles);
export const useTotalUsage = () => useTuiStore((s) => s.totalUsage);
export const useTurnUsage = () => useTuiStore((s) => s.usage);
export const useTurnStats = () => useTuiStore((s) => s.turnStats);
export const useTodoStats = () => useTuiStore((s) => s.todoStats);
export const useElapsedSec = () => useTuiStore((s) => s.elapsedSec);
export const useTerminalSize = () =>
	useTuiStore((s) => ({ cols: s.cols, rows: s.rows }));
