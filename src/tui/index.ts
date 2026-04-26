import "../util/env";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createElement } from "react";
import { isWorkspaceRootValid, workspaceRoot } from "../config/workspace-root";
import { TuiApp } from "./app/TuiApp";

if (!isWorkspaceRootValid()) {
	console.error(`Workspace root does not exist: ${workspaceRoot}`);
	process.exit(1);
}

const renderer = await createCliRenderer({
	exitOnCtrlC: false, // 由 `useTuiKeyboard` 处理（流式时中止，否则退出）
	screenMode: "alternate-screen", // 保持终端原本内容，退出 TUI 后自动恢复
	useMouse: true, // 启用鼠标事件
	useKittyKeyboard: { disambiguate: true }, // 更佳组合键体验（需匹配控制字符，见 `key-matching`）
	autoFocus: true, // 需要聚焦/失焦感知时打开
	/** 销毁后仍有未关闭的句柄时保证进程能退出（否则可能卡在 Ctrl+C / Ctrl+D） */
	onDestroy: () => {
		process.exit(0);
	},
});

const root = createRoot(renderer);
root.render(createElement(TuiApp));
