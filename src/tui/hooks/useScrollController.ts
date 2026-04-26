import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { calcTranscriptTotalLines, clamp } from "../lib/text-utils";
import { useTuiStore } from "../store/tui-store";
import type { TranscriptBlock } from "../store/types";

const USER_SCROLL_COOLDOWN_MS = 2000;
const BOTTOM_STICKY_LINE_SLACK = 1;

interface ScrollController {
	offset: number;
	maxOffset: number;
	isAtBottom: boolean;
	isUserScrolling: boolean;
	scrollToBottom: () => void;
	scrollUp: (lines?: number) => void;
	scrollDown: (lines?: number) => void;
	handlePageUp: () => void;
	handlePageDown: () => void;
}

export const useScrollController = (
	blocks: TranscriptBlock[],
	cols: number,
	visibleHeight: number,
): ScrollController => {
	const { offset, setOffset, isStreaming } = useTuiStore(
		useShallow((s) => ({
			offset: s.scrollOffset,
			setOffset: s.setScrollOffset,
			isStreaming: s.isStreaming,
		})),
	);

	const [isUserScrolling, setIsUserScrolling] = useState(false);
	const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const prevMaxOffsetRef = useRef<number>(0);

	const totalLines = calcTranscriptTotalLines(blocks, cols);
	const maxOffset = Math.max(0, totalLines - visibleHeight);

	const isAtBottom = maxOffset === offset;

	const scrollToBottom = useCallback(() => {
		if (maxOffset > 0 && offset < maxOffset) {
			setOffset(maxOffset);
		}
	}, [maxOffset, offset, setOffset]);

	const clearUserScrollState = useCallback(() => {
		if (userScrollTimeoutRef.current) {
			clearTimeout(userScrollTimeoutRef.current);
		}
		userScrollTimeoutRef.current = setTimeout(() => {
			setIsUserScrolling(false);
		}, USER_SCROLL_COOLDOWN_MS);
	}, []);

	const scrollUp = useCallback(
		(lines = 1) => {
			setIsUserScrolling(true);
			setOffset(clamp(offset + lines, 0, maxOffset));
			clearUserScrollState();
		},
		[offset, maxOffset, setOffset, clearUserScrollState],
	);

	const scrollDown = useCallback(
		(lines = 1) => {
			setIsUserScrolling(true);
			setOffset(clamp(offset - lines, 0, maxOffset));
			clearUserScrollState();
		},
		[offset, maxOffset, setOffset, clearUserScrollState],
	);

	const handlePageUp = useCallback(() => {
		setIsUserScrolling(true);
		setOffset(clamp(offset + visibleHeight, 0, maxOffset));
		clearUserScrollState();
	}, [offset, maxOffset, visibleHeight, setOffset, clearUserScrollState]);

	const handlePageDown = useCallback(() => {
		setIsUserScrolling(true);
		setOffset(clamp(offset - visibleHeight, 0, maxOffset));
		clearUserScrollState();
	}, [offset, maxOffset, visibleHeight, setOffset, clearUserScrollState]);

	useEffect(() => {
		if (
			isStreaming &&
			!isUserScrolling &&
			maxOffset > 0 &&
			offset >= maxOffset - BOTTOM_STICKY_LINE_SLACK
		) {
			scrollToBottom();
		}
	}, [isStreaming, isUserScrolling, maxOffset, offset, scrollToBottom]);

	useEffect(() => {
		if (maxOffset !== prevMaxOffsetRef.current && offset > maxOffset) {
			setOffset(clamp(offset, 0, maxOffset));
		}
		prevMaxOffsetRef.current = maxOffset;
	}, [maxOffset, offset, setOffset]);

	return {
		offset,
		maxOffset,
		isAtBottom,
		isUserScrolling,
		scrollToBottom,
		scrollUp,
		scrollDown,
		handlePageUp,
		handlePageDown,
	};
};
