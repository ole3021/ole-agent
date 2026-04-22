import { z } from "zod";

const envSchema = z.object({
	MINIMAX_API_KEY: z.string().min(1),
	MODEL_ID: z.string().default("minimax-cn/MiniMax-M2.7-highspeed"),
	WORKSPACE_ROOT: z.string().optional(),
	CLI_REASON: z.stringbool().default(false),
	CLI_TOOL_CALL: z.stringbool().default(false),
	CLI_USAGE: z.stringbool().default(false),
	CLI_DEBUG_STEP: z.stringbool().default(false),
	AGENT_MAX_STEPS: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error(
		"Invalid environment variables:",
		z.flattenError(parsed.error).fieldErrors,
	);
	process.exit(1);
}

export const Envs = parsed.data;
