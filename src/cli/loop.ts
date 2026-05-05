import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import type { AgentRunEvent } from "../app/session/agent-run-event";
import {
	appendExecutionTimeline,
	createEmptyExecutionRuntimeState,
	formatTodoCallSummary,
	maybeExtractTodoStateFromCallArgs,
	type TodoRuntimeState,
	updateExecutionRuntime,
} from "../app/session/runtime-state";
import { SessionOrchestrator } from "../app/session/session-orchestrator";
import { coreAgent } from "../mastra/agents/core";
import type {
	TranscriptMessage,
	UserTranscriptMessage,
} from "../types/message";
import { Envs } from "../util/env";
import { formatTokens, renderStream } from "./stream-render";
import { color, tag } from "./style";

type TurnAccumulator = {
	usage: { input: number; output: number; total: number };
	toolCalls: number;
	runtime: ReturnType<typeof createEmptyExecutionRuntimeState>;
	timeline: Array<{ id: string; text: string }>;
	onEvent: (event: AgentRunEvent) => void;
};

function createTurnAccumulator(params: {
	totalUsage: { input: number; output: number; total: number };
	onTotalUsage: (usage: {
		input: number;
		output: number;
		total: number;
	}) => void;
	onTodoRuntime: (state: TodoRuntimeState) => void;
}): TurnAccumulator {
	const turn: TurnAccumulator = {
		usage: { input: 0, output: 0, total: 0 },
		toolCalls: 0,
		runtime: createEmptyExecutionRuntimeState(),
		timeline: [],
		onEvent: (event) => {
			turn.runtime = updateExecutionRuntime(turn.runtime, event);
			turn.timeline = appendExecutionTimeline(turn.timeline, event);
			if (event.kind === "tool-call") {
				turn.toolCalls += 1;
				if (event.name === "todo") {
					const parsed = maybeExtractTodoStateFromCallArgs(event.args);
					if (parsed) {
						params.onTodoRuntime(parsed);
					}
				}
			}
			if (event.kind === "usage") {
				turn.usage = {
					input: event.inTokens ?? 0,
					output: event.outTokens ?? 0,
					total: event.totalTokens ?? 0,
				};
				params.onTotalUsage({
					input: params.totalUsage.input + turn.usage.input,
					output: params.totalUsage.output + turn.usage.output,
					total: params.totalUsage.total + turn.usage.total,
				});
			}
		},
	};
	return turn;
}

export async function runAgentLoop(): Promise<void> {
	const rl = createInterface({ input, output });
	const sessionOrchestrator = new SessionOrchestrator();
	sessionOrchestrator.resetSession();
	let totalUsage = { input: 0, output: 0, total: 0 };
	let todoRuntime: TodoRuntimeState | null = null;
	/** 完整本地逐字 transcript（每轮追加）；经 `buildContextMessagesWithUserMessage` 得到可能含压缩/前缀折叠的 `contextMessages` 再传给模型 */
	const transcriptMessages: TranscriptMessage[] = [];

	console.log(
		`${color.cyan}Hint: Ctrl+C to cancel current turn, "q" or Ctrl+D to exit.${color.reset}`,
	);

	try {
		while (true) {
			const query = await rl.question(color.promptPrefix);
			const normalized = query.trim().toLowerCase();
			if (!normalized || normalized === "q" || normalized === "exit") {
				break;
			}

			const ctrl = new AbortController();
			const onSigint = () => ctrl.abort();
			process.once("SIGINT", onSigint);
			let transcriptModelPrefixSnapshot: TranscriptMessage[] | null = null;

			try {
				const turn = createTurnAccumulator({
					totalUsage,
					onTotalUsage: (nextTotal) => {
						totalUsage = nextTotal;
					},
					onTodoRuntime: (state) => {
						todoRuntime = state;
					},
				});
				const latestUserMessage: UserTranscriptMessage = {
					role: "user",
					content: query,
				};
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
				transcriptMessages.push(latestUserMessage);
				const result = await coreAgent.stream(contextMessages, {
					abortSignal: ctrl.signal,
					requestContext,
					onStepFinish: (step) => {
						const s = step as {
							request?: { body?: { model?: string; temperature?: number } };
							finishReason?: string;
							toolCalls: ReadonlyArray<{ payload: { toolName: string } }>;
							usage: {
								inputTokens?: number;
								outputTokens?: number;
								totalTokens?: number;
							};
						};
						const body = s.request?.body ?? {};
						if (!Envs.CLI_DEBUG_STEP) {
							return;
						}
						// TODO: Optimize log output to CLI and TUI
						console.log();
						console.log(
							`${color.magenta}${tag.step}${body.model ?? "unknown"}${body.temperature !== undefined ? ` >> temperature: ${body.temperature}` : ""} ${color.reset}`,
						);
						console.log(
							`${color.magenta}${tag.step}${s.finishReason}${s.toolCalls.length > 0 ? ` >> toolCalls: ${s.toolCalls.map((t) => t.payload.toolName).join(",")}` : ""} ${color.reset}`,
						);
						console.log(
							`${color.magenta}${tag.step}in=${formatTokens(s.usage.inputTokens)} out=${formatTokens(s.usage.outputTokens)} tot=${formatTokens(s.usage.totalTokens)} ${color.reset}`,
						);
					},
				} as AgentExecutionOptionsBase<unknown>);
				const assistantText = await renderStream(result, {
					onEvent: turn.onEvent,
				});
				sessionOrchestrator.commitAssistantText(assistantText);
				if (assistantText.length > 0) {
					transcriptMessages.push({
						role: "assistant",
						content: assistantText,
					});
				}
				if (todoRuntime) {
					console.log(
						`${color.cyan}${tag.stat}${formatTodoCallSummary(todoRuntime)}${color.reset}`,
					);
				}
				console.log(`${color.cyan}${tag.stat}turn summary${color.reset}`);
				console.log(
					`  tools=${turn.toolCalls} thinking=${turn.runtime.thinkingActive} subagents(run/ok/fail)=${turn.runtime.subagentsRunning}/${turn.runtime.subagentsCompleted}/${turn.runtime.subagentsFailed}`,
				);
				if (turn.runtime.lastToolName) {
					console.log(`  lastTool=${turn.runtime.lastToolName}`);
				}
				console.log(
					`  usage turn(in/out/tot)=${formatTokens(turn.usage.input)}/${formatTokens(turn.usage.output)}/${formatTokens(turn.usage.total)} total=${formatTokens(totalUsage.total)}`,
				);
				if (turn.timeline.length > 0) {
					console.log("  recent events:");
					for (const entry of turn.timeline.slice(-5)) {
						console.log(`    - ${entry.text}`);
					}
				}
				console.log();
			} catch (error) {
				const tail = transcriptMessages.at(-1);
				if (tail?.role === "user") {
					transcriptMessages.pop();
				}
				sessionOrchestrator.restoreSnapshot(transcriptModelPrefixSnapshot);
				if (
					ctrl.signal.aborted ||
					(error instanceof Error && error.name === "AbortError")
				) {
					console.log(`\n${color.cyan}[aborted]${color.reset}`);
				} else {
					const message =
						error instanceof Error ? error.message : "Unknown generation error";
					console.error(`Generate failed: ${message}`);
					console.error("Please retry your prompt.");
				}
				console.log();
			} finally {
				process.off("SIGINT", onSigint);
			}
		}
	} finally {
		rl.close();
	}
}
