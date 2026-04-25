import { Box, Text } from "ink";
import type { DebugState } from "../store/tui-store";

type Usage = {
	input: number;
	output: number;
	total: number;
};

type TodoStats = {
	pending: number;
	inProgress: number;
	completed: number;
	cancelled: number;
};

type Props = {
	debugState: DebugState;
	height: number;
	isStreaming: boolean;
	toolCalls: number;
	turnUsage: Usage;
	totalUsage: Usage;
	todoStats: TodoStats;
	toggles: { reason: boolean; toolCall: boolean; usage: boolean };
};

const fmt = (n: number): string => {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
};

const StatusIndicator = ({
	state,
	isStreaming,
}: {
	state: DebugState;
	isStreaming: boolean;
}) => {
	if (isStreaming) return <Text color="cyan">◐ running</Text>;
	if (state === "done") return <Text color="green">✓ done</Text>;
	if (state === "error") return <Text color="red">✗ error</Text>;
	if (state === "aborted") return <Text color="yellow">◌ aborted</Text>;
	if (state === "idle") return <Text dimColor>○ idle</Text>;
	return <Text dimColor>○ {state}</Text>;
};

const ToggleIndicator = ({
	label,
	enabled,
}: {
	label: string;
	enabled: boolean;
}) => (
	<Box gap={1}>
		<Text color={enabled ? "green" : "gray"}>{enabled ? "◉" : "○"}</Text>
		<Text color="gray">{label}</Text>
	</Box>
);

const SectionTitle = ({ children }: { children: string }) => (
	<Text bold color="white">
		{children}
	</Text>
);

const StatRow = ({
	label,
	value,
	color = "gray",
}: {
	label: string;
	value: string | number;
	color?: string;
}) => (
	<Box justifyContent="space-between" flexGrow={1}>
		<Text dimColor>{label}</Text>
		<Text color={color}>{value}</Text>
	</Box>
);

const Divider = () => (
	<Box marginTop={1} marginBottom={1}>
		<Text dimColor>{"─".repeat(32)}</Text>
	</Box>
);

export const RightSidebar = ({
	debugState,
	height,
	isStreaming,
	todoStats,
	toggles,
	toolCalls,
	totalUsage,
	turnUsage,
}: Props) => (
	<Box
		flexDirection="column"
		borderStyle="round"
		borderColor="gray"
		paddingX={1}
		width={34}
		minHeight={Math.max(10, height)}
	>
		<SectionTitle>Status</SectionTitle>
		<StatusIndicator state={debugState} isStreaming={isStreaming} />
		<StatRow label="tools" value={toolCalls} />
		<StatRow label="elapsed" value={`${turnUsage.total}s`} />

		<Divider />

		<SectionTitle>Toggles</SectionTitle>
		<ToggleIndicator label="reasoning" enabled={toggles.reason} />
		<ToggleIndicator label="tool calls" enabled={toggles.toolCall} />
		<ToggleIndicator label="usage" enabled={toggles.usage} />

		<Divider />

		<SectionTitle>Todo</SectionTitle>
		<StatRow label="pending" value={todoStats.pending} color="yellow" />
		<StatRow label="in progress" value={todoStats.inProgress} color="cyan" />
		<StatRow label="completed" value={todoStats.completed} color="green" />
		{todoStats.cancelled > 0 && (
			<StatRow label="cancelled" value={todoStats.cancelled} color="gray" />
		)}

		<Divider />

		<SectionTitle>Usage (Turn)</SectionTitle>
		<StatRow label="in" value={fmt(turnUsage.input)} />
		<StatRow label="out" value={fmt(turnUsage.output)} />
		<StatRow label="total" value={fmt(turnUsage.total)} color="cyan" />

		<SectionTitle>Usage (Total)</SectionTitle>
		<StatRow label="in" value={fmt(totalUsage.input)} />
		<StatRow label="out" value={fmt(totalUsage.output)} />
		<StatRow label="total" value={fmt(totalUsage.total)} color="cyan" />

		<Box flexGrow={1} />

		<Divider />

		<SectionTitle>Shortcuts</SectionTitle>
		<Text dimColor>ctrl+r/t/u toggle</Text>
		<Text dimColor>pgup/pgdn scroll</Text>
		<Text dimColor>/ command palette</Text>
		<Text dimColor>? help overlay</Text>
	</Box>
);
