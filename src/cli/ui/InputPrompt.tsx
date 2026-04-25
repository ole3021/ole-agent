import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { HeightBreakpoint } from "../hooks/useBreakpoints";
import { useTuiStore } from "../store/tui-store";
import { Spinner } from "./components/ui/spinner";
import { TextInput } from "./components/ui/text-input";
import { useCommandHistory } from "./hooks/use-command-history";

type Props = {
	isStreaming: boolean;
	height: HeightBreakpoint;
	inputWidth: number;
	onSubmit: (value: string) => Promise<void>;
};

const placeholders = [
	"Ask anything...",
	"Try: explain this code",
	"Try: help me write a function",
	"Try: debug this error",
	"Try: refactor this module",
];

export const InputPrompt = ({
	isStreaming,
	height: _height,
	inputWidth,
	onSubmit,
}: Props) => {
	const query = useTuiStore((s) => s.query);
	const setQuery = useTuiStore((s) => s.setQuery);

	const [placeholderIndex, setPlaceholderIndex] = useState(0);
	const [showCharCount, setShowCharCount] = useState(false);

	const { addToHistory, navigateHistory } = useCommandHistory();

	useEffect(() => {
		if (isStreaming) return;
		const id = setInterval(() => {
			setPlaceholderIndex((i) => (i + 1) % placeholders.length);
		}, 5000);
		return () => clearInterval(id);
	}, [isStreaming]);

	useEffect(() => {
		setShowCharCount(query.length > 50);
	}, [query.length]);

	const handleChange = (value: string) => {
		setQuery(value);
	};

	const handleSubmit = async (value: string) => {
		if (!value.trim()) return;
		addToHistory(value);
		await onSubmit(value);
	};

	const handleKeyDown = (key: { upArrow?: boolean; downArrow?: boolean }) => {
		if (key.upArrow) {
			const historical = navigateHistory("up");
			if (historical !== null) {
				setQuery(historical);
			}
		} else if (key.downArrow) {
			const historical = navigateHistory("down");
			if (historical !== null) {
				setQuery(historical);
			}
		}
	};

	const placeholder =
		placeholders[isStreaming ? 0 : placeholderIndex % placeholders.length];

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={isStreaming ? "cyan" : "gray"}
			paddingX={1}
		>
			<Box justifyContent="space-between" alignItems="center">
				<Text bold color={isStreaming ? "cyan" : "white"}>
					▸
				</Text>
				{isStreaming && (
					<Box gap={1} alignItems="center">
						<Spinner type="dots" label="thinking" />
						<Text dimColor>ctrl+c to cancel</Text>
					</Box>
				)}
				{!isStreaming && showCharCount && <Text dimColor>{query.length}</Text>}
			</Box>
			<TextInput
				value={query}
				onChange={handleChange}
				onSubmit={handleSubmit}
				placeholder={isStreaming ? "waiting for response..." : placeholder}
				width={Math.max(20, inputWidth)}
				bordered={false}
				autoFocus
				onKeyDown={handleKeyDown}
				showCursor={!isStreaming}
			/>
		</Box>
	);
};
