import type { KeyEvent } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback } from "react";
import {
	isCtrlC,
	isCtrlD,
	singleCharKeyInput,
	type TranscriptScrollApi,
	tryConsumeTranscriptScrollKey,
} from "../lib/key-matching";
import { useTuiStore } from "../store/tui-store";

type UseTuiKeyboardOptions = {
	scroll: TranscriptScrollApi;
};

/**
 * Global keyboard: exit, stream abort, scroll, then delegating to the store
 * (toggles, command palette, etc.). Mirrors the former Ink `app.tsx` routing.
 */
export const useTuiKeyboard = ({ scroll }: UseTuiKeyboardOptions): void => {
	const renderer = useRenderer();
	const isStreaming = useTuiStore((s) => s.isStreaming);
	const abort = useTuiStore((s) => s.abort);
	const handleKeyInput = useTuiStore((s) => s.handleKeyInput);
	const paletteOpen = useTuiStore((s) => s.paletteOpen);
	const setPaletteOpen = useTuiStore((s) => s.setPaletteOpen);
	const globalError = useTuiStore((s) => s.globalError);
	const setGlobalError = useTuiStore((s) => s.setGlobalError);

	const exitApp = useCallback(() => {
		renderer.destroy();
	}, [renderer]);

	const onKey = useCallback(
		(e: KeyEvent) => {
			if (e.eventType === "release") {
				return;
			}

			if (globalError && e.name === "escape" && !e.ctrl) {
				setGlobalError(null);
				e.stopPropagation();
				return;
			}

			if (paletteOpen) {
				if (e.name === "escape" && !e.ctrl) {
					setPaletteOpen(false);
					e.stopPropagation();
				}
				return;
			}

			if (isCtrlD(e)) {
				e.stopPropagation();
				exitApp();
				return;
			}
			if (isCtrlC(e)) {
				e.stopPropagation();
				if (isStreaming) {
					e.preventDefault();
					abort();
				} else {
					exitApp();
				}
				return;
			}
			if (tryConsumeTranscriptScrollKey(e, scroll)) {
				return;
			}

			const keyForStore = {
				ctrl: e.ctrl,
				pageUp: e.name === "pageup",
				pageDown: e.name === "pagedown",
				upArrow: e.name === "up",
				downArrow: e.name === "down",
			};

			const input = singleCharKeyInput(e);

			void handleKeyInput(input, keyForStore);
		},
		[
			abort,
			exitApp,
			globalError,
			handleKeyInput,
			isStreaming,
			paletteOpen,
			scroll,
			setGlobalError,
			setPaletteOpen,
		],
	);

	useKeyboard(onKey);
};
