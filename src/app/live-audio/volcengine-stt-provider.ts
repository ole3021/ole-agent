import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { RawData } from "ws";
import { Envs } from "../../util/env";
import type {
	SttFinalEvent,
	SttProviderAdapter,
	SttProviderHandlers,
} from "./stt-provider-adapter";

const PROTOCOL_VERSION = 0x1;
const HEADER_WORDS = 0x1;

const MSG_FULL_CLIENT_REQUEST = 0x1;
const MSG_AUDIO_ONLY_REQUEST = 0x2;
const MSG_FULL_SERVER_RESPONSE = 0x9;
const MSG_SERVER_ERROR = 0xf;

const FLAG_NO_SEQUENCE = 0x0;
const FLAG_LAST_PACKET = 0x2;

const SERIALIZATION_NONE = 0x0;
const SERIALIZATION_JSON = 0x1;

const COMPRESSION_NONE = 0x0;
const COMPRESSION_GZIP = 0x1;

function headerByte0(): number {
	return (PROTOCOL_VERSION << 4) | HEADER_WORDS;
}

function headerByte1(messageType: number, flags: number): number {
	return ((messageType & 0x0f) << 4) | (flags & 0x0f);
}

function headerByte2(serialization: number, compression: number): number {
	return ((serialization & 0x0f) << 4) | (compression & 0x0f);
}

function buildFrame(params: {
	messageType: number;
	flags: number;
	serialization: number;
	compression: number;
	payload: Uint8Array;
	includeSequence: boolean;
	sequence?: number;
}): Buffer {
	const {
		messageType,
		flags,
		serialization,
		compression,
		payload,
		includeSequence,
		sequence,
	} = params;
	const header = Buffer.from([
		headerByte0(),
		headerByte1(messageType, flags),
		headerByte2(serialization, compression),
		0x00,
	]);
	const payloadSize = Buffer.alloc(4);
	payloadSize.writeUInt32BE(payload.length, 0);

	if (includeSequence) {
		const sequenceBuf = Buffer.alloc(4);
		sequenceBuf.writeInt32BE(sequence ?? 0, 0);
		return Buffer.concat([header, sequenceBuf, payloadSize, Buffer.from(payload)]);
	}

	return Buffer.concat([header, payloadSize, Buffer.from(payload)]);
}

function parseFrame(data: Buffer): {
	messageType: number;
	flags: number;
	serialization: number;
	compression: number;
	payload: Buffer;
	errorCode?: number;
} {
	if (data.length < 8) {
		throw new Error("volc frame too short");
	}
	const headerWords = data[0] & 0x0f;
	const headerSize = headerWords * 4;
	const messageType = (data[1] >> 4) & 0x0f;
	const flags = data[1] & 0x0f;
	const serialization = (data[2] >> 4) & 0x0f;
	const compression = data[2] & 0x0f;

	if (messageType === MSG_FULL_SERVER_RESPONSE) {
		if (data.length < headerSize + 8) {
			throw new Error("volc server response frame too short");
		}
		const payloadSize = data.readUInt32BE(headerSize + 4);
		const payloadStart = headerSize + 8;
		return {
			messageType,
			flags,
			serialization,
			compression,
			payload: data.subarray(payloadStart, payloadStart + payloadSize),
		};
	}

	if (messageType === MSG_SERVER_ERROR) {
		if (data.length < headerSize + 8) {
			throw new Error("volc server error frame too short");
		}
		const errorCode = data.readUInt32BE(headerSize);
		const payloadSize = data.readUInt32BE(headerSize + 4);
		const payloadStart = headerSize + 8;
		return {
			messageType,
			flags,
			serialization,
			compression,
			errorCode,
			payload: data.subarray(payloadStart, payloadStart + payloadSize),
		};
	}

	const payloadSize = data.readUInt32BE(headerSize);
	const payloadStart = headerSize + 4;
	return {
		messageType,
		flags,
		serialization,
		compression,
		payload: data.subarray(payloadStart, payloadStart + payloadSize),
	};
}

function maybeDecompress(payload: Buffer, compression: number): Buffer {
	if (compression === COMPRESSION_GZIP) {
		return gunzipSync(payload);
	}
	return payload;
}

function rawDataToBuffer(raw: RawData): Buffer {
	if (Buffer.isBuffer(raw)) {
		return raw;
	}
	if (raw instanceof ArrayBuffer) {
		return Buffer.from(raw);
	}
	if (ArrayBuffer.isView(raw)) {
		return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
	}
	if (Array.isArray(raw)) {
		const parts = raw.map((part) =>
			Buffer.isBuffer(part) ? part : Buffer.from(part),
		);
		return Buffer.concat(parts);
	}
	throw new Error("unsupported websocket message payload type");
}

