import type { MastraModelOutput } from "@mastra/core/stream";
import { Envs } from "../util/env";
import {
	formatSkillToolCallSummary,
	formatSkillToolResultPreview,
	isMastraSkillTool,
} from "../util/skill-log-format";
import { color, tag } from "./style";

export const formatTokens = (n: number | undefined): string => {
	if (n === undefined || !Number.isFinite(n)) {
		return "-";
	}
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
};

type FullStreamChunk = { type: string; payload?: unknown };

type ToolCallPayload = { toolName?: string; args?: unknown };
type ToolResultPayload = { toolName?: string; result?: unknown };
type ToolErrorPayload = { toolName?: string; error?: unknown };
type ReasoningPayload = { id?: string; text?: string };

type EnvelopePayload = {
	toolName?: string;
	toolCallId?: string;
	output?: FullStreamChunk;
};

/** Mastra 将子代理块包在 `tool-output` 里；`toolName` 形如 `agent-<id>` */
const SUBAGENT_TOOL_PREFIX = "agent-" as const;

function isSubagentToolName(toolName: string): boolean {
	return toolName.startsWith(SUBAGENT_TOOL_PREFIX);
}

function subagentIdFromToolName(toolName: string): string {
	return toolName.slice(SUBAGENT_TOOL_PREFIX.length);
}

/**
 * 将 Mastra `fullStream` 写到 stdout，并归约出 supervisor 最终可见文本（子代理流式文本不落盘到返回值）。
 */
class CliStreamRenderer {
	private readonly stream: MastraModelOutput<unknown>;
	private readonly reader: ReadableStreamDefaultReader<unknown>;
	private readonly reasoningIds = new Set<string>();

	private assistantText = "";
	private hasOpenMetaLine = false;
	private hasTextOutput = false;
	private metaBodyColor: string = color.cyan;
	private textLineNeedsPrefix = true;
	private linePrefix = "";
	private isSubagentStream = false;

	constructor(stream: MastraModelOutput<unknown>) {
		this.stream = stream;
		this.reader = stream.fullStream.getReader();
	}

	async drain(): Promise<string> {
		await this.runMainLoop();
		this.closeOpenMeta();
		this.flushPendingTextLine();

		const [finalText] = await Promise.all([
			this.stream.text,
			this.stream.finishReason,
		]);
		if (this.assistantText.length === 0 && finalText) {
			this.writeAssistantText(finalText);
			this.assistantText = finalText;
			process.stdout.write("\n");
			this.hasTextOutput = false;
		}

		if (Envs.CLI_USAGE) {
			console.log();
			const usage = await this.stream.usage;
			console.log(
				`${color.cyan}${tag.stat}usage in=${formatTokens(usage.inputTokens)} out=${formatTokens(usage.outputTokens)} tot=${formatTokens(usage.totalTokens)}`,
			);
		}

		if (this.assistantText.length === 0) {
			console.log("[No response]");
		}
		return this.assistantText;
	}

	private async runMainLoop(): Promise<void> {
		while (true) {
			const { done, value } = await this.reader.read();
			if (done) {
				break;
			}
			const chunk = value as FullStreamChunk;
			const payload = (chunk.payload ?? {}) as EnvelopePayload;

			if (this.tryHandleSubagentDelegationOpen(chunk, payload)) {
				continue;
			}
			if (this.tryHandleSubagentDelegationClose(chunk, payload)) {
				continue;
			}
			if (this.tryHandleSubagentToolOutput(chunk, payload)) {
				continue;
			}

			this.handleChunk(chunk);
		}
	}

	/** 1) Supervisor 发起 `agent-*` 委派 */
	private tryHandleSubagentDelegationOpen(
		chunk: FullStreamChunk,
		payload: EnvelopePayload,
	): boolean {
		if (
			chunk.type !== "tool-call" ||
			typeof payload.toolName !== "string" ||
			!isSubagentToolName(payload.toolName)
		) {
			return false;
		}
		const subId = subagentIdFromToolName(payload.toolName);
		this.handleChunk(chunk);
		this.withLinePrefix(this.subagentLinePrefix(subId), () => {
			this.isSubagentStream = true;
			this.printMeta(tag.sub, "start ", color.yellow);
			this.isSubagentStream = false;
		});
		return true;
	}

