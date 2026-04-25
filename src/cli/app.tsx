import { Box, Text, useApp, useInput } from "ink";
import { useEffect } from "react";
import { workspaceRoot } from "../config/workspace-root";
import { Envs } from "../util/env";
import { useBreakpoints } from "./hooks/useBreakpoints";
import { useTerminalSize } from "./hooks/useTerminalSize";
import { useTuiStore } from "./store/tui-store";
import { CommandPalette } from "./ui/components/ui/command-palette";
import { Divider } from "./ui/components/ui/divider";
import { ThemeProvider } from "./ui/components/ui/theme-provider";
import { Header } from "./ui/Header";
import { useScrollController } from "./ui/hooks/use-scroll-controller";
import { InputPrompt } from "./ui/InputPrompt";
import { RightSidebar } from "./ui/RightSidebar";
import { Transcript } from "./ui/Transcript";
import { cliTheme } from "./ui/theme";

export const CliApp = () => {
	const { exit } = useApp();
	const { cols, rows } = useTerminalSize();
	const bp = useBreakpoints(cols, rows);

	const blocks = useTuiStore((s) => s.blocks);
	const isStreaming = useTuiStore((s) => s.isStreaming);
	const debugState = useTuiStore((s) => s.debugState);
	const toggles = useTuiStore((s) => s.toggles);
	const totalUsage = useTuiStore((s) => s.totalUsage);
	const todoStats = useTuiStore((s) => s.todoStats);
	const usage = useTuiStore((s) => s.usage);
	const toolCalls = useTuiStore((s) => s.turnStats.toolCalls);
	const paletteOpen = useTuiStore((s) => s.paletteOpen);
	const commands = useTuiStore((s) => s.commands);

	const setPaletteOpen = useTuiStore((s) => s.setPaletteOpen);
	const submit = useTuiStore((s) => s.submit);
	const abort = useTuiStore((s) => s.abort);
	const handleKeyInput = useTuiStore((s) => s.handleKeyInput);

	const hasSidebar = cols >= 90;
	const sidebarWidth = hasSidebar ? 34 : 0;
	const leftCols = Math.max(20, cols - sidebarWidth - (hasSidebar ? 2 : 0));
	const contentHeight = rows - 4;
	const transcriptHeight = Math.max(
		3,
		bp.height === "short" ? contentHeight - 8 : contentHeight - 7,
	);

	const scroll = useScrollController(blocks, leftCols, transcriptHeight);

	useEffect(() => {
		if (!isStreaming) return;
		const id = setInterval(() => {
			const startAtMs = useTuiStore.getState().turnStats.startAtMs;
			if (startAtMs !== null) {
				useTuiStore.setState({
					elapsedSec: Math.floor((Date.now() - startAtMs) / 1000),
				});
			}
		}, 1000);
		return () => clearInterval(id);
	}, [isStreaming]);

	useInput((input, key) => {
		if (key.ctrl && input === "d") {
			exit();
			return;
		}
		if (key.ctrl && input === "c") {
			if (isStreaming) {
				abort();
			} else {
				exit();
			}
			return;
		}
		if (key.pageUp) {
			scroll.handlePageUp();
			return;
		}
		if (key.pageDown) {
			scroll.handlePageDown();
			return;
		}
		if (key.upArrow) {
			scroll.scrollUp(3);
			return;
		}
		if (key.downArrow) {
			scroll.scrollDown(3);
			return;
		}
		handleKeyInput(input, key);
	});

	const handleSubmit = async (rawValue: string): Promise<void> => {
		if (isStreaming) return;
		await submit(rawValue);
	};

	return (
		<ThemeProvider theme={cliTheme}>
			<Box flexDirection="column" flexGrow={1}>
				<Header cwd={workspaceRoot} modelId={Envs.MODEL_ID} width={bp.width} />
				<Divider />
				<Box flexDirection="row" gap={1} flexGrow={1}>
					<Box flexDirection="column" flexGrow={1} justifyContent="flex-start">
						<Box flexGrow={0} height={transcriptHeight}>
							<Transcript
								blocks={blocks}
								cols={leftCols}
								height={transcriptHeight}
								scrollOffset={scroll.offset}
								maxScrollOffset={scroll.maxOffset}
							/>
						</Box>
						<Divider />
						<InputPrompt
							isStreaming={isStreaming}
							height={bp.height}
							inputWidth={leftCols - 8}
							onSubmit={handleSubmit}
						/>
					</Box>
					{hasSidebar && (
						<Box height={transcriptHeight}>
							<RightSidebar
								debugState={debugState}
								height={transcriptHeight}
								isStreaming={isStreaming}
								toolCalls={toolCalls}
								turnUsage={usage}
								totalUsage={totalUsage}
								todoStats={todoStats}
								toggles={toggles}
							/>
						</Box>
					)}
				</Box>
				{!hasSidebar && (
					<Box justifyContent="space-between" paddingX={1}>
						<Text dimColor>ctrl+c · ctrl+d · ? help</Text>
						{isStreaming && <Text dimColor>● streaming</Text>}
					</Box>
				)}
				<CommandPalette
					commands={commands}
					isOpen={paletteOpen}
					onClose={() => setPaletteOpen(false)}
					placeholder="Type command..."
				/>
			</Box>
		</ThemeProvider>
	);
};
