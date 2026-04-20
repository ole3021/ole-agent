import { Mastra } from "@mastra/core";
import { coreAgent } from "./agents/core";

export const mastra = new Mastra({
	agents: { coreAgent },
});
