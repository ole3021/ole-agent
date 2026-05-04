import type { TranscriptMessage } from "../../types/message";
import type { TranscriptBlock } from "../store/types";

/**
 * 将 TUI 展示用的 transcript 块转为发给模型的纯文本轮次（仅 user / assistant）。
 * reasoning、tool、subagent、system 等块不参与模型上下文。
 */
export function blocksToTranscriptMessages(
	blocks: TranscriptBlock[],
): TranscriptMessage[] {
	const out: TranscriptMessage[] = [];
	for (const b of blocks) {
		if (b.type === "user") {
			out.push({ role: "user", content: b.text });
		} else if (b.type === "assistant") {
			out.push({ role: "assistant", content: b.text });
		}
	}
	return out;
}
