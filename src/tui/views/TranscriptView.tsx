/** @jsxImportSource @opentui/react */
import type { MouseEvent } from "@opentui/core";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { StreamingLineIndicator } from "../components/StreamingLineIndicator";
import { flattenTranscriptVisibleStyled } from "../lib/text-utils";
import { getTranscriptBodyScrollRows } from "../lib/transcript-layout";
import type { TranscriptBlock } from "../store/types";
import { tuiColors } from "../theme/colors";

type Props = {
	blocks: TranscriptBlock[];
	scrollOffset: number;
	maxScrollOffset: number;
	textCols: number;
	height: number;
	isStreaming: boolean;
	scrollUp: (lines?: number) => void;
	scrollDown: (lines?: number) => void;
};

const WHEEL_DEFAULT_LINES = 3;

const EMPTY_HINT = "↑↓ / 滚轮 / PgUp PgDn 滚动";

const MIN_HEIGHT_FOOTER_ROW = 3;
const NOT_AT_BOTTOM_HINT = "";

function buildScrollStatusLabel(
	maxScrollOffset: number,
	scrollOffset: number,
): string {
	if (maxScrollOffset <= 0) {
		return "---";
	}
	const a = maxScrollOffset - scrollOffset;
	return `${a}/${maxScrollOffset}`;
}

export const TranscriptView = ({
	blocks,
	scrollOffset,
	maxScrollOffset,
	textCols,
	height,
	isStreaming,
	scrollUp,
	scrollDown,
}: Props) => {
	const isAtBottom = maxScrollOffset <= 0 || scrollOffset === maxScrollOffset;
	const bodyH = getTranscriptBodyScrollRows(height);
	const useSplitChrome = height >= MIN_HEIGHT_FOOTER_ROW;
	const w = Math.max(8, textCols - 2);

	const { lines, startLine } = flattenTranscriptVisibleStyled(
		blocks,
		textCols,
		scrollOffset,
		bodyH,
	);

	const scrollLabel = buildScrollStatusLabel(maxScrollOffset, scrollOffset);
	const showEmpty = lines.length === 0 && blocks.length === 0;
	const showNoVisible = lines.length === 0 && blocks.length > 0;

	const onTranscriptScroll = useCallback(
		(e: MouseEvent) => {
			if (e.type !== "scroll" || e.scroll == null) {
				return;
			}
			e.preventDefault();
			const { direction, delta } = e.scroll;
			const n = Math.max(
				1,
				Math.min(12, Math.ceil(delta) || WHEEL_DEFAULT_LINES),
			);
			if (direction === "up") {
				scrollUp(n);
			} else if (direction === "down") {
				scrollDown(n);
			}
		},
		[scrollDown, scrollUp],
	);

	let lineNodes: ReactNode = null;
	if (lines.length > 0) {
		lineNodes = lines.map((row, i) => {
			const t = row.text.length > w ? row.text.slice(0, w) : row.text;
			const k = `L-${startLine + i}-${row.text.length}`;
			return (
				<text key={k} fg={row.fg}>
					{t}
				</text>
			);
		});
	}

	const scrollBody = (
		<box
			flexDirection="column"
			flexGrow={0}
			flexShrink={0}
			gap={0}
			height={bodyH}
			onMouseScroll={onTranscriptScroll}
		>
			{showNoVisible ? <text fg={tuiColors.muted}>(无可见行)</text> : null}
			{lineNodes}
		</box>
	);

	const leftMax = Math.max(8, w - 12);
	const leftStatusText = showEmpty
		? EMPTY_HINT.slice(0, leftMax)
		: !isAtBottom && maxScrollOffset > 0
			? NOT_AT_BOTTOM_HINT.slice(0, leftMax)
			: " ";
	const streamLine = isStreaming ? (
		<StreamingLineIndicator isStreaming />
	) : null;
	const bottomStatusRow = (
		<box flexDirection="row" flexShrink={0} justifyContent="space-between">
			<box
				alignItems="center"
				flexDirection="row"
				flexGrow={0}
				flexShrink={1}
				gap={1}
				minWidth={0}
			>
				{streamLine}
				<text fg={tuiColors.muted} flexShrink={1}>
					{leftStatusText}
				</text>
			</box>
			<text flexShrink={0} fg={tuiColors.muted}>
				{scrollLabel}
			</text>
		</box>
	);

	const rootShell = {
		border: true,
		borderColor: tuiColors.border,
		flexDirection: "column" as const,
		flexGrow: 1,
		flexShrink: 1,
		height,
		minHeight: 0,
		minWidth: 0,
		width: "100%" as const,
	};

	if (useSplitChrome) {
		return (
			<box {...rootShell}>
				{scrollBody}
				{bottomStatusRow}
			</box>
		);
	}

	if (showEmpty) {
		return (
			<box {...rootShell}>
				{scrollBody}
				{bottomStatusRow}
			</box>
		);
	}

	const shortStatusRow = (
		<box flexDirection="row" flexShrink={0} justifyContent="space-between">
			<box
				alignItems="center"
				flexDirection="row"
				flexGrow={0}
				flexShrink={1}
				gap={1}
				minWidth={0}
			>
				{streamLine}
				<text flexShrink={0} fg={tuiColors.muted}>
					{scrollLabel}
				</text>
			</box>
			{!isAtBottom && maxScrollOffset > 0 ? (
				<text flexShrink={0} fg={tuiColors.muted}>
					{NOT_AT_BOTTOM_HINT.slice(0, leftMax)}
				</text>
			) : null}
		</box>
	);

	return (
		<box {...rootShell}>
			{shortStatusRow}
			{scrollBody}
		</box>
	);
};