	/** 2) 委派结束（成功或父级 tool-error） */
	private tryHandleSubagentDelegationClose(
		chunk: FullStreamChunk,
		payload: EnvelopePayload,
	): boolean {
		if (
			(chunk.type !== "tool-result" && chunk.type !== "tool-error") ||
			typeof payload.toolName !== "string" ||
			!isSubagentToolName(payload.toolName)
		) {
			return false;
		}
		const subId = subagentIdFromToolName(payload.toolName);
		this.withLinePrefix(this.subagentLinePrefix(subId), () => {
			this.isSubagentStream = true;
			if (chunk.type === "tool-error") {
				const err = (chunk.payload as ToolErrorPayload | undefined)?.error;
				this.printMeta(
					tag.error,
					`delegation failed: ${String(err)} `,
					color.yellow,
				);
			} else {
				this.printMeta(tag.sub, "end ", color.yellow);
			}
			this.isSubagentStream = false;
		});
		return true;
	}

	/** 3) 子代理内部块经 `tool-output` 解包后复用 `handleChunk` */
	private tryHandleSubagentToolOutput(
		chunk: FullStreamChunk,
		payload: EnvelopePayload,
	): boolean {
		if (
			chunk.type !== "tool-output" ||
			typeof payload.toolName !== "string" ||
			!isSubagentToolName(payload.toolName)
		) {
			return false;
		}
		const inner = payload.output;
		if (!inner) {
			return false;
		}
		const subId = subagentIdFromToolName(payload.toolName);
		this.withLinePrefix(this.subagentLinePrefix(subId), () => {
			this.isSubagentStream = true;
			this.handleChunk(inner);
			this.isSubagentStream = false;
		});
		return true;
	}

	private subagentLinePrefix(agentId: string): string {
		return `${color.yellow}${tag.sub}${agentId} ${color.reset}`;
	}

	private withLinePrefix(prefix: string, fn: () => void): void {
		const prev = this.linePrefix;
		this.linePrefix = prefix;
		try {
			fn();
		} finally {
			this.linePrefix = prev;
		}
	}

	private flushPendingTextLine(): void {
		if (this.hasTextOutput) {
			process.stdout.write("\n");
			this.hasTextOutput = false;
		}
	}

	private beginMetaLine(tagStr: string, bodyColor: string): void {
		this.flushPendingTextLine();
		this.metaBodyColor = bodyColor;
		process.stdout.write(`${this.linePrefix}${bodyColor}${tagStr}`);
		this.hasOpenMetaLine = true;
	}

	private endMetaLine(): void {
		process.stdout.write(`${color.reset}\n`);
		this.hasOpenMetaLine = false;
	}

