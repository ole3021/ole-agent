import { Box, Text } from "ink";
import { Badge } from "./components/ui/badge";
import { Spinner } from "./components/ui/spinner";

type Props = {
	isStreaming: boolean;
	toolCalls: number;
	inputTokens: number;
	outputTokens: number;
	elapsedSec: number;
};

const formatTokens = (n: number): string => {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
};

export const StatusStrip = ({
	elapsedSec,
	inputTokens,
	isStreaming,
	outputTokens,
	toolCalls,
}: Props) => (
	<Box
		borderStyle="single"
		borderColor="gray"
		paddingX={1}
		justifyContent="space-between"
	>
		<Box>
			{isStreaming ? <Spinner label="thinking" /> : <Text dimColor>idle</Text>}
		</Box>
		<Box gap={1}>
			<Badge variant="secondary" bordered={false}>
				{`${toolCalls} tools`}
			</Badge>
			<Badge variant="secondary" bordered={false}>
				{`${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out`}
			</Badge>
			<Badge variant="secondary" bordered={false}>
				{`${elapsedSec}s`}
			</Badge>
		</Box>
	</Box>
);
