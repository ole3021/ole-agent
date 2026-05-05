import type { MastraModelOutput } from "@mastra/core/stream";
import type {
	AgentRunEvent,
	AgentRunScope,
} from "../app/session/agent-run-event";
import {
	isAgentRunEventVisible,
	type StreamToggles,
	streamToAgentRunEvents,
} from "../app/session/stream-to-events";
import { Envs } from "../util/env";
import {
	formatSkillToolCallSummary,
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

function scopePrefix(scope: AgentRunScope): string {
	if (scope === "main") {
		return "";
	}
	return `${color.yellow}${tag.sub}${scope.sub} ${color.reset}`;
}

function stringifySafe(value: unknown): string {
	if (value === undefined) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function writeMetaLine(prefix: string, tagText: string, body: string): void {
	process.stdout.write(`${prefix}${tagText}${body}${color.reset}\n`);
}

export async function renderStream(
	stream: MastraModelOutput<unknown>,
	params?: { onEvent?: (event: AgentRunEvent) => void },
): Promise<string> {
	let assistantText = "";
	let hasTextOutput = false;
	const toggles: StreamToggles = {
		reason: Envs.CLI_REASON,
		toolCall: Envs.CLI_TOOL_CALL,
		usage: Envs.CLI_USAGE,
	};

	for await (const event of streamToAgentRunEvents(stream)) {
		params?.onEvent?.(event);
		if (!isAgentRunEventVisible(event, toggles)) {
			continue;
		}
		switch (event.kind) {
			case "text-delta": {
				if (event.scope === "main") {
					assistantText += event.text;
				}
				const prefix = scopePrefix(event.scope);
				process.stdout.write(`${prefix}${event.text}`);
				hasTextOutput = true;
				break;
			}
			case "reasoning-start": {
				writeMetaLine(
					scopePrefix(event.scope),
					`${color.cyan}${tag.reason}`,
					"start",
				);
				break;
			}
			case "reasoning-delta": {
				const text = event.text.trim();
				if (text.length > 0) {
					writeMetaLine(
						scopePrefix(event.scope),
						`${color.cyan}${tag.reason}`,
						text,
					);
				}
				break;
			}
			case "reasoning-end": {
				writeMetaLine(
					scopePrefix(event.scope),
					`${color.cyan}${tag.reason}`,
					"end",
				);
				break;
			}
			case "tool-call": {
				if (isMastraSkillTool(event.name)) {
					writeMetaLine(
						scopePrefix(event.scope),
						`${color.yellow}${tag.skill}`,
						`${event.name} >> ${formatSkillToolCallSummary(event.name, event.args)}`,
					);
				} else {
					writeMetaLine(
						scopePrefix(event.scope),
						`${color.cyan}${tag.tool}`,
						`call: ${event.name} >> ${stringifySafe(event.args)}`,
					);
				}
				break;
			}
			case "tool-result": {
				if (isMastraSkillTool(event.name)) {
					writeMetaLine(
						scopePrefix(event.scope),
						`${color.yellow}${tag.skill}`,
						`${event.name} >> ${event.preview ?? ""}`,
					);
				} else {
					if (event.ok) {
						writeMetaLine(
							scopePrefix(event.scope),
							`${color.cyan}${tag.tool}`,
							`Completed: ${event.name}`,
						);
					} else {
						writeMetaLine(
							scopePrefix(event.scope),
							`${color.cyan}${tag.tool}`,
							`Failed: ${event.name}`,
						);
					}
				}
				break;
			}
			case "subagent-start": {
				writeMetaLine(
					`${color.yellow}${tag.sub}${event.id} `,
					`${color.yellow}${tag.sub}`,
					"start",
				);
				break;
			}
			case "subagent-end": {
				writeMetaLine(
					`${color.yellow}${tag.sub}${event.id} `,
					`${color.yellow}${tag.sub}`,
					event.ok ? "end" : `failed: ${event.error ?? "unknown"}`,
				);
				break;
			}
			case "usage": {
				writeMetaLine(
					"",
					`${color.cyan}${tag.stat}`,
					`usage in=${formatTokens(event.inTokens)} out=${formatTokens(event.outTokens)} tot=${formatTokens(event.totalTokens)}`,
				);
				break;
			}
			case "error": {
				writeMetaLine("", `${color.cyan}${tag.error}`, event.message);
				break;
			}
			case "turn-start":
			case "turn-end":
				break;
		}
	}

	if (hasTextOutput) {
		process.stdout.write("\n");
	}
	if (assistantText.length === 0) {
		console.log("[No response]");
	}
	return assistantText;
}
