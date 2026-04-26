import { RGBA } from "@opentui/core";

/**
 * Dracula-inspired tokens. Core six from the palette reference below; UI chrome
 * uses common Dracula fg / comment / selection for borders and body text.
 *
 * Primary    #BD93F9
 * Accent     #FF79C6
 * Success    #50FA7B
 * Warning    #F1FA8C
 * Error      #FF5555
 * Info       #8BE9FD
 */
export const tuiColors = {
	primary: RGBA.fromInts(189, 147, 249, 255),
	accent: RGBA.fromInts(255, 121, 198, 255),
	success: RGBA.fromInts(80, 250, 123, 255),
	warning: RGBA.fromInts(241, 250, 140, 255),
	error: RGBA.fromInts(255, 85, 85, 255),
	info: RGBA.fromInts(139, 233, 253, 255),
	/** Default body text — Dracula #F8F8F2 */
	foreground: RGBA.fromInts(248, 248, 242, 255),
	/** Secondary / de-emphasized — Dracula comment #6272A4 */
	muted: RGBA.fromInts(98, 114, 164, 255),
	/** Panels and rules — Dracula selection #44475A */
	border: RGBA.fromInts(68, 71, 90, 255),
} as const;