	private writeMetaDelta(text: string): void {
		if (!this.linePrefix) {
			process.stdout.write(text);
			return;
		}
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				process.stdout.write(
					`${color.reset}\n${this.linePrefix}${this.metaBodyColor}`,
				);
			}
			process.stdout.write(parts[i]);
		}
	}

	private printMeta(tagStr: string, body: string, bodyColor: string): void {
		this.beginMetaLine(tagStr, bodyColor);
		this.writeMetaDelta(body);
		this.endMetaLine();
	}

	private writeAssistantText(text: string): void {
		if (this.hasOpenMetaLine) {
			this.endMetaLine();
			this.textLineNeedsPrefix = true;
		}
		if (!this.linePrefix) {
			process.stdout.write(text);
			this.hasTextOutput = true;
			return;
		}
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i > 0) {
				process.stdout.write("\n");
				this.textLineNeedsPrefix = true;
			}
			if (part.length > 0) {
				if (this.textLineNeedsPrefix) {
					process.stdout.write(this.linePrefix);
					this.textLineNeedsPrefix = false;
				}
				process.stdout.write(part);
			}
		}
		if (text.endsWith("\n")) {
			this.textLineNeedsPrefix = true;
		}
		this.hasTextOutput = true;
	}

	private closeOpenMeta(): void {
		if (this.hasOpenMetaLine) {
			this.endMetaLine();
		}
	}

	private handleChunk(chunk: FullStreamChunk): void {
		switch (chunk.type) {
			case "reasoning-start":
				this.onReasoningStart(chunk.payload as ReasoningPayload | undefined);
				break;
			case "reasoning-delta":
				this.onReasoningDelta(chunk.payload as ReasoningPayload | undefined);
				break;
			case "reasoning-end":
				this.onReasoningEnd(chunk.payload as ReasoningPayload | undefined);
				break;
			case "tool-call":
				this.onToolCall(chunk.payload as ToolCallPayload | undefined);
				break;
			case "tool-result":
				this.onToolResult(chunk.payload as ToolResultPayload | undefined);
				break;
			case "tool-error":
				this.onToolError(chunk.payload as ToolErrorPayload | undefined);
				break;
			case "error":
				this.onStreamError(chunk.payload as { error?: unknown } | undefined);
				break;
			case "text-delta":
				this.onTextDelta(chunk.payload as { text?: string } | undefined);
				break;
			default:
				break;
		}
	}

	private onReasoningStart(payload: ReasoningPayload | undefined): void {
		if (!Envs.CLI_REASON) {
			return;
		}
		const id = String(payload?.id ?? "");
		if (id) {
			this.reasoningIds.add(id);
		}
		this.beginMetaLine(tag.reason, color.cyan);
	}

	private onReasoningDelta(payload: ReasoningPayload | undefined): void {
		if (!Envs.CLI_REASON) {
			return;
		}
		const id = String(payload?.id ?? "");
		if (!id || this.reasoningIds.has(id)) {
			this.writeMetaDelta(String(payload?.text ?? ""));
		}
	}

	private onReasoningEnd(payload: ReasoningPayload | undefined): void {
		if (!Envs.CLI_REASON) {
			return;
		}
		const id = String(payload?.id ?? "");
		if (id) {
			this.reasoningIds.delete(id);
		}
		this.endMetaLine();
	}

	private onToolCall(payload: ToolCallPayload | undefined): void {
		const toolName = String(payload?.toolName ?? "?");
		if (isMastraSkillTool(toolName)) {
			this.printMeta(
				tag.skill,
				`${toolName} >> ${formatSkillToolCallSummary(toolName, payload?.args)} `,
				color.yellow,
			);
			return;
		}
		if (Envs.CLI_TOOL_CALL) {
			this.printMeta(
				tag.tool,
				`call: ${toolName} >> ${JSON.stringify(payload?.args ?? {})} `,
				color.cyan,
			);
		}
	}

	private onToolResult(payload: ToolResultPayload | undefined): void {
		const toolName = String(payload?.toolName ?? "?");
		if (isMastraSkillTool(toolName)) {
			this.printMeta(
				tag.skill,
				`${toolName} >> ${formatSkillToolResultPreview(toolName, payload?.result)} `,
				color.yellow,
			);
			return;
		}
		if (Envs.CLI_TOOL_CALL) {
			this.printMeta(tag.tool, `result: ${toolName} `, color.cyan);
		}
	}

	private onToolError(payload: ToolErrorPayload | undefined): void {
		const toolName = String(payload?.toolName ?? "?");
		if (isMastraSkillTool(toolName)) {
			this.printMeta(
				tag.skill,
				`${toolName} error >> ${String(payload?.error)} `,
				color.yellow,
			);
			return;
		}
		this.printMeta(
			tag.error,
			`tool: ${toolName} >> ${String(payload?.error)} `,
			color.cyan,
		);
	}

	private onStreamError(payload: { error?: unknown } | undefined): void {
		this.printMeta(tag.error, `stream: ${String(payload?.error)} `, color.cyan);
	}

	private onTextDelta(payload: { text?: string } | undefined): void {
		const text = String(payload?.text ?? "");
		this.writeAssistantText(text);
		if (!this.isSubagentStream) {
			this.assistantText += text;
		}
	}
}

export const renderStream = async (
	stream: MastraModelOutput<unknown>,
): Promise<string> => {
	const renderer = new CliStreamRenderer(stream);
	return renderer.drain();
};
