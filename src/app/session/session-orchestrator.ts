import { RequestContext } from "@mastra/core/request-context";
import { ensureOleAgentWorkspaceReady } from "../../mastra/index";
import type {
	AssistantTranscriptMessage,
	TranscriptMessage,
	UserTranscriptMessage,
} from "../../types/message";
import {
	buildContextMessagesWithUserMessage,
	commitAssistantToContextPrefix,
} from "./context-builder";
import { resetExecutionTimelineCounter } from "./runtime-state";
import {
	captureTranscriptModelPrefixSnapshot,
	resetTranscriptModelPrefixStore,
	setTranscriptModelPrefix,
} from "./transcript-model-prefix-store";

export type PreparedSessionTurn = {
	contextMessages: TranscriptMessage[];
	transcriptModelPrefixSnapshot: TranscriptMessage[] | null;
	requestContext: RequestContext;
};

export class SessionOrchestrator {
	private requestContext = new RequestContext();

	resetSession(): void {
		this.requestContext = new RequestContext();
		resetTranscriptModelPrefixStore();
		resetExecutionTimelineCounter();
	}

	async prepareTurn(params: {
		transcriptMessagesBeforeTurn: TranscriptMessage[];
		latestUserMessage: UserTranscriptMessage;
	}): Promise<PreparedSessionTurn> {
		await ensureOleAgentWorkspaceReady();
		const { transcriptMessagesBeforeTurn, latestUserMessage } = params;
		const transcriptModelPrefixSnapshot =
			captureTranscriptModelPrefixSnapshot();
		const contextMessages = await buildContextMessagesWithUserMessage(
			transcriptMessagesBeforeTurn,
			latestUserMessage,
		);
		return {
			contextMessages,
			transcriptModelPrefixSnapshot,
			requestContext: this.requestContext,
		};
	}

	commitAssistantText(assistantText: string): void {
		const assistantMessage: AssistantTranscriptMessage = {
			role: "assistant",
			content: assistantText,
		};
		commitAssistantToContextPrefix(assistantMessage);
	}

	restoreSnapshot(snapshot: TranscriptMessage[] | null): void {
		setTranscriptModelPrefix(snapshot);
	}
}
