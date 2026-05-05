import { LiveTranscriptionEvents, createClient } from "@deepgram/sdk";
import { Envs } from "../../util/env";
import type {
	SttFinalEvent,
	SttProviderAdapter,
	SttProviderHandlers,
} from "./stt-provider-adapter";

type DeepgramResultWord = {
	speaker?: number;
};

type DeepgramResultAlternative = {
	transcript?: string;
	words?: DeepgramResultWord[];
};

type DeepgramResultPayload = {
	type?: string;
	is_final?: boolean;
	start?: number;
	duration?: number;
	channel?: {
		alternatives?: DeepgramResultAlternative[];
	};
};

function safeError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}
	return new Error(String(error));
}

function extractDominantSpeaker(words: DeepgramResultWord[] | undefined):
	| string
	| undefined {
	if (!words || words.length === 0) {
		return undefined;
	}
	const count = new Map<number, number>();
	for (const word of words) {
		if (typeof word.speaker !== "number") {
			continue;
		}
		count.set(word.speaker, (count.get(word.speaker) ?? 0) + 1);
	}
	let topSpeaker: number | undefined;
	let topCount = -1;
	for (const [speaker, hits] of count) {
		if (hits > topCount) {
			topSpeaker = speaker;
			topCount = hits;
		}
	}
	return topSpeaker !== undefined ? `spk-${topSpeaker}` : undefined;
}

function toFinalEvent(payload: DeepgramResultPayload): SttFinalEvent | null {
	const alternative = payload.channel?.alternatives?.[0];
	const text = String(alternative?.transcript ?? "").trim();
	if (!text) {
		return null;
	}
	const startSec = payload.start;
	const durationSec = payload.duration;
	const startMs =
		typeof startSec === "number" ? Math.max(0, Math.floor(startSec * 1000)) : undefined;
	const endMs =
		typeof startSec === "number" && typeof durationSec === "number"
			? Math.max(0, Math.floor((startSec + durationSec) * 1000))
			: undefined;
	return {
		text,
		speaker: extractDominantSpeaker(alternative?.words),
		startMs,
		endMs,
	};
}

export class DeepgramSttProvider implements SttProviderAdapter {
	private connection: any = null;

	async connect(handlers: SttProviderHandlers): Promise<void> {
		if (!Envs.DEEPGRAM_API_KEY) {
			throw new Error("DEEPGRAM_API_KEY is required for /voice-summary");
		}

		const client = createClient(Envs.DEEPGRAM_API_KEY);
		const connection = client.listen.live({
			model: Envs.VOICE_DEEPGRAM_MODEL,
			language: Envs.VOICE_DEEPGRAM_LANGUAGE,
			punctuate: true,
			smart_format: true,
			interim_results: true,
			diarize: true,
			vad_events: true,
			endpointing: 300,
			utterance_end_ms: 1000,
			encoding: "linear16",
			sample_rate: 16000,
			channels: 1,
		});

		this.connection = connection;

		connection.on(
			LiveTranscriptionEvents.Transcript,
			(data: DeepgramResultPayload) => {
			const alternative = data.channel?.alternatives?.[0];
			const text = String(alternative?.transcript ?? "").trim();
			if (!text) {
				return;
			}
			if (data.is_final) {
				const event = toFinalEvent(data);
				if (event) {
					handlers.onFinal(event);
				}
				return;
			}
			handlers.onPartial({
				text,
				speaker: extractDominantSpeaker(alternative?.words),
			});
			},
		);

		connection.on(LiveTranscriptionEvents.Error, (error: unknown) => {
			handlers.onError(safeError(error));
		});
		connection.on(LiveTranscriptionEvents.Close, (event?: { code?: number; reason?: string }) => {
			const code = event?.code;
			const reason = event?.reason;
			const detail =
				code !== undefined || reason
					? `code=${String(code ?? "?")} reason=${String(reason ?? "")}`
					: undefined;
			handlers.onClose?.(detail);
		});

		await new Promise<void>((resolve, reject) => {
			const onOpen = () => {
				resolve();
			};
			const onError = (error: unknown) => {
				reject(safeError(error));
			};
			connection.once(LiveTranscriptionEvents.Open, onOpen);
			connection.once(LiveTranscriptionEvents.Error, onError);
		});
	}

	sendAudio(chunk: Uint8Array): void {
		if (!this.connection) {
			return;
		}
		if (typeof this.connection.send === "function") {
			this.connection.send(chunk);
			return;
		}
		if (typeof this.connection.sendMedia === "function") {
			this.connection.sendMedia(chunk);
			return;
		}
		if (this.connection.socket && typeof this.connection.socket.send === "function") {
			this.connection.socket.send(chunk);
		}
	}

	finalize(): void {
		if (!this.connection) {
			return;
		}
		if (typeof this.connection.finalize === "function") {
			this.connection.finalize();
		}
	}

	async close(): Promise<void> {
		if (!this.connection) {
			return;
		}
		const conn = this.connection;
		this.connection = null;
		if (typeof conn.finalize === "function") {
			conn.finalize();
		}
		if (typeof conn.requestClose === "function") {
			conn.requestClose();
		}
		if (typeof conn.finish === "function") {
			conn.finish();
		}
		if (conn.socket && typeof conn.socket.close === "function") {
			conn.socket.close();
		}
	}
}
