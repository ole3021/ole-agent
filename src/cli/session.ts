import { coreAgent } from "../mastra/agents/core";
import type { Message, StreamToggles, UiEvent } from "./events";
import { streamToEvents } from "./stream-bridge";

export class AgentSession {
	private readonly history: Message[] = [];
	private currentAbort?: AbortController;

	abortCurrentTurn(): void {
		this.currentAbort?.abort();
	}

	async *runTurn(
		query: string,
		toggles: StreamToggles,
	): AsyncGenerator<UiEvent> {
		this.history.push({ role: "user", content: query });
		const abortController = new AbortController();
		this.currentAbort = abortController;

		try {
			const stream = await coreAgent.stream(this.history, {
				abortSignal: abortController.signal,
			});

			let finalAssistantText = "";
			for await (const event of streamToEvents(stream, toggles)) {
				if (event.kind === "turn-end") {
					finalAssistantText = event.assistantText;
				}
				yield event;
			}

			if (finalAssistantText.length > 0) {
				this.history.push({ role: "assistant", content: finalAssistantText });
			}
		} catch (error) {
			this.history.pop();
			if (
				abortController.signal.aborted ||
				(error instanceof Error && error.name === "AbortError")
			) {
				yield { kind: "error", message: "[aborted]" };
				yield { kind: "turn-end", assistantText: "" };
				return;
			}
			const message =
				error instanceof Error ? error.message : "Unknown generation error";
			yield { kind: "error", message: `Generate failed: ${message}` };
			yield { kind: "turn-end", assistantText: "" };
		} finally {
			if (this.currentAbort === abortController) {
				this.currentAbort = undefined;
			}
		}
	}
}
