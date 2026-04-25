import { Box, Text } from "ink";
import type { TranscriptBlock } from "../../store/tui-store";
import { ChatMessage } from "../components/ui/chat-message";
import { StreamingText } from "../components/ui/streaming-text";
import { useTheme } from "../components/ui/theme-provider";

type Props = {
	block: Extract<TranscriptBlock, { type: "assistant" }>;
};

const getScopeName = (scope: Props["block"]["scope"]): string => {
	if (typeof scope === "string") {
		return "assistant";
	}
	return `sub:${scope.sub}`;
};

export const AssistantBlock = ({ block }: Props) => {
	const theme = useTheme();
	const scopeName = getScopeName(block.scope);

	const isMain = typeof block.scope === "string";
	const lineCount = block.text.split("\n").length;
	const charCount = block.text.length;
	const shouldCollapsible = lineCount > 15 || charCount > 600;

	const headerInfo = `${lineCount} lines`;

	return (
		<ChatMessage
			sender="assistant"
			name={scopeName}
			streaming={block.streaming}
			collapsible={shouldCollapsible}
			defaultCollapsed={false}
		>
			<Box flexDirection="column">
				{!isMain && (
					<Box gap={1} marginBottom={0}>
						<Text dimColor color={theme.colors.accent}>
							{" ↳ "}
							{scopeName.replace("sub:", "collaborator.")}
						</Text>
					</Box>
				)}
				<StreamingText
					text={block.text}
					cursor={block.streaming}
					animate={block.streaming}
					speed={15}
				/>
				{!block.streaming && shouldCollapsible && (
					<Text dimColor color={theme.colors.mutedForeground}>
						{headerInfo}
					</Text>
				)}
			</Box>
		</ChatMessage>
	);
};