type VolcResultUtterance = {
	text?: string;
	start_time?: number;
	end_time?: number;
	definite?: boolean;
};

type VolcServerPayload = {
	result?: {
		text?: string;
		utterances?: VolcResultUtterance[];
	};
};

function toError(value: unknown): Error {
	if (value instanceof Error) {
		return value;
	}
	if (
		value &&
		typeof value === "object" &&
		"message" in value &&
		typeof (value as { message?: unknown }).message === "string"
	) {
		return new Error((value as { message: string }).message);
	}
	return new Error(String(value));
}

export class VolcengineSttProvider implements SttProviderAdapter {
	private ws: WebSocket | null = null;
	private connectId = randomUUID();
	private emittedFinalKeys = new Set<string>();
	private parseErrors = 0;
	private seenServerErrorKeys = new Set<string>();
	private serverSessionEnded = false;
	private closing = false;

	private buildAuthHeaderCandidates(): Array<{
		label: string;
		headers: Record<string, string>;
	}> {
		const base = {
			"X-Api-Resource-Id": Envs.VOICE_VOLC_RESOURCE_ID,
			"X-Api-Connect-Id": this.connectId,
			"X-Api-Request-Id": randomUUID(),
		};
		const out: Array<{ label: string; headers: Record<string, string> }> = [];

		const apiKey = Envs.VOLCENGINE_API_KEY?.trim();
		const appId = Envs.VOLCENGINE_APP_ID?.trim();
		const token = Envs.VOLCENGINE_ACCESS_TOKEN?.trim();

		if (apiKey) {
			out.push({
				label: "x-api-key",
				headers: { ...base, "X-Api-Key": apiKey },
			});
		}

		if (appId && token) {
			out.push({
				label: "app+access",
				headers: {
					...base,
					"X-Api-App-Key": appId,
					"X-Api-Access-Key": token,
				},
			});
			out.push({
				label: "app+access+bearer",
				headers: {
					...base,
					"X-Api-App-Key": appId,
					"X-Api-Access-Key": token,
					Authorization: `Bearer; ${token}`,
				},
			});
		}

		if (token) {
			out.push({
				label: "bearer-token",
				headers: { ...base, Authorization: `Bearer; ${token}` },
			});
		}

		return out;
	}

