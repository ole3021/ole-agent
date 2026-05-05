import type { TranscriptMessage } from "../../types/message";

/**
 * 单进程会话前缀缓存：存放「压缩/折叠后，供下一请求拼接模型输入」的 transcript 前缀。
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
	modelPrefix = prefix != null && prefix.length > 0 ? prefix.slice() : null;
}

/** 在会改写前缀的 stream 之前调用；出错时可用 restore 还原。 */
export function captureTranscriptModelPrefixSnapshot():
	| TranscriptMessage[]
	| null {
	if (modelPrefix == null || modelPrefix.length === 0) {
		return null;
	}
	return modelPrefix.slice();
}

export function resetTranscriptModelPrefixStore(): void {
	modelPrefix = null;
}
