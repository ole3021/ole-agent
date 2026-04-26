/** @jsxImportSource @opentui/react */
import type { ReactNode } from "react";

type Props = {
	children: ReactNode;
};

/**
 * Top-level flex column; child views are composed by `TuiApp`.
 */
export const RootLayout = ({ children }: Props) => {
	return (
		<box flexDirection="column" flexGrow={1} gap={0}>
			{children}
		</box>
	);
};