	async connect(handlers: SttProviderHandlers): Promise<void> {
		this.seenServerErrorKeys.clear();
		this.serverSessionEnded = false;
		this.closing = false;
		const authCandidates = this.buildAuthHeaderCandidates();
		if (authCandidates.length === 0) {
			throw new Error(
				"volcengine credentials required: set VOLCENGINE_API_KEY, or VOLCENGINE_APP_ID + VOLCENGINE_ACCESS_TOKEN",
			);
		}

		const endpoints = Array.from(
			new Set([
				Envs.VOICE_VOLC_WS_URL,
				"wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
				"wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
				"wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream",
			]),
		);

		let ws: WebSocket | null = null;
		let lastError: Error | null = null;
		for (const endpoint of endpoints) {
			for (const candidateAuth of authCandidates) {
				try {
					const candidate = new WebSocket(endpoint, {
						headers: candidateAuth.headers,
					});
					await new Promise<void>((resolve, reject) => {
						let settled = false;
						const rejectOnce = (error: Error) => {
							if (settled) {
								return;
							}
							settled = true;
							reject(error);
						};
						candidate.once("open", () => {
							try {
								this.ws = candidate;
								this.sendFullClientRequest();
								settled = true;
								resolve();
							} catch (error) {
								rejectOnce(toError(error));
							}
						});
						// Bun's ws implementation currently doesn't support
						// 'unexpected-response' event; rely on 'error' for handshake failures.
						candidate.on("error", (error: Error) => {
							rejectOnce(toError(error));
						});
					});
					ws = candidate;
					break;
				} catch (error) {
					lastError = toError(error);
					handlers.onError(
						new Error(
							`volc connect failed @ ${endpoint} [${candidateAuth.label}]: ${lastError.message}`,
						),
					);
				}
			}
			if (ws) {
				break;
			}
		}

		if (!ws) {
			throw (
				lastError ??
				new Error(
					"volcengine websocket upgrade failed. Check VOICE_VOLC_WS_URL, VOICE_VOLC_RESOURCE_ID, and credentials.",
				)
			);
		}

		this.ws = ws;

		ws.on("message", (raw: RawData) => {
			try {
				const buffer = rawDataToBuffer(raw);
				const frame = parseFrame(buffer);

				if (frame.messageType === MSG_SERVER_ERROR) {
					const payload = maybeDecompress(frame.payload, frame.compression);
					const code = frame.errorCode ?? 0;
					const text = payload.toString("utf8").trim();
					if (code === 45000081) {
						if (!this.serverSessionEnded) {
							this.serverSessionEnded = true;
							handlers.onClose?.("volc session ended by server timeout");
						}
						if (this.ws && this.ws.readyState === WebSocket.OPEN) {
							this.closing = true;
							this.ws.close();
						}
						return;
					}
					const key = `${String(code)}:${text}`;
					if (this.seenServerErrorKeys.has(key)) {
						return;
					}
					this.seenServerErrorKeys.add(key);
					handlers.onError(
						new Error(`volc server error code=${String(code)}: ${text}`),
					);
					if (code === 55000000 && this.ws && this.ws.readyState === WebSocket.OPEN) {
						this.closing = true;
						this.ws.close();
					}
					return;
				}

				if (frame.messageType !== MSG_FULL_SERVER_RESPONSE) {
					return;
				}

				const payload = maybeDecompress(frame.payload, frame.compression);
				const parsed = JSON.parse(payload.toString("utf8")) as VolcServerPayload;
				const text = String(parsed.result?.text ?? "").trim();
				if (text) {
					handlers.onPartial({ text });
				}

				const utterances = parsed.result?.utterances ?? [];
				for (const utterance of utterances) {
					if (!utterance.definite) {
						continue;
					}
					const uText = String(utterance.text ?? "").trim();
					if (!uText) {
						continue;
					}
					const key = `${String(utterance.start_time ?? "")}:${String(utterance.end_time ?? "")}:${uText}`;
					if (this.emittedFinalKeys.has(key)) {
						continue;
					}
					this.emittedFinalKeys.add(key);
					const event: SttFinalEvent = {
						text: uText,
						startMs:
							typeof utterance.start_time === "number"
								? utterance.start_time
								: undefined,
						endMs:
							typeof utterance.end_time === "number"
								? utterance.end_time
								: undefined,
					};
					handlers.onFinal(event);
				}
			} catch (error) {
				this.parseErrors += 1;
				if (this.parseErrors <= 3) {
					handlers.onError(
						error instanceof Error
							? error
							: new Error(`failed to parse volc response: ${String(error)}`),
					);
				}
			}
		});

		ws.on("close", (code: number, reasonBuf: Buffer) => {
			const reason = reasonBuf.toString("utf8");
			handlers.onClose?.(
				`code=${String(code)} reason=${reason.length > 0 ? reason : ""}`,
			);
		});
	}

	sendAudio(chunk: Uint8Array): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}
		const payload = gzipSync(Buffer.from(chunk));
		const frame = buildFrame({
			messageType: MSG_AUDIO_ONLY_REQUEST,
			flags: FLAG_NO_SEQUENCE,
			serialization: SERIALIZATION_NONE,
			compression: COMPRESSION_GZIP,
			payload,
			includeSequence: false,
		});
		this.ws.send(frame);
	}

	finalize(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}
		const frame = buildFrame({
			messageType: MSG_AUDIO_ONLY_REQUEST,
			flags: FLAG_LAST_PACKET,
			serialization: SERIALIZATION_NONE,
			compression: COMPRESSION_NONE,
			payload: new Uint8Array(0),
			includeSequence: false,
		});
		this.ws.send(frame);
	}

	async close(): Promise<void> {
		if (!this.ws) {
			return;
		}
		const ws = this.ws;
		this.ws = null;
		this.closing = true;
		await new Promise<void>((resolve) => {
			if (ws.readyState === WebSocket.CLOSED) {
				resolve();
				return;
			}
			ws.once("close", () => resolve());
			ws.close();
		});
	}

	private sendFullClientRequest(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("volc websocket is not open");
		}
		const payloadObj = {
			audio: {
				format: "pcm",
				codec: "raw",
				rate: 16000,
				bits: 16,
				channel: 1,
			},
			request: {
				model_name: Envs.VOICE_VOLC_MODEL_NAME,
				enable_itn: true,
				enable_punc: true,
				show_utterances: true,
				result_type: "single",
				end_window_size: 800,
			},
		};
		const payload = gzipSync(Buffer.from(JSON.stringify(payloadObj), "utf8"));
		const frame = buildFrame({
			messageType: MSG_FULL_CLIENT_REQUEST,
			flags: FLAG_NO_SEQUENCE,
			serialization: SERIALIZATION_JSON,
			compression: COMPRESSION_GZIP,
			payload,
			includeSequence: false,
		});
		this.ws.send(frame);
	}
}
