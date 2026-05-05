import { platform } from "node:process";
import { Envs } from "../../util/env";
import type {
	AudioCaptureAdapter,
	AudioCaptureHandlers,
} from "./audio-capture-adapter";

const DEFAULT_SAMPLE_RATE = 16_000;
const CHUNK_BYTES = 6400;

function resolveInputArgs(): string[] {
	if (platform === "darwin") {
		const device = Envs.VOICE_FFMPEG_DEVICE ?? "0";
		return ["-f", "avfoundation", "-i", `:${device}`];
	}
	if (platform === "linux") {
		const device = Envs.VOICE_FFMPEG_DEVICE ?? "default";
		return ["-f", "pulse", "-i", device];
	}
	if (platform === "win32") {
		const device = Envs.VOICE_FFMPEG_DEVICE ?? "default";
		return ["-f", "dshow", "-i", `audio=${device}`];
	}
	throw new Error(`Unsupported platform for ffmpeg capture: ${platform}`);
}

export class FfmpegAudioCaptureAdapter implements AudioCaptureAdapter {
	private process: Bun.Subprocess | null = null;
	private readingTask: Promise<void> | null = null;
	private stderrTail = "";
	private stopping = false;

	async start(handlers: AudioCaptureHandlers): Promise<void> {
		if (this.process) {
			throw new Error("ffmpeg capture already started");
		}

		const cmd = [
			"ffmpeg",
			"-hide_banner",
			"-loglevel",
			"error",
			...resolveInputArgs(),
			"-ac",
			"1",
			"-ar",
			String(DEFAULT_SAMPLE_RATE),
			"-f",
			"s16le",
			"-acodec",
			"pcm_s16le",
			"-",
		];

		let proc: Bun.Subprocess;
		try {
			proc = Bun.spawn(cmd, {
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});
		} catch (error) {
			const maybeErr = error as { code?: string } | undefined;
			if (maybeErr?.code === "ENOENT") {
				throw new Error(
					"ffmpeg is not installed or not in PATH. Install ffmpeg first (macOS: `brew install ffmpeg`).",
				);
			}
			throw error;
		}

		this.process = proc;
		this.stderrTail = "";
		this.stopping = false;
		this.readingTask = this.readStdout(proc, handlers).catch((error) => {
			handlers.onError(
				error instanceof Error ? error : new Error(String(error)),
			);
		});

		void this.readStderr(proc);

		proc.exited.then((code) => {
			const isExpectedInterrupt = code === 255;
			if (code !== 0 && !this.stopping && !isExpectedInterrupt) {
				const detail = this.stderrTail.trim();
				handlers.onError(
					new Error(
						detail
							? `ffmpeg exited with code ${code}: ${detail}`
							: `ffmpeg exited with code ${code}`,
					),
				);
			}
			handlers.onClose?.();
		});
	}

	async stop(): Promise<void> {
		const proc = this.process;
		this.process = null;
		if (!proc) {
			return;
		}
		this.stopping = true;
		proc.kill("SIGTERM");
		await proc.exited;
		await this.readingTask;
		this.readingTask = null;
	}

	private async readStdout(
		proc: Bun.Subprocess,
		handlers: AudioCaptureHandlers,
	): Promise<void> {
		const stream = proc.stdout;
		if (!stream || typeof stream === "number") {
			throw new Error("ffmpeg stdout is not a stream");
		}
		const reader = stream.getReader();
		let pending = new Uint8Array(0);
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value && value.length > 0) {
				if (pending.length === 0) {
					pending = value;
				} else {
					const merged = new Uint8Array(pending.length + value.length);
					merged.set(pending, 0);
					merged.set(value, pending.length);
					pending = merged;
				}

				while (pending.length >= CHUNK_BYTES) {
					handlers.onChunk(pending.slice(0, CHUNK_BYTES));
					pending = pending.slice(CHUNK_BYTES);
				}
			}
		}
		if (pending.length > 0) {
			handlers.onChunk(pending);
		}
	}

	private async readStderr(proc: Bun.Subprocess): Promise<void> {
		const stream = proc.stderr;
		if (!stream || typeof stream === "number") {
			return;
		}
		const decoder = new TextDecoder();
		const reader = stream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value && value.length > 0) {
				const text = decoder.decode(value, { stream: true });
				this.stderrTail = `${this.stderrTail}${text}`;
				if (this.stderrTail.length > 1200) {
					this.stderrTail = this.stderrTail.slice(this.stderrTail.length - 1200);
				}
			}
		}
	}
}
