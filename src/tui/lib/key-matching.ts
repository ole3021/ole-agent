import type { KeyEvent } from "@opentui/core";

const matchesCtrlLetter = (
	e: Pick<KeyEvent, "ctrl" | "name" | "raw">,
	letter: string,
): boolean => {
	if (!e.ctrl || letter.length !== 1) {
		return false;
	}
	const n = letter.toLowerCase().charCodeAt(0) - 96;
	if (n < 1 || n > 26) {
		return false;
	}
	if (e.name.length === 1 && e.name.toLowerCase() === letter) {
		return true;
	}
	if (e.name.length === 1) {
		const cp = e.name.codePointAt(0) ?? 0;
		if (cp >= 1 && cp <= 26) {
			return cp === n;
		}
	}
	if (e.raw.length === 1) {
		const b = e.raw.codePointAt(0) ?? 0;
		if (b >= 1 && b <= 26) {
			return b === n;
		}
	}
	return false;
};

const isEtx = (e: Pick<KeyEvent, "name" | "raw">): boolean => {
	if (e.name.length === 1) {
		const cp = e.name.codePointAt(0) ?? 0;
		if (cp === 3) {
			return true;
		}
	}
	if (e.raw.length >= 1) {
		const b = e.raw.codePointAt(0) ?? 0;
		if (b === 3) {
			return true;
		}
	}
	return false;
};

export const isCtrlC = (
	e: Pick<KeyEvent, "ctrl" | "name" | "raw">,
): boolean => {
	if (matchesCtrlLetter(e, "c")) {
		return true;
	}
	return isEtx(e);
};

export const isCtrlD = (e: Pick<KeyEvent, "ctrl" | "name" | "raw">): boolean =>
	matchesCtrlLetter(e, "d");

export type TranscriptScrollApi = {
	handlePageUp: () => void;
	handlePageDown: () => void;
	scrollUp: (lines?: number) => void;
	scrollDown: (lines?: number) => void;
};

const TRANSCRIPT_SCROLL_STEP = 3;

export const tryConsumeTranscriptScrollKey = (
	e: KeyEvent,
	api: TranscriptScrollApi,
): boolean => {
	if (e.eventType === "release") {
		return false;
	}
	if (e.name === "pageup") {
		api.handlePageUp();
		return true;
	}
	if (e.name === "pagedown") {
		api.handlePageDown();
		return true;
	}
	if (e.name === "up") {
		api.scrollUp(TRANSCRIPT_SCROLL_STEP);
		return true;
	}
	if (e.name === "down") {
		api.scrollDown(TRANSCRIPT_SCROLL_STEP);
		return true;
	}
	return false;
};

export const singleCharKeyInput = (e: KeyEvent): string => {
	if (e.name === "return") {
		return "\r";
	}
	if (e.name.length !== 1) {
		return "";
	}
	if (e.ctrl) {
		const cp = e.name.codePointAt(0) ?? 0;
		if (cp >= 1 && cp <= 26) {
			return String.fromCodePoint(96 + cp);
		}
	}
	return e.name;
};
