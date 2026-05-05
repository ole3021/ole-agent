import { Agent } from "@mastra/core/agent";
import { Envs } from "../../util/env";

export const voiceSummaryAgent = new Agent({
	id: "voice-summary-agent",
	name: "Voice Summary Agent",
	instructions: `You summarize ONLY the latest transcript window for live voice sessions.

Return STRICT JSON only in this exact shape:
{
  "refineOpenText": "string or null",
  "items": [
    { "text": "single concise new key point" }
  ]
}

Rules:
- Output MUST be in Simplified Chinese.
- Be grounded in transcript text only. Do not invent facts.
- "items" must include ONLY new points from current window (1-3 items).
- Do not repeat old concluded points.
- Use "refineOpenText" only when current window clearly completes previous unfinished point; otherwise null.
- Keep wording concise and readable.
- Output JSON only, no markdown, no prose.`,
	model: Envs.MODEL_ID,
	maxRetries: 1,
	defaultOptions: {
		maxSteps: 1,
	},
});
