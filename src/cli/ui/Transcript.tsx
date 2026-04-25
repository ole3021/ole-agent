import { Box, Text } from "ink";
import { useMemo } from "react";
import type { TranscriptBlock } from "../store/tui-store";
import { AssistantBlock } from "./blocks/AssistantBlock";
import { ErrorBlock } from "./blocks/ErrorBlock";
import { SubAgentGroup } from "./blocks/SubAgentGroup";
import { ThinkingBlock } from "./blocks/ThinkingBlock";
import { ToolCallBlock } from "./blocks/ToolCallBlock";
import { UserBlock } from "./blocks/UserBlock";
import { useTheme } from "./components/ui/theme-provider";
import { buildBlockHeightMap, computeVisibleBlocks } from "./lib/text-utils";

type Props = {
	blocks: TranscriptBlock[];
	height: number;
	cols: number;
	scrollOffset: number;
	maxScrollOffset: number;
};

const BlockSeparator = ({
	theme,
}: {
	theme: { colors: { border: string; mutedForeground: string } };
}) => (
	<Box marginY={0}>
		<Text color={theme.colors.mutedForeground}>·</Text>
	</Box>
);

const renderBlock = (
	block: TranscriptBlock,
	maxArgsLength: number,
	isLast: boolean,
	theme: { colors: { mutedForeground: string; border: string } },
) => {
	const blockElement = (() => {
		switch (block.type) {
			case "user":
				return <UserBlock block={block} />;
			case "assistant":
				return <AssistantBlock block={block} />;
			case "reasoning":
				return <ThinkingBlock block={block} />;
			case "tool":
				return <ToolCallBlock block={block} maxArgsLength={maxArgsLength} />;
			case "subagent":
				return <SubAgentGroup block={block} />;
			case "error":
				return <ErrorBlock block={block} />;
			case "usage":
				return (
					<Text color={theme.colors.mutedForeground} dimColor>
						{`· usage in=${block.input} out=${block.output} total=${block.total}`}
					</Text>
				);
			default:
				return null;
		}
	})();

	if (isLast) {
		return <Box key={block.id}>{blockElement}</Box>;
	}

	return (
		<Box key={block.id} flexDirection="column">
			{blockElement}
			<BlockSeparator theme={theme} />
		</Box>
	);
};

const ScrollIndicator = ({
	scrollOffset,
	maxScrollOffset,
	totalBlocks,
	visibleBlocks,
}: {
	scrollOffset: number;
	maxScrollOffset: number;
	totalBlocks: number;
	visibleBlocks: number;
}) => {
	if (totalBlocks === 0) return null;
	if (maxScrollOffset === 0) return null;

	const progress = maxScrollOffset > 0 ? scrollOffset / maxScrollOffset : 0;
	const barWidth = Math.min(20, totalBlocks);
	const filledWidth = Math.round(progress * barWidth);
	const emptyWidth = barWidth - filledWidth;

	return (
		<Box gap={1} alignItems="center" marginBottom={0}>
			<Text dimColor>│</Text>
			<Text dimColor>
				{"─".repeat(filledWidth)}●{"─".repeat(emptyWidth)}
			</Text>
			<Text dimColor>│</Text>
			<Text dimColor>
				{visibleBlocks}/{totalBlocks}
			</Text>
		</Box>
	);
};

const EmptyState = ({ cols }: { cols: number }) => {
	const hints = [
		"Try asking me to help with coding tasks",
		"Type / for command palette",
		"Use ctrl+r/t/u to toggle display options",
	];
	const hint = hints[Math.floor(Date.now() / 10000) % hints.length];

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			height={3}
		>
			<Text color="cyan" bold>
				ole-agent
			</Text>
			<Text dimColor>{hint}</Text>
			<Text dimColor>{"─".repeat(Math.min(cols - 2, 40))}</Text>
		</Box>
	);
};

export const Transcript = ({
	blocks,
	cols,
	height,
	scrollOffset,
	maxScrollOffset,
}: Props) => {
	const theme = useTheme();
	const visibleCount = Math.max(1, height);
	const maxArgsLength = Math.max(20, cols - 16);

	const blockHeightMap = useMemo(
		() => buildBlockHeightMap(blocks, cols),
		[blocks, cols],
	);

	const visibleBlocks = useMemo(
		() =>
			computeVisibleBlocks(
				blocks,
				blockHeightMap,
				scrollOffset,
				visibleCount,
				cols,
			),
		[blocks, blockHeightMap, scrollOffset, visibleCount, cols],
	);

	const isScrolled = scrollOffset > 0;
	const isAtEnd = scrollOffset >= maxScrollOffset - 1;

	return (
		<Box flexDirection="column" minHeight={visibleCount}>
			{blocks.length === 0 ? (
				<EmptyState cols={cols} />
			) : (
				<>
					{isScrolled && (
						<ScrollIndicator
							scrollOffset={scrollOffset}
							maxScrollOffset={maxScrollOffset}
							totalBlocks={blocks.length}
							visibleBlocks={visibleBlocks.length}
						/>
					)}
					<Box flexDirection="column" flexGrow={1}>
						{visibleBlocks.map(({ block }, index) =>
							renderBlock(
								block,
								maxArgsLength,
								index === visibleBlocks.length - 1,
								theme,
							),
						)}
					</Box>
					{!isAtEnd && blocks.length > 0 && (
						<Box alignItems="center">
							<Text dimColor>▼</Text>
						</Box>
					)}
				</>
			)}
		</Box>
	);
};
