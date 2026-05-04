/**
 * 纯文本「用户 / 助手」轮次：用于 CLI 历史、会话压缩、JSONL 导出等。
 *
 * 这不是 Mastra 的 `MastraDBMessage` / `MessageInput`（可含 tool parts、多段 content 等）；
 * 仅在已归约为单段 string 的场景使用。与模型往返需在边界做映射（见 `session-compact`）。
 */
export type TranscriptMessage = {
	role: "user" | "assistant";
	content: string;
};

/** 本轮用户输入（见 `buildContextMessagesWithUserMessage`） */
export type UserTranscriptMessage = TranscriptMessage & { role: "user" };

/** 本轮助手输出（见 `buildContextMessagesWithAssistantMessage`） */
export type AssistantTranscriptMessage = TranscriptMessage & { role: "assistant" };
