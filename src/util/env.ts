import { z } from "zod";

const envSchema = z.object({
	MINIMAX_API_KEY: z.string().min(1),
	MODEL_ID: z.string().default("minimax-cn/MiniMax-M2.7-highspeed"),
	WORKSPACE_ROOT: z.string().optional(),
	CLI_REASON: z.stringbool().default(true),
	CLI_TOOL_CALL: z.stringbool().default(false),
	CLI_USAGE: z.stringbool().default(false),
	CLI_DEBUG_STEP: z.stringbool().default(false),
	AGENT_MAX_STEPS: z.coerce.number().int().positive().default(30),
	CONTEXT_COMPACT_ENABLED: z.stringbool().default(true),
	CONTEXT_LIMIT_CHARS: z.coerce.number().int().positive().default(50_000),
	CONTEXT_SUMMARY_MAX_INPUT_CHARS: z.coerce
		.number()
		.int()
		.positive()
		.default(80_000),
	COMPACT_MODEL_ID: z.string().optional(),
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
