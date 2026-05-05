import type {
	AssistantTranscriptMessage,
	TranscriptMessage,
	UserTranscriptMessage,
} from "../../types/message";
import { prepareTranscriptForStream } from "../../util/context-compact";
import {
	getTranscriptModelPrefix,
	setTranscriptModelPrefix,
} from "./transcript-model-prefix-store";

export async function buildContextMessagesWithUserMessage(
	transcriptMessages: TranscriptMessage[],
	latestUserMessage: UserTranscriptMessage,
): Promise<TranscriptMessage[]> {
	const modelPrefix = getTranscriptModelPrefix();
	const usePrefixInput = modelPrefix && modelPrefix.length > 0;
	const inputMessages = usePrefixInput
		? [...modelPrefix, latestUserMessage]
		: [...transcriptMessages, latestUserMessage];

	const { messages: contextMessages, compacted } =
		await prepareTranscriptForStream(inputMessages);

	setTranscriptModelPrefix(
		compacted ? contextMessages : usePrefixInput ? inputMessages : null,
	);

	return contextMessages;
}

export function commitAssistantToContextPrefix(
	assistantMessage: AssistantTranscriptMessage,
): TranscriptMessage[] | null {
	const base = getTranscriptModelPrefix();
	if (!base || base.length === 0) {
		setTranscriptModelPrefix(null);
		return null;
	}
	const next: TranscriptMessage[] =
		assistantMessage.content.length > 0
			? [...base, assistantMessage]
			: [...base];
	setTranscriptModelPrefix(next);
	return next;
}
