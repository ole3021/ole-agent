import { create } from "zustand";
import { createEmptyExecutionRuntimeState } from "../../app/session/runtime-state";
import type { UserTranscriptMessage } from "../../types/message";
import { Envs } from "../../util/env";
import {
	resetAgentSessionContext,
	runAgentTurn,
} from "../services/agent-turn.service";
import type {
	AgentTodoItem,
	Command,
	DebugState,
	ExecutionRuntimeState,
	ExecutionTimelineEntry,
	StreamToggles,
	TranscriptBlock,
	TurnStats,
	UsageState,
} from "./types";

let runAbort: AbortController | null = null;

export type {
	AgentTodoItem,
	AgentTodoStatus,
	Command,
	DebugState,
	Scope,
	StreamToggles,
	TranscriptBlock,
	TurnStats,
	UiEvent,
	UsageState,
} from "./types";

export interface TuiState {
	/** 聊天记录区块（消息、AI 输出、系统提示等） */
	blocks: TranscriptBlock[];
	/** 聊天区内容垂直滚动的偏移量（行数，0 代表底部） */
	scrollOffset: number;
	/** 当前是否处于 AI 回复/代理执行流式状态 */
	isStreaming: boolean;
	/** 调试相关状态机，表明当前 agent 运行阶段 */
	debugState: DebugState;
	/** 当前对话轮次已用时（单位：秒） */
	elapsedSec: number;
	/** 本轮会话消耗的 token 统计 */
	usage: UsageState;
	/** 累计会话总消耗的 token 统计（跨轮次） */
	totalUsage: UsageState;
	/** 本轮 agent 回合状态（起始时间、工具调用次数等） */
	turnStats: TurnStats;
	/** 当前「todo」工具写回的任务项（侧栏） */
	agentTodos: AgentTodoItem[];
	/** 当前回合中的执行状态摘要（thinking/子代理/最近工具） */
	executionRuntime: ExecutionRuntimeState;
	/** 最近关键执行事件时间线（常驻） */
	executionTimeline: ExecutionTimelineEntry[];
	/** 各类流/显示开关（Reason/toolCall/usage） */
	toggles: StreamToggles;
	/** 当前 query 输入框内容 */
	query: string;
	/** 每次成功发起提交时递增，用于驱动输入框受控重挂载、可靠清空 */
	inputResetEpoch: number;
	/** 是否打开全局命令面板 */
	paletteOpen: boolean;
	/** 注册的全局命令列表（用于 palette 和快捷键） */
	commands: Command[];
	/** 终端列数（宽度；供布局响应式使用） */
	cols: number;
	/** 终端行数（高度；供布局响应式使用） */
	rows: number;
	/** 全局错误信息（弹窗/提示用）；null 表示无错误 */
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
	/**
	 * OpenTUI: scroll, Ctrl+C, and Ctrl+D are handled in `useTuiKeyboard`.
	 * This keeps toggle shortcuts (Ctrl+R/T/U) and `/` for the command palette.
	 */
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
	agentTodos: [],
	executionRuntime: createEmptyExecutionRuntimeState(),
	executionTimeline: [],
	toggles: {
		reason: Envs.CLI_REASON,
		toolCall: Envs.CLI_TOOL_CALL,
		usage: Envs.CLI_USAGE,
	},
	query: "",
	inputResetEpoch: 0,
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
		const latestUserMessage: UserTranscriptMessage = {
			role: "user",
			content: rawQuery,
		};

		const userId = `user-${Date.now()}`;
		set((s) => ({
			blocks: [...prevBlocks, { id: userId, type: "user", text: rawQuery }],
			query: "",
			inputResetEpoch: s.inputResetEpoch + 1,
			scrollOffset: 0,
			isStreaming: true,
			debugState: "running",
			turnStats: { startAtMs: Date.now(), toolCalls: 0 },
			usage: { input: 0, output: 0, total: 0 },
			globalError: null,
			agentTodos: [],
			executionRuntime: createEmptyExecutionRuntimeState(),
			executionTimeline: [],
		}));

		const abortController = new AbortController();
		runAbort = abortController;

		const initialBlocks: TranscriptBlock[] = [
			...prevBlocks,
			{ id: userId, type: "user", text: rawQuery },
		];
		const totalUsageStart = get().totalUsage;
		const {
			agentTodos: agentTodosStart,
			executionRuntime: executionRuntimeStart,
			executionTimeline: executionTimelineStart,
		} = get();

		try {
			await runAgentTurn({
				blocksBeforeTurn: prevBlocks,
				latestUserMessage,
				toggles,
				initialBlocks,
				totalUsage: totalUsageStart,
				agentTodos: agentTodosStart,
				executionRuntime: executionRuntimeStart,
				executionTimeline: executionTimelineStart,
				signal: abortController.signal,
				onProgress: (p) =>
					set((state) => {
						return { ...state, ...p };
					}),
			});
		} finally {
			if (runAbort === abortController) {
				runAbort = null;
			}
		}
	},

	abort: () => {
		runAbort?.abort();
		runAbort = null;
		set({ debugState: "aborted", isStreaming: false });
	},

	clear: () => {
		resetAgentSessionContext();
		set((state) => ({
			blocks: state.blocks.filter((b) => b.type === "system"),
			debugState: "idle",
			usage: { input: 0, output: 0, total: 0 },
			totalUsage: { input: 0, output: 0, total: 0 },
			agentTodos: [],
			executionRuntime: createEmptyExecutionRuntimeState(),
			executionTimeline: [],
		}));
	},

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
export const useTerminalSize = () =>
	useTuiStore((s) => ({ cols: s.cols, rows: s.rows }));
