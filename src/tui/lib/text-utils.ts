import type { RGBA } from "@opentui/core";
import type { Scope, TranscriptBlock, UsageState } from "../store/types";
import { tuiColors } from "../theme/colors";
import { computeBreakpoints } from "./layout-types";
import {
	terminalDisplayWidth,
	wrapFirstSegmentDisplayWidths,
	wrapToDisplayWidth,
} from "./terminal-string-width";

export type {
	HeightBreakpoint,
	UiBreakpoints,
	WidthBreakpoint,
} from "./layout-types";
export { computeBreakpoints };

/**
 * 将工具 result / error 等 `unknown` 转为可行文展示，避免 `String(object)` 变成 `[object Object]`。
 */
export const previewTextFromUnknown = (value: unknown): string => {
	if (value == null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	if (typeof value === "symbol") {
		return value.description ?? String(value);
	}
	if (value instanceof Error) {
		return value.message || value.name || "Error";
	}
	try {
		return JSON.stringify(value);
	} catch {
		return Object.prototype.toString.call(value);
	}
};

export const getWrapWidth = (cols: number): number => Math.max(16, cols - 6);

export type TranscriptLine = { text: string; fg: RGBA };

export type TranscriptLineContext = {
	blockIndex: number;
	allBlocks: TranscriptBlock[];
	lastAssistantIndex: number;
};

export const findLastAssistantBlockIndex = (
	blocks: TranscriptBlock[],
): number => {
	for (let i = blocks.length - 1; i >= 0; i--) {
		if (blocks[i].type === "assistant") {
			return i;
		}
	}
	return -1;
};

const scopeNote = (scope: Scope): string => {
	if (typeof scope === "string" && scope === "main") return "";
	if (typeof scope === "string") return `  ${scope}`;
	return `  ↳${scope.sub}`;
};

export const wrapText = (text: string, width: number): string[] => {
	if (!text) {
		return [""];
	}
	const lines: string[] = [];
	for (const row of text.split("\n")) {
		lines.push(...wrapToDisplayWidth(row, width));
	}
	return lines;
};

const LBRACKET = "⎿";

/**
 * 首行以 `firstLinePrefix` 开头（需含行首 `⎿`），续行以同**显示列宽**的 `⎿`+空格
 * 与首行左缘对齐，避免 CJK/全角 与 `⎿` 混排时续行只按 JS 字长缩进错列。
 */
const linesWithLBracketPrefix = (
	firstLinePrefix: string,
	body: string,
	w: number,
): string[] => {
	if (!body) {
		return [];
	}
	const prefixW = terminalDisplayWidth(firstLinePrefix);
	const lW = terminalDisplayWidth(LBRACKET);
	if (prefixW > w) {
		return [firstLinePrefix + body];
	}
	const contPrefix = `${LBRACKET}${" ".repeat(Math.max(0, prefixW - lW))}`;
	const w1 = w - prefixW;
	const w2 = w - terminalDisplayWidth(contPrefix);
	if (w1 < 1 && w2 < 1) {
		return [firstLinePrefix + body];
	}
	const n1 = Math.max(1, w1);
	const n2 = Math.max(1, w2);
	const out: string[] = [];
	const segments = body.split("\n");
	for (let si = 0; si < segments.length; si++) {
		const seg = segments[si] ?? "";
		if (si === 0) {
			const part = wrapFirstSegmentDisplayWidths(seg, n1, n2);
			for (let i = 0; i < part.length; i++) {
				const p = part[i] ?? "";
				out.push((i === 0 ? firstLinePrefix : contPrefix) + p);
			}
		} else if (seg.length === 0) {
			out.push(contPrefix);
		} else {
			for (const L of wrapToDisplayWidth(seg, n2)) {
				out.push(contPrefix + L);
			}
		}
	}
	return out;
};

/**
 * 带语义色的行（用于 `TranscriptView`）；行数与 `getBlockDisplayLines` 一致。
 */
export const getBlockTranscriptLines = (
	block: TranscriptBlock,
	cols: number,
	ctx: TranscriptLineContext,
): TranscriptLine[] => {
	const w = getWrapWidth(cols);
	const thinking = tuiColors.muted;
	const toolLine = tuiColors.muted;
	switch (block.type) {
		case "user": {
			const fg = tuiColors.accent;
			const rows: TranscriptLine[] = [{ text: "▶▶▶", fg }];
			if (block.text) {
				for (const L of wrapText(block.text, w)) {
					rows.push({ text: `  ${L}`, fg });
				}
			}
			return rows;
		}
		case "assistant": {
			const isFinal =
				!block.streaming && ctx.blockIndex === ctx.lastAssistantIndex;
			const fg = isFinal ? tuiColors.primary : tuiColors.foreground;
			const s = scopeNote(block.scope);
			const rows: TranscriptLine[] = [{ text: s ? `◀◀◀${s}` : "◀◀◀", fg }];
			if (block.text) {
				for (const L of wrapText(block.text, w)) {
					rows.push({ text: `  ${L}`, fg });
				}
			}
			return rows;
		}
		case "reasoning": {
			const rows: TranscriptLine[] = [];
			if (block.text) {
				for (const L of linesWithLBracketPrefix("⎿ 思考: ", block.text, w)) {
					rows.push({ text: L, fg: thinking });
				}
			}
			return rows;
		}
		case "tool": {
			const firstPrefix = "⎿ 工具: ";
			const fpW = terminalDisplayWidth(firstPrefix);
			const lW = terminalDisplayWidth(LBRACKET);
			// 与续行同宽后再缩进 2 个半格，对应原先 `"  "`
			const contArgs = `${LBRACKET}${" ".repeat(Math.max(0, fpW - lW + 2))}`;
			const headBody = `${block.toolName}  ${block.status}`;
			const rows: TranscriptLine[] = [];
			for (const L of linesWithLBracketPrefix(firstPrefix, headBody, w)) {
				rows.push({ text: L, fg: toolLine });
			}
			if (block.args) {
				const wArg = w - terminalDisplayWidth(contArgs);
				for (const line of block.args.split("\n")) {
					for (const L of wrapToDisplayWidth(line, Math.max(1, wArg))) {
						rows.push({ text: contArgs + L, fg: toolLine });
					}
				}
			}
			return rows;
		}
		case "subagent": {
			const firstPrefix = "⎿ 子代理: ";
			const errPart = block.error ? `  ${block.error}` : "";
			const body = `${block.agentId}  [${block.status}]${errPart}`;
			return linesWithLBracketPrefix(firstPrefix, body, w).map((L) => ({
				text: L,
				fg: toolLine,
			}));
		}
		case "error": {
			if (!block.message) {
				return [{ text: "⎿ 错误: ", fg: tuiColors.error }];
			}
			return linesWithLBracketPrefix("⎿ 错误: ", block.message, w).map((L) => ({
				text: L,
				fg: tuiColors.error,
			}));
		}
		case "usage": {
			const u = `In: ${block.input}  Out: ${block.output}  Sum: ${block.total}`;
			return linesWithLBracketPrefix("⎿ 用量: ", u, w).map((L) => ({
				text: L,
				fg: tuiColors.muted,
			}));
		}
		default:
			return [{ text: "?", fg: tuiColors.foreground }];
	}
};

/**
 * 与 `calcTranscriptTotalLines` / 滚动用行数 **一致** 的纯文本行。
 */
export const getBlockDisplayLines = (
	block: TranscriptBlock,
	cols: number,
): string[] => {
	const solo: TranscriptLineContext = {
		blockIndex: 0,
		allBlocks: [block],
		lastAssistantIndex: block.type === "assistant" ? 0 : -1,
	};
	return getBlockTranscriptLines(block, cols, solo).map((r) => r.text);
};

export const calcBlockLines = (block: TranscriptBlock, cols: number): number =>
	getBlockTranscriptLines(block, cols, {
		blockIndex: 0,
		allBlocks: [block],
		lastAssistantIndex: block.type === "assistant" ? 0 : -1,
	}).length;

/**
 * 将块列表摊平为带色行，并按与 `useScrollController` 相同的行偏移取可见窗口（不含顶栏行）。
 */
export const flattenTranscriptVisibleStyled = (
	blocks: TranscriptBlock[],
	cols: number,
	scrollOffset: number,
	visibleHeight: number,
): { lines: TranscriptLine[]; totalLines: number; startLine: number } => {
	const lastA = findLastAssistantBlockIndex(blocks);
	const all: TranscriptLine[] = [];
	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i];
		if (!b) {
			continue;
		}
		all.push(
			...getBlockTranscriptLines(b, cols, {
				blockIndex: i,
				allBlocks: blocks,
				lastAssistantIndex: lastA,
			}),
		);
	}
	const totalLines = all.length;
	if (totalLines === 0) {
		return { lines: [], totalLines: 0, startLine: 0 };
	}
	const endLine = Math.max(0, totalLines - scrollOffset);
	const startLine = Math.max(0, endLine - visibleHeight);
	const lines = all.slice(startLine, endLine);
	return { lines, totalLines, startLine };
};

