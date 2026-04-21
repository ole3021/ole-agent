import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { coreAgent } from "../mastra/agents/core";
import { Envs } from "../util/env";
import { formatTokens, renderStream } from "./stream-render";
import { color, tag } from "./style";

type Message = {
	role: "user" | "assistant";
	content: string;
};

export async function runAgentLoop(): Promise<void> {
	const rl = createInterface({ input, output });
	const history: Message[] = [];

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

			try {
				history.push({ role: "user", content: query });
				const result = await coreAgent.stream(history, {
					maxSteps: Envs.CLI_MAX_STEPS,
					abortSignal: ctrl.signal,
					onStepFinish: (step) => {
						if (!Envs.CLI_DEBUG_STEP) {
							return;
						}
						const body = (step.request?.body ?? {}) as {
							model?: string;
							temperature?: number;
						};
						console.log();
						console.log(
							`${color.magenta}${tag.step}${body.model ?? "unknown"}${body.temperature !== undefined ? ` >> temperature: ${body.temperature}` : ""} ${color.reset}`,
						);
						console.log(
							`${color.magenta}${tag.step}${step.finishReason}${step.toolCalls.length > 0 ? ` >> toolCalls: ${step.toolCalls.map((t) => t.payload.toolName).join(",")}` : ""} ${color.reset}`,
						);
						console.log(
							`${color.magenta}${tag.step}in=${formatTokens(step.usage.inputTokens)} out=${formatTokens(step.usage.outputTokens)} tot=${formatTokens(step.usage.totalTokens)} ${color.reset}`,
						);
					},
				});
				const assistantText = await renderStream(result);
				if (assistantText.length > 0) {
					history.push({ role: "assistant", content: assistantText });
				}
				console.log();
			} catch (error) {
				history.pop();
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
