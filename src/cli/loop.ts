import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { coreAgent } from "../mastra/agents/core";
import { ensureOleAgentWorkspaceReady } from "../mastra/index";
import type { AssistantTranscriptMessage, TranscriptMessage, UserTranscriptMessage } from "../types/message";
import {
	buildContextMessagesWithAssistantMessage,
	buildContextMessagesWithUserMessage,
	resetTranscriptModelPrefixStore,
	captureTranscriptModelPrefixSnapshot,
	setTranscriptModelPrefix,
} from "../util/messages";
import { Envs } from "../util/env";
import { formatTokens, renderStream } from "./stream-render";
import { color, tag } from "./style";


export async function runAgentLoop(): Promise<void> {
	const rl = createInterface({ input, output });
	resetTranscriptModelPrefixStore();
	const sessionRequestContext = new RequestContext();
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

			const transcriptModelPrefixSnapshot =
				captureTranscriptModelPrefixSnapshot();
			try {
				await ensureOleAgentWorkspaceReady();
				const latestUserMessage: UserTranscriptMessage = {
					role: "user",
					content: query,
				};
				const contextMessages: TranscriptMessage[] = buildContextMessagesWithUserMessage(
					transcriptMessages,
					latestUserMessage,
				);
				transcriptMessages.push(latestUserMessage);
				const result = await coreAgent.stream(contextMessages, {
					abortSignal: ctrl.signal,
					requestContext: sessionRequestContext,
					onStepFinish: (step) => {
						if (!Envs.CLI_DEBUG_STEP) {
							return;
						}
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
				const assistantText = await renderStream(result);
				const assistantMessage: AssistantTranscriptMessage = { role: "assistant", content: assistantText };
				buildContextMessagesWithAssistantMessage(assistantMessage);
				if (assistantText.length > 0) {
					transcriptMessages.push(assistantMessage);
				}
				console.log();
			} catch (error) {
				const tail = transcriptMessages.at(-1);
				if (tail?.role === "user") {
					transcriptMessages.pop();
				}
				setTranscriptModelPrefix(transcriptModelPrefixSnapshot);
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
