/** @jsxImportSource @opentui/react */
import { tuiAppConfig } from "../config/app.config";
import { tuiColors } from "../theme/colors";

type Props = {
	cwd: string;
	modelId: string;
	compact: boolean;
};

const trimPath = (path: string, maxLen: number): string => {
	if (path.length <= maxLen) {
		return path;
	}
	if (maxLen < 4) {
		return "…";
	}
	return `…${path.slice(-(maxLen - 1))}`;
};

const headerBarProps = {
	border: true,
	borderColor: tuiColors.border,
	paddingLeft: 1,
	paddingRight: 1,
	flexDirection: "row" as const,
	alignItems: "center" as const,
	flexShrink: 0,
};

export const HeaderView = ({ cwd, modelId, compact }: Props) => {
	const titleLeft = (
		<box flexDirection="row" flexGrow={0}>
			<text fg={tuiColors.primary}>{tuiAppConfig.appName}</text>
			<text fg={tuiColors.muted}>{` v${tuiAppConfig.appVersion}`}</text>
			<text fg={tuiColors.muted}>{" · "}</text>
			<text fg={tuiColors.muted}>{modelId}</text>
		</box>
	);

	return (
		<box
			{...headerBarProps}
			justifyContent={compact ? "flex-start" : "space-between"}
		>
			{titleLeft}
			{compact ? null : <text fg={tuiColors.muted}>{trimPath(cwd, 56)}</text>}
		</box>
	);
};
