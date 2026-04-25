import { Box, Text } from "ink";
import type { WidthBreakpoint } from "../hooks/useBreakpoints";

type Props = {
	cwd: string;
	modelId: string;
	width: WidthBreakpoint;
};

const compactModel = (modelId: string): string => {
	const parts = modelId.split("/");
	return parts[parts.length - 1] ?? modelId;
};

export const Header = ({ cwd, modelId, width }: Props) => (
	<Box
		borderStyle={width === "xs" ? undefined : "round"}
		borderColor={width === "xs" ? undefined : "gray"}
		paddingX={width === "xs" ? 0 : 1}
		paddingY={0}
		justifyContent="space-between"
		alignItems="center"
	>
		<Box gap={1} alignItems="center">
			<Text bold color="cyan">
				⬡
			</Text>
			<Text bold>ole-agent</Text>
		</Box>
		<Box gap={1} alignItems="center">
			<Text dimColor>◆</Text>
			<Text dimColor>{compactModel(modelId)}</Text>
			{width === "md" && (
				<>
					<Text dimColor>│</Text>
					<Text dimColor>{cwd}</Text>
				</>
			)}
		</Box>
	</Box>
);
