import { Box, Text } from "ink";
import type { TranscriptBlock } from "../../store/tui-store";
import { useTheme } from "../components/ui/theme-provider";

type Props = {
	block: Extract<TranscriptBlock, { type: "tool" }>;
	maxArgsLength: number;
};

const StatusIcon = ({ status }: { status: Props["block"]["status"] }) => {
	const theme = useTheme();
	switch (status) {
		case "running":
			return <Text color={theme.colors.primary}>◐</Text>;
		case "ok":
			return <Text color={theme.colors.success}>✓</Text>;
		case "error":
			return <Text color={theme.colors.error}>✗</Text>;
		default:
			return null;
	}
};

const StatusBadge = ({
	status,
	theme,
}: {
	status: Props["block"]["status"];
	theme: { colors: { success: string; error: string; primary: string } };
}) => {
	const color =
		status === "ok"
			? theme.colors.success
			: status === "error"
				? theme.colors.error
				: theme.colors.primary;
	const label = status;
	return (
		<Box borderStyle="round" borderColor={color} paddingX={1}>
			<Box gap={1} alignItems="center">
				<StatusIcon status={status} />
				<Text color={color}>{label}</Text>
			</Box>
		</Box>
	);
};

export const ToolCallBlock = ({ block, maxArgsLength }: Props) => {
	const theme = useTheme();

	const scopeLabel =
		typeof block.scope === "string" ? "" : ` · ${block.scope.sub}`;

	const shouldTruncate = block.args.length > maxArgsLength;
	const displayArgs = shouldTruncate
		? block.args.slice(0, maxArgsLength)
		: block.args;

	return (
		<Box
			flexDirection="column"
			marginBottom={1}
			borderStyle="single"
			borderColor={theme.colors.border}
			paddingX={1}
		>
			<Box gap={1} alignItems="center">
				<Text color={theme.colors.accent}>▸</Text>
				<Text bold color={theme.colors.foreground}>
					{block.toolName}
				</Text>
				{scopeLabel && (
					<Text dimColor color={theme.colors.mutedForeground}>
						{scopeLabel}
					</Text>
				)}
				<StatusBadge status={block.status} theme={theme} />
			</Box>

			<Box flexDirection="column" paddingLeft={2}>
				<Box gap={1}>
					<Text dimColor>args:</Text>
					<Text color={theme.colors.mutedForeground}>{displayArgs}</Text>
					{shouldTruncate && (
						<Text dimColor color={theme.colors.primary}>
							...
						</Text>
					)}
				</Box>

				{block.preview && (
					<Box gap={1} marginTop={0}>
						<Text dimColor>result:</Text>
						<Text dimColor color={theme.colors.mutedForeground}>
							{block.preview.slice(0, 200)}
							{block.preview.length > 200 ? "..." : ""}
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
};
