import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { coreAgent } from "../mastra/agents/core";
import { handlingStreamResult } from "./helper";

type Role = "user" | "assistant";
type Message = {
	role: Role;
	content: string;
};

export async function runAgentLoop(): Promise<void> {
	const rl = createInterface({ input, output });
	const history: Message[] = [];

	try {
		while (true) {
			const query = await rl.question("\u001B[34m >> \u001B[0m");
			const normalized = query.trim().toLowerCase();
			if (!normalized || normalized === "q" || normalized === "exit") {
				break;
			}

			try {
				history.push({ role: "user", content: query });
				const result = await coreAgent.stream(history);
				const assistantText = await handlingStreamResult(result);
				history.push({ role: "assistant", content: assistantText || "" });
				console.log();
			} catch (error) {
				history.pop();
				const message =
					error instanceof Error ? error.message : "Unknown generation error";
				console.error(`Generate failed: ${message}`);
				console.error("Please retry your prompt.");
				console.log();
			}
		}
	} finally {
		rl.close();
	}
}
