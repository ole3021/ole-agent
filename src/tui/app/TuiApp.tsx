/** @jsxImportSource @opentui/react */
import type { KeyEvent } from "@opentui/core";
import { useCallback, useEffect } from "react";
import { workspaceRoot } from "../../config/workspace-root";
import { Envs } from "../../util/env";
import { useScrollController } from "../hooks/useScrollController";
import { useTuiKeyboard } from "../hooks/useTuiKeyboard";
import { useTuiLayout } from "../hooks/useTuiLayout";
import { useTuiTerminalSize } from "../hooks/useTuiTerminalSize";
import { RootLayout } from "../layout/RootLayout";
import { isCtrlC, tryConsumeTranscriptScrollKey } from "../lib/key-matching";
import { getTranscriptBodyScrollRows } from "../lib/transcript-layout";
import { useTuiStore } from "../store/tui-store";
import { tuiColors } from "../theme/colors";
import { CommandPaletteView } from "../views/CommandPaletteView";
import { HeaderView } from "../views/HeaderView";
import { InputBar } from "../views/InputBar";
import { SidebarView } from "../views/SidebarView";
import { TranscriptView } from "../views/TranscriptView";

export const TuiApp = () => {
	useTuiTerminalSize();

	const blocks = useTuiStore((s) => s.blocks);
	const isStreaming = useTuiStore((s) => s.isStreaming);
	const debugState = useTuiStore((s) => s.debugState);
	const toggles = useTuiStore((s) => s.toggles);
	const totalUsage = useTuiStore((s) => s.totalUsage);
	const agentTodos = useTuiStore((s) => s.agentTodos);
	const executionRuntime = useTuiStore((s) => s.executionRuntime);
	const executionTimeline = useTuiStore((s) => s.executionTimeline);
	const usage = useTuiStore((s) => s.usage);
	const toolCalls = useTuiStore((s) => s.turnStats.toolCalls);
	const paletteOpen = useTuiStore((s) => s.paletteOpen);
	const commands = useTuiStore((s) => s.commands);
	const query = useTuiStore((s) => s.query);
	const inputResetEpoch = useTuiStore((s) => s.inputResetEpoch);
	const setQuery = useTuiStore((s) => s.setQuery);
	const submit = useTuiStore((s) => s.submit);
	const abort = useTuiStore((s) => s.abort);
	const cols = useTuiStore((s) => s.cols);
	const rows = useTuiStore((s) => s.rows);
	const globalError = useTuiStore((s) => s.globalError);

	const { bp, hasSidebar, sidebarWidth, leftCols, transcriptHeight } =
		useTuiLayout(cols, rows);

	const transcriptBodyLines = getTranscriptBodyScrollRows(transcriptHeight);
	const {
		offset: scrollOffset,
		maxOffset: maxScrollOffset,
		scrollToBottom,
		scrollUp,
		scrollDown,
		handlePageUp,
		handlePageDown,
	} = useScrollController(blocks, leftCols, transcriptBodyLines);

	useTuiKeyboard({
		scroll: { handlePageUp, handlePageDown, scrollUp, scrollDown },
	});

	useEffect(() => {
		if (!isStreaming) {
			return;
		}
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

	useEffect(() => {
		const id = "transcript:scroll-to-bottom";
		useTuiStore.getState().registerCommand({
			id,
			label: "回到底部",
			description: "将转写区滚动到最新",
			onSelect: () => {
				scrollToBottom();
			},
		});
		return () => {
			useTuiStore.getState().unregisterCommand(id);
		};
	}, [scrollToBottom]);

	const handleSubmit = async (raw: string) => {
		if (isStreaming) {
			return;
		}
		await submit(raw);
	};

	const handleInputKeyDown = useCallback(
		(e: KeyEvent) => {
			if (e.eventType === "release") {
				return;
			}
			if (useTuiStore.getState().paletteOpen) {
				return;
			}
			if (
				tryConsumeTranscriptScrollKey(e, {
					handlePageDown,
					handlePageUp,
					scrollDown,
					scrollUp,
				})
			) {
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			if (!isCtrlC(e)) {
				return;
			}
			if (!useTuiStore.getState().isStreaming) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			abort();
		},
		[abort, handlePageDown, handlePageUp, scrollDown, scrollUp],
	);

	return (
		<RootLayout>
			<HeaderView
				compact={bp.width === "xs" || bp.width === "sm"}
				cwd={workspaceRoot}
				modelId={Envs.MODEL_ID}
			/>
			{globalError ? (
				<box paddingLeft={1} paddingRight={1} flexShrink={0}>
					<text fg={tuiColors.error}>{`${globalError} (esc to dismiss)`}</text>
				</box>
			) : null}
			<box flexDirection="row" flexGrow={1} gap={1}>
				<box flexDirection="column" flexGrow={1} gap={0}>
					<TranscriptView
						blocks={blocks}
						height={transcriptHeight}
						maxScrollOffset={maxScrollOffset}
						scrollOffset={scrollOffset}
						scrollDown={scrollDown}
						scrollUp={scrollUp}
						textCols={leftCols}
						totalUsage={totalUsage}
					/>
					<InputBar
						inputResetKey={inputResetEpoch}
						isStreaming={isStreaming}
						onChange={setQuery}
						onKeyDown={handleInputKeyDown}
						onSubmit={handleSubmit}
						value={query}
					/>
				</box>
				{hasSidebar ? (
					<box width={sidebarWidth} flexDirection="column">
						<SidebarView
							agentTodos={agentTodos}
							debugState={debugState}
							executionRuntime={executionRuntime}
							executionTimeline={executionTimeline}
							height={transcriptHeight}
							isStreaming={isStreaming}
							sidebarCols={sidebarWidth}
							toggles={toggles}
							toolCalls={toolCalls}
							totalUsage={totalUsage}
							turnUsage={usage}
						/>
					</box>
				) : null}
			</box>
			<CommandPaletteView commands={commands} isOpen={paletteOpen} />
		</RootLayout>
	);
};
