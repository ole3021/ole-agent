import {
	AssistantTranscriptMessage,
	type TranscriptMessage,
	type UserTranscriptMessage,
} from "../types/message";

/** 在本轮助手输出结束后，把前缀与 assistant 合并写回 store。 */
export function buildContextMessagesWithAssistantMessage(
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

/**
 * 组装传给 `coreAgent.stream` 的纯文本列表：若 store 中已有模型前缀（session compact 写入），
 * 则只传 `[前缀, 本轮 user]`，否则传完整 `transcriptMessages` + 本轮 user。
 */
export function buildContextMessagesWithUserMessage(
	transcriptMessages: TranscriptMessage[],
	latestUserMessage: UserTranscriptMessage,
): TranscriptMessage[] {
	const modelPrefix = getTranscriptModelPrefix();
	if (modelPrefix && modelPrefix.length > 0) {
		return [...modelPrefix, latestUserMessage];
	}
	return [...transcriptMessages, latestUserMessage];
}

/**
 * 进程内单会话：存放「折叠/压缩后的、供下一请求拼进模型输入」的 transcript 前缀。
 * 与 Mastra `RequestContext` 解耦；CLI / TUI / `session-compact` 共用。
 */
let modelPrefix: TranscriptMessage[] | null = null;

export function getTranscriptModelPrefix(): TranscriptMessage[] | null {
	if (modelPrefix == null || modelPrefix.length === 0) {
		return null;
	}
	return modelPrefix;
}

export function setTranscriptModelPrefix(
	prefix: TranscriptMessage[] | null,
): void {
	modelPrefix =
		prefix != null && prefix.length > 0 ? prefix.slice() : null;
}

/** 在会改写前缀的 `stream` 之前调用；出错时用 `setTranscriptModelPrefix(snapshot)` 还原。 */
export function captureTranscriptModelPrefixSnapshot(): TranscriptMessage[] | null {
	if (modelPrefix == null || modelPrefix.length === 0) {
		return null;
	}
	return modelPrefix.slice();
}

export function resetTranscriptModelPrefixStore(): void {
	modelPrefix = null;
}
