import type { TranscriptBlock } from "../../store/tui-store";

export type WidthBreakpoint = "xs" | "sm" | "md";
export type HeightBreakpoint = "short" | "normal";

export interface UiBreakpoints {
	width: WidthBreakpoint;
	height: HeightBreakpoint;
}

export const computeBreakpoints = (
	cols: number,
	rows: number,
): UiBreakpoints => ({
	width: cols < 60 ? "xs" : cols < 100 ? "sm" : "md",
	height: rows < 14 ? "short" : "normal",
});

export const calcBlockLines = (
	block: TranscriptBlock,
	cols: number,
): number => {
	const width = Math.max(16, cols - 6);
	const wrappedLines = (text: string): number => {
		if (!text) return 0;
		const rows = text.split("\n");
		return rows.reduce(
			(sum, row) => sum + Math.max(1, Math.ceil(row.length / width)),
			0,
		);
	};

	switch (block.type) {
		case "user":
		case "assistant":
			return 1 + wrappedLines(block.text);
		case "reasoning":
			return 2 + wrappedLines(block.text);
		case "tool":
			return (
				2 +
				wrappedLines(block.toolName) +
				wrappedLines(block.args) +
				(block.preview ? wrappedLines(block.preview) : 0)
			);
		case "subagent":
			return 1;
		case "error":
			return 2 + wrappedLines(block.message);
		case "usage":
			return 1;
		default:
			return 1;
	}
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

export const truncateText = (
	text: string,
	maxLength: number,
): { text: string; truncated: boolean } => {
	if (text.length <= maxLength) return { text, truncated: false };
	return { text: text.slice(0, maxLength), truncated: true };
};

export const wrapText = (text: string, width: number): string[] => {
	if (!text) return [""];
	const lines: string[] = [];
	const rows = text.split("\n");
	for (const row of rows) {
		if (row.length <= width) {
			lines.push(row);
		} else {
			let remaining = row;
			while (remaining.length > width) {
				lines.push(remaining.slice(0, width));
				remaining = remaining.slice(width);
			}
			if (remaining) lines.push(remaining);
		}
	}
	return lines;
};
