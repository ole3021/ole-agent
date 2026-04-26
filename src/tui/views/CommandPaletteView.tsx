/** @jsxImportSource @opentui/react */
import type { Command } from "../store/types";
import { tuiColors } from "../theme/colors";

type Props = {
	isOpen: boolean;
	commands: Command[];
};

export const CommandPaletteView = ({ isOpen, commands }: Props) => {
	const shown = commands.slice(0, 10);
	return (
		<box
			visible={isOpen}
			border
			borderColor={tuiColors.primary}
			paddingLeft={1}
			paddingRight={1}
			paddingTop={1}
			paddingBottom={1}
			flexDirection="column"
			zIndex={10}
		>
			<text fg={tuiColors.primary}>command palette</text>
			<text fg={tuiColors.muted}>Esc to close</text>
			{shown.length === 0 ? (
				<text fg={tuiColors.muted}>(no commands)</text>
			) : (
				shown.map((c) => (
					<text key={c.id} fg={tuiColors.foreground}>
						{c.label}
					</text>
				))
			)}
		</box>
	);
};
