import { Envs } from "../../util/env";
import { FfmpegAudioCaptureAdapter } from "./ffmpeg-audio-capture";
import type { SttProviderAdapter } from "./stt-provider-adapter";
import type { SttFinalEvent } from "./stt-provider-adapter";
import { VolcengineSttProvider } from "./volcengine-stt-provider";
import {
	appendTranscriptSegment,
	createInitialVoiceSummaryState,
	summarizeVoiceIncremental,
	type VoiceSummaryDiffEntry,
	type VoiceSummaryState,
} from "./voice-summary-runtime";

export type VoiceSummarySessionHandlers = {
	onInfo: (line: string) => void;
	onPartial: (text: string, speaker?: string) => void;
	onFinal: (text: string, speaker?: string) => void;
	onSummaryDiff: (version: number, diff: VoiceSummaryDiffEntry[]) => void;
	onError: (error: Error) => void;
};

type VoiceSessionMetrics = {
	audioChunkCount: number;
	partialCount: number;
	finalCount: number;
};

const STOP_FINALIZE_WAIT_MS = 220;
const STOP_AUDIO_TIMEOUT_MS = 400;
const STOP_STT_TIMEOUT_MS = 400;
const FINAL_SUMMARY_FLUSH_TIMEOUT_MS = 5000;

function isFatalRealtimeError(error: Error): boolean {
	const message = error.message;
	if (message.includes("volc server error code=55000000")) {
		return true;
	}
	if (message.includes("rpc timeout")) {
		return true;
	}
	return false;
}

const wait = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const waitForAbort = (signal: AbortSignal): Promise<void> =>
	new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		signal.addEventListener("abort", () => resolve(), { once: true });
	});

const withTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string,
	handlers: VoiceSummarySessionHandlers,
): Promise<T | null> => {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<null>((resolve) => {
		timeoutId = setTimeout(() => {
			handlers.onInfo(`[voice-summary] ${label} timed out after ${timeoutMs}ms`);
			resolve(null);
		}, timeoutMs);
	});
	try {
		return await Promise.race([
			promise.catch((error) => {
				handlers.onError(
					error instanceof Error
						? error
						: new Error(`[voice-summary] ${label} failed: ${String(error)}`),
				);
				return null;
			}),
			timeoutPromise,
		]);
	} finally {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
	}
};

async function createSttProvider(): Promise<SttProviderAdapter> {
	if (Envs.STT_PROVIDER === "deepgram") {
		const mod = await import("./deepgram-stt-provider");
		return new mod.DeepgramSttProvider();
	}
	return new VolcengineSttProvider();
}

function noTranscriptHint(): string {
	if (Envs.STT_PROVIDER === "deepgram") {
		return "[voice-summary] no transcript received. Check DEEPGRAM_API_KEY, network, and audio input device.";
	}
	return "[voice-summary] no transcript received. Check volcengine credentials, network, and audio input device.";
}

const buildTranscriptHighlights = (state: VoiceSummaryState): string => {
	const recent = state.segments.slice(-12);
	if (recent.length === 0) {
		return "(empty)";
	}
	return recent
		.map((segment) => {
			const who = segment.speaker ? `${segment.speaker}: ` : "";
			return `- ${who}${segment.text}`;
		})
		.join("\n");
};

const buildFallbackSummary = (state: VoiceSummaryState): string => {
	if (state.segments.length === 0) {
		return "(empty)";
	}
	return state.segments
		.slice(-6)
		.map((segment, index) => {
			const who = segment.speaker ? `${segment.speaker}: ` : "";
			return `- 要点${index + 1}: ${who}${segment.text}`;
		})
		.join("\n");
};

