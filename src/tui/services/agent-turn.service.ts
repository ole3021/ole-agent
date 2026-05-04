import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { coreAgent } from "../../mastra/agents/core";
import { ensureOleAgentWorkspaceReady } from "../../mastra/index";
import type { TranscriptMessage, UserTranscriptMessage } from "../../types/message";
import {
	buildContextMessagesWithAssistantMessage,
	buildContextMessagesWithUserMessage,
	captureTranscriptModelPrefixSnapshot,
	resetTranscriptModelPrefixStore,
	setTranscriptModelPrefix,
} from "../../util/messages";
import { blocksToTranscriptMessages } from "../lib/blocks-to-transcript";
import { streamToEvents } from "../lib/stream-bridge";
import {
	applyEvent,
	resetIdCounter,
	updateDebugState,
	updateTodoState,
	updateTotalUsage,
	updateTurnStats,
	updateUsage,
} from "../lib/stream-processors";
import type {
	AgentTodoItem,
	DebugState,
	StreamToggles,
	TodoStats,
	TranscriptBlock,
	TurnStats,
	UsageState,
} from "../store/types";
import { isAbortError } from "./abort-error";

let sessionRequestContext = new RequestContext();

export const resetAgentSessionContext = (): void => {
	sessionRequestContext = new RequestContext();
	resetTranscriptModelPrefixStore();
};

export type TurnProgress = {
	blocks: TranscriptBlock[];
	turnStats: TurnStats;
	debugState: DebugState;
	usage: UsageState;
	totalUsage: UsageState;
	todoStats: TodoStats;
	agentTodos: AgentTodoItem[];
	isStreaming: boolean;
	elapsedSec: number;
};

export const runAgentTurn = async (params: {
	/** 提交前 UI 上的 blocks；由本函数派生 `TranscriptMessage[]`（仅 user/assistant） */
	blocksBeforeTurn: TranscriptBlock[];
	latestUserMessage: UserTranscriptMessage;
	toggles: StreamToggles;
	initialBlocks: TranscriptBlock[];
	totalUsage: UsageState;
	todoStats: TodoStats;
	agentTodos: AgentTodoItem[];
	signal: AbortSignal;
	onProgress: (p: TurnProgress) => void;
}): Promise<"complete" | "aborted" | "error"> => {
	const {
		blocksBeforeTurn,
		latestUserMessage,
		toggles,
		initialBlocks,
		totalUsage: totalUsageStart,
		todoStats: todoStatsStart,
		agentTodos: agentTodosStart,
		signal,
		onProgress,
	} = params;

	resetIdCounter();

	let currentBlocks: TranscriptBlock[] = initialBlocks;
	let currentTurnStats: TurnStats = { startAtMs: Date.now(), toolCalls: 0 };
	let currentDebugState: DebugState = "running";
	let currentUsage: UsageState = { input: 0, output: 0, total: 0 };
	let currentTotalUsage = totalUsageStart;
	let currentTodoStats = todoStatsStart;
	let currentAgentTodos = agentTodosStart;
	let assistantText = "";

	let transcriptModelPrefixSnapshot: TranscriptMessage[] | null = null;
	try {
		await ensureOleAgentWorkspaceReady();
		const transcriptMessages = blocksToTranscriptMessages(blocksBeforeTurn);
		const contextMessages = buildContextMessagesWithUserMessage(
			transcriptMessages,
			latestUserMessage,
		);
		transcriptModelPrefixSnapshot = captureTranscriptModelPrefixSnapshot();
		const stream = await coreAgent.stream(contextMessages, {
			abortSignal: signal,
			requestContext: sessionRequestContext,
		} as AgentExecutionOptionsBase<unknown>);
		for await (const event of streamToEvents(stream, toggles, signal)) {
			currentBlocks = applyEvent(currentBlocks, event, toggles);
			currentTurnStats = updateTurnStats(currentTurnStats, event);
			currentDebugState = updateDebugState(
				currentDebugState,
				event,
				assistantText,
			);
			currentUsage = updateUsage(currentUsage, event);
			currentTotalUsage = updateTotalUsage(currentTotalUsage, event);
			({ todoStats: currentTodoStats, agentTodos: currentAgentTodos } =
				updateTodoState(currentTodoStats, currentAgentTodos, event));
			if (event.kind === "text-delta") {
				assistantText += event.text;
			}

			onProgress({
				blocks: currentBlocks,
				turnStats: currentTurnStats,
				debugState: currentDebugState,
				usage: currentUsage,
				totalUsage: currentTotalUsage,
				todoStats: currentTodoStats,
				agentTodos: currentAgentTodos,
				isStreaming: event.kind !== "turn-end",
				elapsedSec: currentTurnStats.startAtMs
					? Math.floor((Date.now() - currentTurnStats.startAtMs) / 1000)
					: 0,
			});
		}
		if (signal.aborted) {
			setTranscriptModelPrefix(transcriptModelPrefixSnapshot);
			onProgress({
				blocks: currentBlocks,
				turnStats: currentTurnStats,
				debugState: "aborted",
				usage: currentUsage,
				totalUsage: currentTotalUsage,
				todoStats: currentTodoStats,
				agentTodos: currentAgentTodos,
				isStreaming: false,
				elapsedSec: currentTurnStats.startAtMs
					? Math.floor((Date.now() - currentTurnStats.startAtMs) / 1000)
					: 0,
			});
			return "aborted";
		}
		buildContextMessagesWithAssistantMessage({
			role: "assistant",
			content: assistantText,
		});
		return "complete";
	} catch (error) {
		if (isAbortError(error) || signal.aborted) {
			setTranscriptModelPrefix(transcriptModelPrefixSnapshot);
			onProgress({
				blocks: currentBlocks,
				turnStats: currentTurnStats,
				debugState: "aborted",
				usage: currentUsage,
				totalUsage: currentTotalUsage,
				todoStats: currentTodoStats,
				agentTodos: currentAgentTodos,
				isStreaming: false,
				elapsedSec: currentTurnStats.startAtMs
					? Math.floor((Date.now() - currentTurnStats.startAtMs) / 1000)
					: 0,
			});
			return "aborted";
		}

		setTranscriptModelPrefix(transcriptModelPrefixSnapshot);
		currentBlocks = [
			...currentBlocks,
			{
				id: `error-${Date.now()}`,
				type: "error",
				message: error instanceof Error ? error.message : "Unknown error",
			},
		];
		currentDebugState = "error";
		onProgress({
			blocks: currentBlocks,
			turnStats: currentTurnStats,
			debugState: currentDebugState,
			usage: currentUsage,
			totalUsage: currentTotalUsage,
			todoStats: currentTodoStats,
			agentTodos: currentAgentTodos,
			isStreaming: false,
			elapsedSec: currentTurnStats.startAtMs
				? Math.floor((Date.now() - currentTurnStats.startAtMs) / 1000)
				: 0,
		});
		return "error";
	}
};
