export type SttPartialEvent = {
	text: string;
	speaker?: string;
};

export type SttFinalEvent = {
	text: string;
	speaker?: string;
	startMs?: number;
	endMs?: number;
};

export type SttProviderHandlers = {
	onPartial: (event: SttPartialEvent) => void;
	onFinal: (event: SttFinalEvent) => void;
	onError: (error: Error) => void;
	onClose?: (detail?: string) => void;
};

export interface SttProviderAdapter {
	connect(handlers: SttProviderHandlers): Promise<void>;
	sendAudio(chunk: Uint8Array): void;
	finalize?(): void;
	close(): Promise<void>;
}
