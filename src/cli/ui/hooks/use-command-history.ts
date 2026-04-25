import { useCallback, useRef, useState } from "react";

const MAX_HISTORY = 50;

export interface CommandHistoryEntry {
	value: string;
	timestamp: number;
}

export const useCommandHistory = (initial: string[] = []) => {
	const [history, setHistory] = useState<CommandHistoryEntry[]>(
		initial.map((v) => ({ value: v, timestamp: Date.now() })),
	);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const currentInputRef = useRef("");

	const addToHistory = useCallback((value: string) => {
		if (!value.trim()) return;
		setHistory((prev) => {
			const filtered = prev.filter((h) => h.value !== value);
			const newEntry = { value, timestamp: Date.now() };
			const updated = [newEntry, ...filtered].slice(0, MAX_HISTORY);
			return updated;
		});
		setHistoryIndex(-1);
		currentInputRef.current = "";
	}, []);

	const navigateHistory = useCallback(
		(direction: "up" | "down"): string | null => {
			if (history.length === 0) return null;

			if (direction === "up") {
				if (historyIndex === -1) {
					currentInputRef.current =
						typeof window !== "undefined"
							? (window as unknown as { __currentInput?: string })
									.__currentInput || ""
							: "";
				}
				const newIndex = Math.min(historyIndex + 1, history.length - 1);
				setHistoryIndex(newIndex);
				return history[newIndex]?.value ?? null;
			} else {
				if (historyIndex <= 0) {
					setHistoryIndex(-1);
					return currentInputRef.current;
				}
				const newIndex = historyIndex - 1;
				setHistoryIndex(newIndex);
				return history[newIndex]?.value ?? null;
			}
		},
		[history, historyIndex],
	);

	const clearHistory = useCallback(() => {
		setHistory([]);
		setHistoryIndex(-1);
	}, []);

	const saveCurrentInput = useCallback((input: string) => {
		currentInputRef.current = input;
		if (typeof window !== "undefined") {
			(window as unknown as { __currentInput?: string }).__currentInput = input;
		}
	}, []);

	return {
		history: history.map((h) => h.value),
		addToHistory,
		navigateHistory,
		clearHistory,
		saveCurrentInput,
		historyIndex,
		isNavigatingHistory: historyIndex >= 0,
	};
};
