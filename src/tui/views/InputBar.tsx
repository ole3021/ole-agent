/** @jsxImportSource @opentui/react */
import type { KeyEvent } from "@opentui/core";
import { tuiColors } from "../theme/colors";

type Props = {
	isStreaming: boolean;
	onSubmit: (value: string) => void;
	value: string;
	onChange: (value: string) => void;
	/** 与 store 的 `inputResetEpoch` 同步，用于受控值清空时强制同步终端输入组件 */
	inputResetKey: number;
	/**
	 * 持焦时先收到按键，需在此兜底：Ctrl+C（流式中断）、↑↓/PgUp/PgDn（转写滚动）。
	 * 全局 `useKeyboard` 在持焦时往往收不到这些键。
	 */
	onKeyDown?: (e: KeyEvent) => void;
};

export const InputBar = ({
	isStreaming,
	onSubmit,
	value,
	onChange,
	inputResetKey,
	onKeyDown,
}: Props) => {
	// `input` merges with DOM types; OpenTUI passes `string` to `onSubmit`.
	const onSubmitOpenTui = (isStreaming ? () => undefined : onSubmit) as never;
	return (
		<box
			border
			borderColor={tuiColors.border}
			flexDirection="row"
			alignItems="stretch"
			width="100%"
			minWidth={0}
			flexShrink={0}
		>
			<input
				key={String(inputResetKey)}
				focused
				placeholder={
					isStreaming
						? "输出中可编辑草稿，结束后 Enter 发送 (Ctrl+C 中止)"
						: "输入消息 (Enter 发送)"
				}
				value={value}
				onChange={onChange}
				onKeyDown={onKeyDown}
				onSubmit={onSubmitOpenTui}
				style={{ flexGrow: 1, minWidth: 0 }}
			/>
		</box>
	);
};
