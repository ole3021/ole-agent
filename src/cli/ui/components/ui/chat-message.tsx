import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useInput } from "../../hooks/use-input";
import { useTheme } from "./theme-provider";

export type ChatRole = "user" | "assistant" | "system" | "error";

export interface ChatMessageProps {
	sender: ChatRole;
	name?: string;
	timestamp?: Date;
	streaming?: boolean;
	collapsible?: boolean;
	defaultCollapsed?: boolean;
	children?: ReactNode;
	onCollapseToggle?: (collapsed: boolean) => void;
}

const formatTime = (date: Date): string =>
	date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const wrapPlainChildren = (node: ReactNode): ReactNode =>
	typeof node === "string" || typeof node === "number" ? (
		<Text>{node}</Text>
	) : (
		node
	);

export const ChatMessage = ({
	sender,
	name,
	timestamp,
	streaming = false,
	collapsible = false,
	defaultCollapsed = false,
	children,
	onCollapseToggle,
}: ChatMessageProps) => {
	const theme = useTheme();
	const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
	const [dotFrame, setDotFrame] = useState(0);

	useEffect(() => {
		if (!streaming) {
			return;
		}
		setIsCollapsed(false);
		const id = setInterval(() => setDotFrame((f) => (f + 1) % 4), 400);
		return () => clearInterval(id);
	}, [streaming]);

	useEffect(() => {
		if (onCollapseToggle) {
			onCollapseToggle(isCollapsed);
		}
	}, [isCollapsed, onCollapseToggle]);

	useInput((input, key) => {
		if (collapsible && (key.return || input === " ")) {
			setIsCollapsed((c) => !c);
		}
	});

	const roleColor: Record<ChatRole, string> = {
		assistant: theme.colors.success ?? "green",
		error: theme.colors.error ?? "red",
		system: theme.colors.mutedForeground,
		user: theme.colors.primary,
	};

	const roleLabel: Record<ChatRole, string> = {
		assistant: "assistant",
		error: "error",
		system: "system",
		user: "user",
	};

	const color = roleColor[sender];

	const dots = ["", "●", "●●", "●●●"][dotFrame] ?? "";

	const childrenText = typeof children === "string" ? children : "";
	const firstLine = childrenText.split("\n")[0] ?? "";
	const previewText =
		firstLine.slice(0, 80) + (firstLine.length > 80 ? "..." : "");

	const renderContent = () => {
		if (streaming) {
			return (
				<Box alignItems="flex-start">
					{children ? (
						wrapPlainChildren(children)
					) : (
						<Text color={color} dimColor>
							{dots}
						</Text>
					)}
				</Box>
			);
		}

		if (collapsible && isCollapsed) {
			return (
				<Box gap={1}>
					<Text dimColor>{previewText}</Text>
					<Text dimColor color={theme.colors.mutedForeground}>
						[expand]
					</Text>
				</Box>
			);
		}

		return <Box>{wrapPlainChildren(children)}</Box>;
	};

	const scopeIndicator =
		sender === "assistant" && name && name.startsWith("sub:") ? (
			<Text dimColor color={theme.colors.accent}>
				{" · "}
				{name.replace("sub:", "↳ ")}
			</Text>
		) : null;

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box gap={1} alignItems="center">
				<Text color={color} bold>
					{name ?? roleLabel[sender]}
				</Text>
				{scopeIndicator}
				{timestamp && (
					<Text dimColor color={theme.colors.mutedForeground}>
						{formatTime(timestamp)}
					</Text>
				)}
				{streaming && (
					<Text color={theme.colors.primary}>
						<SpinnerDots />
					</Text>
				)}
				{collapsible && !streaming && (
					<Text dimColor color={theme.colors.mutedForeground}>
						{isCollapsed ? "[+]" : "[-]"}
					</Text>
				)}
			</Box>
			{renderContent()}
		</Box>
	);
};

const SpinnerDots = () => {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setFrame((f) => (f + 1) % 4), 500);
		return () => clearInterval(id);
	}, []);
	return <Text>{["○", "◐", "●", "◑"][frame]}</Text>;
};
