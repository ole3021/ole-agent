import type { Theme } from "./components/ui/theme-provider";
import { defaultTheme } from "./lib/terminal-themes/default";

export const cliTheme: Theme = {
	...defaultTheme,
	name: "ole-agent",
	colors: {
		...defaultTheme.colors,
		primary: "#34aadc",
		accent: "#9f7aea",
		success: "#38a169",
		warning: "#d69e2e",
		error: "#e53e3e",
		border: "#4a5568",
		mutedForeground: "#a0aec0",
	},
};
