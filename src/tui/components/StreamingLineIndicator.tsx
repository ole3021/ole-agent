/** @jsxImportSource @opentui/react */
import { useEffect, useState } from "react";
import { getStreamingLineFrame } from "../lib/streaming-line-frames";
import { tuiColors } from "../theme/colors";

const DEFAULT_INTERVAL_MS = 90;

type StreamingLineIndicatorProps = {
	isStreaming: boolean;
	intervalMs?: number;
};

export const StreamingLineIndicator = ({
	isStreaming,
	intervalMs = DEFAULT_INTERVAL_MS,
}: StreamingLineIndicatorProps) => {
	const [tick, setTick] = useState(0);

	useEffect(() => {
		if (!isStreaming) {
			return;
		}
		const id = setInterval(() => {
			setTick((n) => n + 1);
		}, intervalMs);
		return () => {
			clearInterval(id);
		};
	}, [isStreaming, intervalMs]);

	if (!isStreaming) {
		return null;
	}

	return (
		<text flexShrink={0} fg={tuiColors.accent}>
			{getStreamingLineFrame(tick)}
		</text>
	);
};
