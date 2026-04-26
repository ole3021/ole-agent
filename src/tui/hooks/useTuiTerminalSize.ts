import { useOnResize, useRenderer } from "@opentui/react";
import { useLayoutEffect } from "react";
import { useTuiStore } from "../store/tui-store";

/**
 * Keeps `cols` / `rows` in the Zustand store in sync with the OpenTUI renderer.
 */
export const useTuiTerminalSize = (): void => {
	const renderer = useRenderer();
	const setTerminalSize = useTuiStore((s) => s.setTerminalSize);

	useLayoutEffect(() => {
		setTerminalSize(renderer.width, renderer.height);
	}, [renderer, setTerminalSize]);

	useOnResize((width, height) => {
		setTerminalSize(width, height);
	});
};