export async function runVoiceSummarySession(
	handlers: VoiceSummarySessionHandlers,
	signal: AbortSignal,
): Promise<{ finalSummary: string; transcriptHighlights: string }> {
	const capture = new FfmpegAudioCaptureAdapter();
	const stt = await createSttProvider();
	let summaryState = createInitialVoiceSummaryState();
	let segmentSeq = 1;
	let partialText = "";
	let stopRequested = false;
	const metrics: VoiceSessionMetrics = {
		audioChunkCount: 0,
		partialCount: 0,
		finalCount: 0,
	};
	let summaryTask: Promise<void> | null = null;
	let sessionClosed = false;

	const safeEmitInfo = (line: string): void => {
		if (sessionClosed) {
			return;
		}
		handlers.onInfo(line);
	};

	const safeEmitSummaryDiff = (
		version: number,
		diff: VoiceSummaryDiffEntry[],
	): void => {
		if (sessionClosed) {
			return;
		}
		handlers.onSummaryDiff(version, diff);
	};

	const safeEmitError = (error: Error): void => {
		if (sessionClosed) {
			return;
		}
		handlers.onError(error);
		if (isFatalRealtimeError(error)) {
			stopRequested = true;
		}
	};

	const summarizeIfNeeded = async (): Promise<void> => {
		if (summaryTask) {
			return summaryTask;
		}
		if (summaryState.lastCommittedSegmentIndex >= summaryState.segments.length) {
			return;
		}
		summaryTask = (async () => {
			try {
				const next = await summarizeVoiceIncremental(summaryState);
				summaryState = next.state;
				if (next.diff.length > 0) {
					safeEmitSummaryDiff(summaryState.version, next.diff);
				}
			} catch (error) {
				safeEmitError(error instanceof Error ? error : new Error(String(error)));
			} finally {
				summaryTask = null;
			}
		})();
		return summaryTask;
	};

	const onFinal = (event: SttFinalEvent) => {
		metrics.finalCount += 1;
		summaryState = appendTranscriptSegment(summaryState, {
			id: `seg-${segmentSeq++}`,
			text: event.text,
			speaker: event.speaker,
			startMs: event.startMs,
			endMs: event.endMs,
		});
		handlers.onFinal(event.text, event.speaker);
		void summarizeIfNeeded();
	};

	await stt.connect({
		onPartial: (event) => {
			metrics.partialCount += 1;
			if (event.text === partialText) {
				return;
			}
			partialText = event.text;
			handlers.onPartial(event.text, event.speaker);
		},
		onFinal,
		onError: safeEmitError,
		onClose: (detail) => {
			safeEmitInfo(
				detail
					? `[voice-summary] STT connection closed (${detail})`
					: "[voice-summary] STT connection closed",
			);
		},
	});

	await capture.start({
		onChunk: (chunk) => {
			metrics.audioChunkCount += 1;
			stt.sendAudio(chunk);
		},
		onError: safeEmitError,
		onClose: () => {
			safeEmitInfo("[voice-summary] audio capture closed");
		},
	});

	safeEmitInfo("[voice-summary] listening started, press Ctrl+C to stop");

	const intervalMs = Math.max(1, Envs.VOICE_SUMMARY_INTERVAL_SEC) * 1000;
	while (!signal.aborted && !stopRequested) {
		await Promise.race([wait(intervalMs), waitForAbort(signal)]);
		if (signal.aborted || stopRequested) {
			break;
		}
		await summarizeIfNeeded();
	}
	if (stopRequested && !signal.aborted) {
		safeEmitInfo("[voice-summary] upstream realtime error, stopping session...");
	}

	safeEmitInfo("[voice-summary] stopping session...");
	stt.finalize?.();
	await wait(STOP_FINALIZE_WAIT_MS);
	await withTimeout(capture.stop(), STOP_AUDIO_TIMEOUT_MS, "audio stop", handlers);
	await withTimeout(stt.close(), STOP_STT_TIMEOUT_MS, "stt close", handlers);
	if (metrics.finalCount === 0 && partialText.trim().length > 0) {
		summaryState = appendTranscriptSegment(summaryState, {
			id: `seg-${segmentSeq++}`,
			text: partialText.trim(),
		});
	}
	await withTimeout(
		summarizeIfNeeded(),
		FINAL_SUMMARY_FLUSH_TIMEOUT_MS,
		"final summary flush",
		handlers,
	);
	sessionClosed = true;

	const finalSummary =
		summaryState.items.length > 0
			? summaryState.items.map((item) => `- ${item.text}`).join("\n")
			: buildFallbackSummary(summaryState);
	const transcriptHighlights = buildTranscriptHighlights(summaryState);

	if (metrics.audioChunkCount === 0) {
		handlers.onInfo(
			"[voice-summary] no audio captured. Check microphone permission and ffmpeg input device.",
		);
	}
	if (metrics.partialCount === 0 && metrics.finalCount === 0) {
		handlers.onInfo(noTranscriptHint());
	}

	return { finalSummary, transcriptHighlights };
}
