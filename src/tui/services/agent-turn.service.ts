import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import {
	appendExecutionTimeline,
	updateExecutionRuntime,
} from "../../app/session/runtime-state";
import { SessionOrchestrator } from "../../app/session/session-orchestrator";
import {
	isAgentRunEventVisible,
	streamToAgentRunEvents,
} from "../../app/session/stream-to-events";
import { coreAgent } from "../../mastra/agents/core";
import type {
	TranscriptMessage,
	UserTranscriptMessage,
} from "../../types/message";
import { applyEvent, resetIdCounter } from "../lib/block-reducer";
import { blocksToTranscriptMessages } from "../lib/blocks-to-transcript";
import {
	updateDebugState,
	updateTodoState,
	updateTotalUsage,
	updateTurnStats,
	updateUsage,
} from "../lib/runtime-reducer";
import type {
	AgentTodoItem,
	DebugState,
	ExecutionRuntimeState,
	ExecutionTimelineEntry,
	StreamToggles,
	TranscriptBlock,
	TurnStats,
	UsageState,
} from "../store/types";
import { isAbortError } from "./abort-error";

const sessionOrchestrator = new SessionOrchestrator();

export const resetAgentSessionContext = (): void => {
	sessionOrchestrator.resetSession();
};

export type TurnProgress = {
	blocks: TranscriptBlock[];
	turnStats: TurnStats;
	debugState: DebugState;
	usage: UsageState;
	totalUsage: UsageState;
	agentTodos: AgentTodoItem[];
	executionRuntime: ExecutionRuntimeState;
	executionTimeline: ExecutionTimelineEntry[];
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
	agentTodos: AgentTodoItem[];
	executionRuntime: ExecutionRuntimeState;
	executionTimeline: ExecutionTimelineEntry[];
	signal: AbortSignal;
	onProgress: (p: TurnProgress) => void;
}): Promise<"complete" | "aborted" | "error"> => {
	const {
		blocksBeforeTurn,
		latestUserMessage,
		toggles,
		initialBlocks,
		totalUsage: totalUsageStart,
		agentTodos: agentTodosStart,
		executionRuntime: executionRuntimeStart,
		executionTimeline: executionTimelineStart,
		signal,
		onProgress,
	} = params;

	resetIdCounter();

	let currentBlocks: TranscriptBlock[] = initialBlocks;
	let currentTurnStats: TurnStats = { startAtMs: Date.now(), toolCalls: 0 };
	let currentDebugState: DebugState = "running";
	let currentUsage: UsageState = { input: 0, output: 0, total: 0 };
	let currentTotalUsage = totalUsageStart;
	let currentAgentTodos = agentTodosStart;
	let currentExecutionRuntime = executionRuntimeStart;
	let currentExecutionTimeline = executionTimelineStart;
	let assistantText = "";

	const emitProgressSnapshot = (
		debugState: DebugState,
		isStreaming: boolean,
	) => {
		onProgress({
			blocks: currentBlocks,
			turnStats: currentTurnStats,
			debugState,
			usage: currentUsage,
			totalUsage: currentTotalUsage,
			agentTodos: currentAgentTodos,
			executionRuntime: currentExecutionRuntime,
			executionTimeline: currentExecutionTimeline,
			isStreaming,
			elapsedSec: currentTurnStats.startAtMs
				? Math.floor((Date.now() - currentTurnStats.startAtMs) / 1000)
				: 0,
		});
	};

	let transcriptModelPrefixSnapshot: TranscriptMessage[] | null = null;
	try {
		const transcriptMessages = blocksToTranscriptMessages(blocksBeforeTurn);
		const prepared = await sessionOrchestrator.prepareTurn({
			transcriptMessagesBeforeTurn: transcriptMessages,
			latestUserMessage,
		});
		const {
			contextMessages,
			transcriptModelPrefixSnapshot: snapshot,
			requestContext,
		} = prepared;
		transcriptModelPrefixSnapshot = snapshot;
		const stream = await coreAgent.stream(contextMessages, {
			abortSignal: signal,
			requestContext,
		} as AgentExecutionOptionsBase<unknown>);
		for await (const event of streamToAgentRunEvents(stream, signal)) {
			if (isAgentRunEventVisible(event, toggles)) {
				currentBlocks = applyEvent(currentBlocks, event);
			}
			currentTurnStats = updateTurnStats(currentTurnStats, event);
			currentDebugState = updateDebugState(
				currentDebugState,
				event,
				assistantText,
			);
			currentUsage = updateUsage(currentUsage, event);
			currentTotalUsage = updateTotalUsage(currentTotalUsage, event);
			currentExecutionRuntime = updateExecutionRuntime(
				currentExecutionRuntime,
				event,
			);
			currentExecutionTimeline = appendExecutionTimeline(
				currentExecutionTimeline,
				event,
			);
			currentAgentTodos = updateTodoState(currentAgentTodos, event);
			if (event.kind === "text-delta") {
				assistantText += event.text;
			}

			emitProgressSnapshot(currentDebugState, event.kind !== "turn-end");
		}
		if (signal.aborted) {
			sessionOrchestrator.restoreSnapshot(transcriptModelPrefixSnapshot);
			emitProgressSnapshot("aborted", false);
			return "aborted";
		}
		sessionOrchestrator.commitAssistantText(assistantText);
		return "complete";
	} catch (error) {
		if (isAbortError(error) || signal.aborted) {
			sessionOrchestrator.restoreSnapshot(transcriptModelPrefixSnapshot);
			emitProgressSnapshot("aborted", false);
			return "aborted";
		}

		sessionOrchestrator.restoreSnapshot(transcriptModelPrefixSnapshot);
		currentBlocks = [
			...currentBlocks,
			{
				id: `error-${Date.now()}`,
				type: "error",
				message: error instanceof Error ? error.message : "Unknown error",
			},
		];
		currentDebugState = "error";
		emitProgressSnapshot(currentDebugState, false);
		return "error";
	}
};