/**
 * 将块列表摊平为可滚动行（纯文本，无样式上下文）。
 */
export const flattenTranscriptVisibleLines = (
	blocks: TranscriptBlock[],
	cols: number,
	scrollOffset: number,
	visibleHeight: number,
): { lines: string[]; totalLines: number } => {
	const { lines, totalLines } = flattenTranscriptVisibleStyled(
		blocks,
		cols,
		scrollOffset,
		visibleHeight,
	);
	return { lines: lines.map((l) => l.text), totalLines };
};

export const calcTranscriptTotalLines = (
	blocks: TranscriptBlock[],
	cols: number,
): number =>
	blocks.reduce((sum, block) => sum + calcBlockLines(block, cols), 0);

export interface BlockHeightMap {
	get(blockId: string): number | undefined;
}

export const buildBlockHeightMap = (
	blocks: TranscriptBlock[],
	cols: number,
): Map<string, number> => {
	const map = new Map<string, number>();
	for (const block of blocks) {
		map.set(block.id, calcBlockLines(block, cols));
	}
	return map;
};

export interface VisibleBlock {
	block: TranscriptBlock;
	startLine: number;
	endLine: number;
}

export const computeVisibleBlocks = (
	blocks: TranscriptBlock[],
	blockHeights: Map<string, number>,
	scrollOffset: number,
	visibleHeight: number,
	cols: number = 80,
): VisibleBlock[] => {
	if (blocks.length === 0) return [];

	const totalLines = blocks.reduce(
		(sum, block) =>
			sum + (blockHeights.get(block.id) ?? calcBlockLines(block, cols)),
		0,
	);

	const endLine = Math.max(0, totalLines - scrollOffset);
	const startLine = Math.max(0, endLine - visibleHeight);

	const result: VisibleBlock[] = [];
	let cursor = 0;

	for (const block of blocks) {
		const size = blockHeights.get(block.id) ?? calcBlockLines(block, cols);
		const blockStart = cursor;
		const blockEnd = cursor + size;

		if (blockEnd > startLine && blockStart < endLine) {
			result.push({ block, startLine: blockStart, endLine: blockEnd });
		}

		cursor = blockEnd;
	}

	return result;
};

export const clamp = (n: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, n));

export const formatDuration = (seconds: number): string => {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}m ${secs}s`;
	}
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	return `${hours}h ${mins}m`;
};

export const formatTokens = (n: number | undefined): string => {
	if (n === undefined || !Number.isFinite(n)) return "-";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
};

export const formatUsageStateLine = (label: string, u: UsageState): string =>
	`${label}  入 ${formatTokens(u.input)}  出 ${formatTokens(
		u.output,
	)}  计 ${formatTokens(u.total)}`;

export const truncateText = (
	text: string,
	maxLength: number,
): { text: string; truncated: boolean } => {
	if (text.length <= maxLength) return { text, truncated: false };
	return { text: text.slice(0, maxLength), truncated: true };
};
