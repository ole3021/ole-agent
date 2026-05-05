import {
	formatSkillToolCallSummary,
	isMastraSkillTool,
} from "../../util/skill-log-format";
import type { TranscriptBlock, UiEvent } from "../store/types";
import { formatTokens } from "./text-utils";

let nextIdCounter = 1;

const nextId = (prefix: string): string => {
	const id = nextIdCounter;
	nextIdCounter += 1;
	return `${prefix}-${id}`;
};

const scopeKey = (scope: string | { sub: string }): string =>
	typeof scope === "string" ? scope : `sub:${scope.sub}`;

const stringifySafe = (value: unknown): string => {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

export const applyEvent = (
	blocks: TranscriptBlock[],
	event: UiEvent,
): TranscriptBlock[] => {
	switch (event.kind) {
		case "turn-start":
			return blocks;
		case "text-delta": {
			const last = blocks[blocks.length - 1];
			if (
				last &&
				last.type === "assistant" &&
				scopeKey(last.scope) === scopeKey(event.scope)
			) {
				return [
					...blocks.slice(0, -1),
					{ ...last, text: last.text + event.text, streaming: true },
				];
			}
			return [
				...blocks,
				{
					id: nextId("assistant"),
					type: "assistant",
					text: event.text,
					scope: event.scope,
					streaming: true,
				},
			];
		}
		case "reasoning-start":
			return [
				...blocks,
				{
					id: nextId("reasoning"),
					type: "reasoning",
					text: "",
					scope: event.scope,
					streaming: true,
				},
			];
		case "reasoning-delta": {
			const idx = [...blocks]
				.reverse()
				.findIndex(
					(b) =>
						b.type === "reasoning" &&
						scopeKey(b.scope) === scopeKey(event.scope),
				);
			if (idx === -1) {
				return [
					...blocks,
					{
						id: nextId("reasoning"),
						type: "reasoning",
						text: event.text,
						scope: event.scope,
						streaming: true,
					},
				];
			}
			const realIdx = blocks.length - 1 - idx;
			const block = blocks[realIdx] as Extract<
				TranscriptBlock,
				{ type: "reasoning" }
			>;
			return [
				...blocks.slice(0, realIdx),
				{ ...block, text: block.text + event.text },
				...blocks.slice(realIdx + 1),
			];
		}
		case "reasoning-end":
			return blocks.map((b) =>
				b.type === "reasoning" && scopeKey(b.scope) === scopeKey(event.scope)
					? { ...b, streaming: false }
					: b,
			);
		case "tool-call": {
			const newBlock: TranscriptBlock = {
				id: event.id || nextId("tool"),
				type: "tool",
				scope: event.scope,
				toolName: event.name,
				args: isMastraSkillTool(event.name)
					? formatSkillToolCallSummary(event.name, event.args)
					: stringifySafe(event.args),
				status: "running",
			};
			return [...blocks, newBlock];
		}
		case "tool-result":
			return blocks.map((b) =>
				b.type === "tool" && b.id === event.id
					? { ...b, status: event.ok ? "ok" : "error", preview: event.preview }
					: b,
			);
		case "subagent-start":
			return [
				...blocks,
				{
					id: nextId("subagent"),
					type: "subagent",
					agentId: event.id,
					status: "running",
				},
			];
		case "subagent-end":
			return blocks.map((b) =>
				b.type === "subagent" && b.agentId === event.id
					? { ...b, status: event.ok ? "ok" : "error", error: event.error }
					: b,
			);
		case "usage": {
			const inTokens = event.inTokens ?? 0;
			const outTokens = event.outTokens ?? 0;
			const total = event.totalTokens ?? 0;
			return [
				...blocks,
				{
					id: nextId("usage"),
					type: "usage",
					input: formatTokens(inTokens),
					output: formatTokens(outTokens),
					total: formatTokens(total),
				},
			];
		}
		case "error":
			return [
				...blocks,
				{ id: nextId("error"), type: "error", message: event.message },
			];
		case "turn-end":
			return blocks.map((b) =>
				b.type === "assistant" || b.type === "reasoning"
					? { ...b, streaming: false }
					: b,
			);
		default:
			return blocks;
	}
};

export const resetIdCounter = (): void => {
	nextIdCounter = 1;
};
