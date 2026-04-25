import { useCallback } from "react";
import { type Command, useTuiStore } from "../store/tui-store";

export const useCommandRegistry = () => {
	const registerCommand = useCallback((cmd: Command) => {
		useTuiStore.getState().registerCommand(cmd);
	}, []);

	const unregisterCommand = useCallback((cmdId: string) => {
		useTuiStore.getState().unregisterCommand(cmdId);
	}, []);

	const toggleReason = useCallback(() => {
		const { toggles, setToggles } = useTuiStore.getState();
		setToggles({ reason: !toggles.reason });
	}, []);

	const toggleToolCall = useCallback(() => {
		const { toggles, setToggles } = useTuiStore.getState();
		setToggles({ toolCall: !toggles.toolCall });
	}, []);

	const toggleUsage = useCallback(() => {
		const { toggles, setToggles } = useTuiStore.getState();
		setToggles({ usage: !toggles.usage });
	}, []);

	const clearTranscript = useCallback(() => {
		useTuiStore.getState().clear();
	}, []);

	return {
		registerCommand,
		unregisterCommand,
		toggleReason,
		toggleToolCall,
		toggleUsage,
		clearTranscript,
	};
};
