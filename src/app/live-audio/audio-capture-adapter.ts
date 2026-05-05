export type AudioCaptureHandlers = {
	onChunk: (chunk: Uint8Array) => void;
	onError: (error: Error) => void;
	onClose?: () => void;
};

export interface AudioCaptureAdapter {
	start(handlers: AudioCaptureHandlers): Promise<void>;
	stop(): Promise<void>;
}
