export const color = {
	reset: "\u001B[0m",
	cyan: "\u001B[36m",
	magenta: "\u001B[95m",
	blue: "\u001B[34m",
	green: "\u001B[32m",
	greenBold: "\u001B[1;32m",
	promptPrefix: "\u001B[34m >> \u001B[0m",
} as const;

export const tag = {
	reason: " :R: ",
	tool: " :T: ",
	error: " :E: ",
	stat: " :: ",
	step: " [LLM] ",
} as const;
