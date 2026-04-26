/** @jsxImportSource @opentui/react */

import { formatUsageStateLine, wrapText } from "../lib/text-utils";
import type {
	AgentTodoItem,
	AgentTodoStatus,
	DebugState,
	StreamToggles,
	TodoStats,
	UsageState,
} from "../store/types";
import { tuiColors } from "../theme/colors";

type Props = {
	debugState: DebugState;
	isStreaming: boolean;
	toolCalls: number;
	turnUsage: UsageState;
	totalUsage: UsageState;
	todoStats: TodoStats;
	agentTodos: AgentTodoItem[];
	toggles: StreamToggles;
	height: number;
	sidebarCols: number;
};

const todoBracket = (s: AgentTodoStatus): string => {
	if (s === "completed") return "[ x ]";
	if (s === "in_progress") return "[ > ]";
	if (s === "cancelled") return "[ - ]";
	return "[   ]";
};

const statusFg = (s: AgentTodoStatus) => {
	if (s === "completed") return tuiColors.success;
	if (s === "in_progress") return tuiColors.warning;
	if (s === "cancelled") return tuiColors.muted;
	return tuiColors.info;
};

const TODO_BRACKET_COLS = 5;
const TODO_AFTER_BRACKET_GAP = 1;
const TODO_CONTINUATION_INDENT = 5;

type TodoLineRow = { id: string; line: string; isFirst: boolean };

const buildTodoBodyLines = (
	label: string,
	innerW: number,
	lineIdPrefix: string,
): TodoLineRow[] => {
	const firstW = Math.max(
		1,
		innerW - TODO_BRACKET_COLS - TODO_AFTER_BRACKET_GAP,
	);
	const contW = Math.max(1, innerW - TODO_CONTINUATION_INDENT);
	const out: TodoLineRow[] = [];
	let lineSeq = 0;
	for (const segment of label.split("\n")) {
		let rest = segment;
		while (rest.length > 0) {
			const w = out.length === 0 ? firstW : contW;
			const lines = wrapText(rest, w);
			const first = lines[0] ?? "";
			const isFirst = out.length === 0;
			const id = `${lineIdPrefix}-L${lineSeq++}`;
			out.push({ id, line: first, isFirst });
			rest = lines.length > 1 ? lines.slice(1).join("") : "";
		}
	}
	return out.length > 0
		? out
		: [{ id: `${lineIdPrefix}-L0`, line: "", isFirst: true }];
};

export const SidebarView = ({
	debugState,
	isStreaming,
	toolCalls,
	turnUsage,
	totalUsage,
	todoStats: _todoStats,
	agentTodos,
	toggles,
	height: _height,
	sidebarCols,
}: Props) => {
	/** 边框约占 2 列，作正文折行宽 */
	const innerW = Math.max(6, sidebarCols - 2);

	const maxTodoRows = Math.max(2, Math.min(18, _height - 7));
	const shownTodos = agentTodos.slice(0, maxTodoRows);

	return (
		<box
			border
			borderColor={tuiColors.border}
			flexDirection="column"
			flexGrow={1}
			gap={1}
		>
			<box flexDirection="column" gap={0}>
				<text fg={tuiColors.primary}>状态</text>
				<text fg={tuiColors.foreground}>
					{`输出中: ${isStreaming ? "是" : "否"}  阶段: ${debugState}`}
				</text>
				<text fg={tuiColors.muted}>{`>> 工具调用: ${toolCalls}`}</text>
			</box>
			{agentTodos.length > 0 && (
				<box flexDirection="column" gap={0}>
					<text fg={tuiColors.accent}>{`任务清单`}</text>
					{shownTodos.map((t) => {
						const bodyLines = buildTodoBodyLines(t.label, innerW, t.id);
						return (
							<box key={t.id} flexDirection="column" flexShrink={0} gap={0}>
								{bodyLines.map((row) => {
									if (row.isFirst) {
										return (
											<box
												key={row.id}
												flexDirection="row"
												flexShrink={0}
												gap={0}
											>
												<text fg={statusFg(t.status)}>
													{todoBracket(t.status)}
												</text>
												<text fg={tuiColors.foreground}>{` ${row.line}`}</text>
											</box>
										);
									}
									return (
										<text key={row.id} fg={tuiColors.foreground}>
											{`${" ".repeat(TODO_CONTINUATION_INDENT)}${row.line}`}
										</text>
									);
								})}
							</box>
						);
					})}
				</box>
			)}
			<box flexDirection="column" gap={0} flexGrow={1} />
			<box flexDirection="column" gap={0} marginBottom={1}>
				<text fg={tuiColors.muted}>
					{formatUsageStateLine("本轮", turnUsage)}
				</text>
				<text fg={tuiColors.muted}>
					{formatUsageStateLine("累计", totalUsage)}
				</text>
			</box>

			<text fg={tuiColors.muted}>
				{`显隐  R/T/U: ${toggles.reason}/${toggles.toolCall}/${toggles.usage}`}
			</text>
		</box>
	);
};
