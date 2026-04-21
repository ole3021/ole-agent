import type { MastraModelOutput } from "@mastra/core/stream";
import { Envs } from "../util/env";
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

export const renderStream = async (
	stream: MastraModelOutput<unknown>,
): Promise<string> => {
	const reader = stream.fullStream.getReader();
	const reasoningIds = new Set<string>();
	let assistantText = "";
	let hasOpenMetaLine = false;
	let hasTextOutput = false;

	const startMetaLine = (prefix: string): void => {
		if (hasTextOutput) {
			process.stdout.write("\n");
			hasTextOutput = false;
		}
		process.stdout.write(`${color.cyan}${prefix}`);
		hasOpenMetaLine = true;
	};

	const endMetaLine = (): void => {
		process.stdout.write(`${color.reset}\n`);
		hasOpenMetaLine = false;
	};

	const printMeta = (prefix: string, body: string): void => {
		startMetaLine(`${prefix}${body}`);
		endMetaLine();
	};

	const writeText = (text: string): void => {
		if (hasOpenMetaLine) {
			endMetaLine();
		}
		process.stdout.write(text);
		hasTextOutput = true;
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		switch (value.type) {
			case "reasoning-start":
				if (Envs.CLI_REASON) {
					reasoningIds.add(value.payload.id);
					startMetaLine(tag.reason);
				}
				break;
			case "reasoning-delta":
				if (Envs.CLI_REASON && reasoningIds.has(value.payload.id)) {
					process.stdout.write(value.payload.text);
				}
				break;
			case "reasoning-end":
				if (Envs.CLI_REASON && reasoningIds.has(value.payload.id)) {
					reasoningIds.delete(value.payload.id);
					endMetaLine();
				}
				break;
			case "tool-call":
				if (Envs.CLI_TOOL_CALL) {
					printMeta(
						tag.tool,
						`call: ${value.payload.toolName} >> ${JSON.stringify(value.payload.args)} `,
					);
				}
				break;
			case "tool-result":
				if (Envs.CLI_TOOL_CALL) {
					printMeta(tag.tool, `result: ${value.payload.toolName} `);
				}
				break;
			case "tool-error":
				printMeta(
					tag.error,
					`tool: ${value.payload.toolName} >> ${String(value.payload.error)} `,
				);
				break;
			case "error":
				printMeta(tag.error, `stream: ${String(value.payload.error)} `);
				break;
			case "text-delta":
				writeText(value.payload.text);
				assistantText += value.payload.text;
				break;
			default:
				break;
		}
	}

	if (hasOpenMetaLine) {
		endMetaLine();
	}
	if (hasTextOutput) {
		process.stdout.write("\n");
		hasTextOutput = false;
	}

	const [finalText, finishReason] = await Promise.all([
		stream.text,
		stream.finishReason,
	]);
	if (assistantText.length === 0 && finalText) {
		writeText(finalText);
		assistantText = finalText;
		process.stdout.write("\n");
		hasTextOutput = false;
	}

	if (Envs.CLI_USAGE) {
		console.log();
		const usage = await stream.usage;
		console.log(
			`${color.cyan}${tag.stat}usage in=${formatTokens(usage.inputTokens)} out=${formatTokens(usage.outputTokens)} tot=${formatTokens(usage.totalTokens)}`,
		);
	}

	if (assistantText.length === 0) {
		console.log("[No response]");
	}
	return assistantText;
};
