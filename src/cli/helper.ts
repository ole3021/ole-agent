import type { MastraModelOutput } from "@mastra/core/stream";
import { Envs } from "../util/env";

export const handlingStreamResult = async (
	result: unknown,
): Promise<string> => {
	const streamResult = result as MastraModelOutput<unknown>;
	const reader = streamResult.fullStream.getReader();
	const reasoningIds = new Set<string>();
	let assistantText = "";
	let outputMode: "none" | "meta" | "text" = "none";
	let hasOpenMetaLine = false;
	let hasTextOutput = false;
	const cyan = "\u001B[36m";
	const reset = "\u001B[0m";

	const startMetaLine = (prefix: string): void => {
		if (outputMode === "text") {
			process.stdout.write("\n");
			hasTextOutput = false;
		}
		process.stdout.write(`${cyan}${prefix}`);
		outputMode = "meta";
		hasOpenMetaLine = true;
	};

	const endMetaLine = (): void => {
		process.stdout.write(`${reset}\n`);
		outputMode = "none";
		hasOpenMetaLine = false;
	};

	const writeText = (text: string): void => {
		if (outputMode === "meta") {
			endMetaLine();
		}
		if (outputMode !== "text") {
			process.stdout.write(reset);
			outputMode = "text";
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
					startMetaLine(" :R: ");
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
					startMetaLine(
						` :T: Call Tool: ${value.payload.toolName} >> ${JSON.stringify(value.payload.args)} `,
					);
					endMetaLine();
				}
				break;
			case "tool-error":
				startMetaLine(
					` :E: Tool Error: ${value.payload.toolName} >> ${String(value.payload.error)} `,
				);
				endMetaLine();
				break;
			case "error":
				startMetaLine(` :E: Stream Error: ${String(value.payload.error)} `);
				endMetaLine();
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
		streamResult.text,
		streamResult.finishReason,
	]);
	if (assistantText.length === 0 && finalText) {
		writeText(finalText);
		assistantText = finalText;
		process.stdout.write("\n");
		hasTextOutput = false;
	}

	if (Envs.CLI_USAGE) {
		const [usage] = await Promise.all([streamResult.usage]);
		console.log(
			`\u001B[36m :: usage in=${usage.inputTokens} out=${usage.outputTokens} tot=${usage.totalTokens}`,
		);
		console.log(`\u001B[36m :: finish=${finishReason ?? "unknown"}`);
	}

	console.log();
	console.log(reset);

	if (assistantText.length === 0) {
		console.log("[No response]");
	}
	return assistantText;
};
