import { useCallback, useEffect, useRef, useState } from "react";
import { useTuiStore } from "../../store/tui-store";
import { calcTranscriptTotalLines, clamp } from "../lib/text-utils";

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
	blocks: { id: string }[],
	cols: number,
	visibleHeight: number,
): ScrollController => {
	const offset = useTuiStore((s) => s.scrollOffset);
	const setOffset = useTuiStore((s) => s.setScrollOffset);
	const isStreaming = useTuiStore((s) => s.isStreaming);

	const [isUserScrolling, setIsUserScrolling] = useState(false);
	const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const prevMaxOffsetRef = useRef<number>(0);

	const totalLines = calcTranscriptTotalLines(
		blocks as unknown as Parameters<typeof calcTranscriptTotalLines>[0],
		cols,
	);
	const maxOffset = Math.max(0, totalLines - visibleHeight);

	const isAtBottom = maxOffset <= 0 || offset >= maxOffset - 1;

	const scrollToBottom = useCallback(() => {
		if (maxOffset > 0) {
			setOffset(maxOffset);
		}
	}, [maxOffset, setOffset]);

	const clearUserScrollState = useCallback(() => {
		if (userScrollTimeoutRef.current) {
			clearTimeout(userScrollTimeoutRef.current);
		}
		userScrollTimeoutRef.current = setTimeout(() => {
			setIsUserScrolling(false);
		}, 2000);
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
			offset >= maxOffset - 1
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
