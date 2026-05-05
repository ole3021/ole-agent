import { stdin as input, stdout as output } from "node:process";
import { clearLine, cursorTo, moveCursor } from "node:readline";
import { createInterface } from "node:readline/promises";
import type { AgentExecutionOptionsBase } from "@mastra/core/agent";
import type { AgentRunEvent } from "../app/session/agent-run-event";
import {
	type VoiceSummaryDiffEntry,
} from "../app/live-audio/voice-summary-runtime";
import { runVoiceSummarySession } from "../app/live-audio/voice-summary-session";
import {
	appendExecutionTimeline,
	createEmptyExecutionRuntimeState,
	formatTodoCallSummary,
	maybeExtractTodoStateFromCallArgs,
	type TodoRuntimeState,
	updateExecutionRuntime,
} from "../app/session/runtime-state";
import { SessionOrchestrator } from "../app/session/session-orchestrator";
import { coreAgent } from "../mastra/agents/core";
import type {
	TranscriptMessage,
	UserTranscriptMessage,
} from "../types/message";
import { Envs } from "../util/env";
import { takeDisplayColumns, terminalDisplayWidth } from "../tui/lib/terminal-string-width";
import { formatTokens, renderStream } from "./stream-render";
import { color, tag } from "./style";

let activeVoiceSummaryAbort: AbortController | null = null;

function wrapByColumns(text: string, cols: number): string[] {
	if (cols <= 0) {
		return [""];
	}
	if (text.length === 0) {
		return [""];
	}
	let rem = text;
	const lines: string[] = [];
	while (rem.length > 0) {
		const { line, rest } = takeDisplayColumns(rem, cols);
		if (line.length === 0) {
			break;
		}
		lines.push(line);
		rem = rest;
	}
	return lines.length > 0 ? lines : [""];
}

function summarizeItemPhrase(raw: string): string {
	const noTag = raw.replace(/^\s*\[[^\]]+\]\s*/u, "").trim();
	const noSpeaker = noTag.replace(/^\s*spk-\d+[^：]*：\s*/u, "").trim();
	const noParens = noSpeaker.replace(/（[^）]*）/gu, "").trim();
	const noLeadVerb = noParens
		.replace(/^(提到|指出|介绍|补充|强调|认为|提出|表示|说明|判断|分享)[:：]?/u, "")
		.trim();
	const firstSentence = noLeadVerb.split(/[。!?！？]/u)[0]?.trim() ?? "";
	const parts = firstSentence
		.split(/[，；;]/u)
		.map((x) => x.trim())
		.filter((x) => x.length > 0);
	if (parts.length === 0) {
		return noLeadVerb;
	}
	if (parts[0].length >= 10 || parts.length === 1) {
		return parts[0];
	}
	return `${parts[0]}，${parts[1]}`;
}

function buildBriefSummaryText(diff: VoiceSummaryDiffEntry[]): string {
	const scope = diff
		.filter((entry) => entry.kind !== "removed")
		.map((entry) => summarizeItemPhrase(entry.item.text))
		.filter((x) => x.length > 0);
	if (scope.length === 0) {
		return "......";
	}
	if (scope.length === 1) {
		return `[总结] ${scope[0]}。`;
	}
	return `${scope[1]}。`;
}

async function checkVoiceSummaryPreflight(): Promise<string[]> {
	const issues: string[] = [];
	if (Envs.STT_PROVIDER === "deepgram") {
		if (!Envs.DEEPGRAM_API_KEY || Envs.DEEPGRAM_API_KEY.trim().length === 0) {
			issues.push("missing DEEPGRAM_API_KEY");
		}
	} else {
		const hasApiKey =
			!!Envs.VOLCENGINE_API_KEY && Envs.VOLCENGINE_API_KEY.trim().length > 0;
		const hasAppAccess =
			!!Envs.VOLCENGINE_APP_ID &&
			Envs.VOLCENGINE_APP_ID.trim().length > 0 &&
			!!Envs.VOLCENGINE_ACCESS_TOKEN &&
			Envs.VOLCENGINE_ACCESS_TOKEN.trim().length > 0;
		if (!hasApiKey && !hasAppAccess) {
			issues.push(
				"missing volcengine credentials (set VOLCENGINE_API_KEY, or VOLCENGINE_APP_ID + VOLCENGINE_ACCESS_TOKEN)",
			);
		}
	}
	try {
		const proc = Bun.spawn(["ffmpeg", "-version"], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		const code = await proc.exited;
		if (code !== 0) {
			issues.push("ffmpeg is not available");
		}
	} catch (error) {
		const maybeErr = error as { code?: string } | undefined;
		if (maybeErr?.code === "ENOENT") {
			issues.push("ffmpeg is not installed or not in PATH");
		} else {
			issues.push("failed to check ffmpeg availability");
		}
	}
	return issues;
}

async function runVoiceSummaryCommand(): Promise<void> {
	const preflightIssues = await checkVoiceSummaryPreflight();
	if (preflightIssues.length > 0) {
		console.error(`${color.cyan}${tag.error}/voice-summary preflight failed:${color.reset}`);
		for (const issue of preflightIssues) {
			console.error(`${color.cyan}${tag.error} - ${issue}${color.reset}`);
		}
		if (preflightIssues.some((x) => x.includes("ffmpeg"))) {
			console.error(
				`${color.cyan}${tag.error} hint: install ffmpeg (macOS): brew install ffmpeg${color.reset}`,
			);
		}
		if (preflightIssues.some((x) => x.includes("DEEPGRAM_API_KEY"))) {
			console.error(
				`${color.cyan}${tag.error} hint: set DEEPGRAM_API_KEY in your environment/.env${color.reset}`,
			);
		}
		if (preflightIssues.some((x) => x.includes("VOLCENGINE_"))) {
			console.error(
				`${color.cyan}${tag.error} hint: set VOLCENGINE_API_KEY (new console), or VOLCENGINE_APP_ID + VOLCENGINE_ACCESS_TOKEN (legacy console)${color.reset}`,
			);
		}
		console.log();
		return;
	}

	const ctrl = new AbortController();
	activeVoiceSummaryAbort = ctrl;
	let abortRequested = false;
	const onSigint = () => {
		if (abortRequested) {
			return;
		}
		abortRequested = true;
		ctrl.abort();
	};
	process.on("SIGINT", onSigint);
	const summaryMinIntervalMs = 3000;
	let lastSummaryRenderAt = 0;
	let summaryTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingSummary: {
		version: number;
		diff: VoiceSummaryDiffEntry[];
	} | null = null;
	try {
		try {
			let partialActive = false;
			let partialPrefix = "";
			let partialTextSeen = "";
			let partialRenderedLines: string[] = [];

			const maxPartialCols = () =>
				Math.max(20, (process.stdout.columns ?? 120) - 1);
			const PARTIAL_SOFT_WRAP_RATIO = 0.86;

			const findNaturalBreakIndex = (
				chunk: string,
				minCols: number,
			): number => {
				const primary = new Set(["。", "！", "？", "!", "?", ";", "；"]);
				const secondary = new Set(["，", ",", "、", "：", ":"]);
				for (let i = chunk.length - 1; i >= 0; i -= 1) {
					const ch = chunk[i];
					if (!primary.has(ch)) {
						continue;
					}
					const head = chunk.slice(0, i + 1);
					if (terminalDisplayWidth(head) >= minCols) {
						return i + 1;
					}
				}
				for (let i = chunk.length - 1; i >= 0; i -= 1) {
					const ch = chunk[i];
					if (!secondary.has(ch)) {
						continue;
					}
					const head = chunk.slice(0, i + 1);
					if (terminalDisplayWidth(head) >= minCols) {
						return i + 1;
					}
				}
				return -1;
			};

			const buildWrappedPartialLines = (text: string, prefix: string): string[] => {
				const maxCols = maxPartialCols();
				const prefixCols = terminalDisplayWidth(prefix);
				const hardRoom = Math.max(1, maxCols - prefixCols);
				const softRoom = Math.max(
					1,
					Math.min(hardRoom, Math.floor(hardRoom * PARTIAL_SOFT_WRAP_RATIO)),
				);
				const minNaturalCols = Math.max(8, Math.floor(hardRoom * 0.45));
				let rem = text;
				const lines: string[] = [];
				while (rem.length > 0) {
					if (terminalDisplayWidth(rem) <= hardRoom) {
						lines.push(`${prefix}${rem}`);
						break;
					}
					let { line, rest } = takeDisplayColumns(rem, softRoom);
					if (rest.length > 0) {
						const breakIdx = findNaturalBreakIndex(line, minNaturalCols);
						if (breakIdx > 0) {
							rest = `${line.slice(breakIdx)}${rest}`;
							line = line.slice(0, breakIdx);
						}
					}
					if (line.length === 0) {
						const fallback = takeDisplayColumns(rem, hardRoom);
						line = fallback.line;
						rest = fallback.rest;
					}
					lines.push(`${prefix}${line}`);
					rem = rest.replace(/^\s+/, "");
				}
				if (lines.length === 0) {
					lines.push(prefix);
				}
				return lines;
			};

			const writeBlueLine = (line: string) => {
				output.write(`${color.blue}${line}${color.reset}`);
			};

			const renderPartialLines = (lines: string[]) => {
				for (let i = 0; i < lines.length; i += 1) {
					writeBlueLine(lines[i]);
					if (i < lines.length - 1) {
						output.write("\n");
					}
				}
			};

			const rewritePartialLines = (nextLines: string[]) => {
				const prevLines = partialRenderedLines;
				if (
					prevLines.length === nextLines.length &&
					prevLines.every((line, idx) => line === nextLines[idx])
				) {
					return;
				}
				const up = Math.max(0, prevLines.length - 1);
				if (up > 0) {
					moveCursor(output, 0, -up);
				}
				cursorTo(output, 0);
				const steps = Math.max(prevLines.length, nextLines.length);
				for (let idx = 0; idx < steps; idx += 1) {
					clearLine(output, 0);
					if (idx < nextLines.length) {
						writeBlueLine(nextLines[idx]);
					}
					if (idx < steps - 1) {
						output.write("\n");
					}
				}
				const extraCleared = Math.max(0, steps - nextLines.length);
				if (extraCleared > 0) {
					moveCursor(output, 0, -extraCleared);
				}
				cursorTo(output, terminalDisplayWidth(nextLines[nextLines.length - 1] ?? ""));
			};

			const endPartialBlock = () => {
				if (!partialActive) {
					return;
				}
				output.write("\n");
				partialActive = false;
				partialPrefix = "";
				partialTextSeen = "";
				partialRenderedLines = [];
			};

			const beginNewPartialOutput = (prefix: string, text: string) => {
				if (partialActive) {
					output.write("\n");
				}
				const lines = buildWrappedPartialLines(text, prefix);
				renderPartialLines(lines);
				partialActive = true;
				partialPrefix = prefix;
				partialTextSeen = text;
				partialRenderedLines = lines;
			};

			const renderSummarySnapshot = (
				version: number,
				diff: VoiceSummaryDiffEntry[],
			) => {
				endPartialBlock();
				const cols = Math.max(40, process.stdout.columns ?? 120);
				const contentCols = Math.max(20, cols - 22);
				const brief = buildBriefSummaryText(diff);
				const briefLines = wrapByColumns(brief, contentCols);
				for (let i = 0; i < briefLines.length; i += 1) {
					const label = i === 0 ? ` [总结] [v${version}] ` : "                 ";
					console.log(`${color.green}${label}${briefLines[i]}${color.reset}`);
				}
				const detailLines =
					diff.length > 0
						? diff.map((entry) => {
							if (entry.kind === "removed") {
								return `[-] ${entry.item.text}`;
							}
							if (entry.kind === "updated") {
								return `[~] ${entry.item.text}`;
							}
							return `[+] ${entry.item.text}`;
						})
						: ["[=] 本轮无新增概要，待后续片段补充。"];
				for (const detail of detailLines) {
					const wrapped = wrapByColumns(detail, contentCols);
					for (let i = 0; i < wrapped.length; i += 1) {
						const label = i === 0 ? ` [摘要] [v${version}] ` : "               ";
						console.log(`${color.green}${label}${wrapped[i]}${color.reset}`);
					}
				}
				lastSummaryRenderAt = Date.now();
			};

			const scheduleSummaryRender = (
				version: number,
				diff: VoiceSummaryDiffEntry[],
			) => {
				pendingSummary = { version, diff };
				const now = Date.now();
				const remain = summaryMinIntervalMs - (now - lastSummaryRenderAt);
				if (remain <= 0 && !summaryTimer) {
					const next = pendingSummary;
					pendingSummary = null;
					if (next) {
						renderSummarySnapshot(next.version, next.diff);
					}
					return;
				}
				if (summaryTimer) {
					return;
				}
				summaryTimer = setTimeout(() => {
					summaryTimer = null;
					const next = pendingSummary;
					pendingSummary = null;
					if (next) {
						renderSummarySnapshot(next.version, next.diff);
					}
				}, Math.max(1, remain));
			};

			const flushPendingSummary = () => {
				if (summaryTimer) {
					clearTimeout(summaryTimer);
					summaryTimer = null;
				}
				const next = pendingSummary;
				pendingSummary = null;
				if (next) {
					renderSummarySnapshot(next.version, next.diff);
				}
			};

			const result = await runVoiceSummarySession(
				{
					onInfo: (line) => {
						endPartialBlock();
						console.log(`${color.cyan}${tag.stat}${line}${color.reset}`);
					},
					onPartial: (text, speaker) => {
						if (!Envs.VOICE_SHOW_PARTIAL) {
							return;
						}
						const who = speaker ? `${speaker} ` : "";
						const prefix = ` [STT] [partial] ${who}`;
						if (!partialActive || partialPrefix !== prefix) {
							beginNewPartialOutput(prefix, text);
							return;
						}
						if (text === partialTextSeen) {
							return;
						}
						const nextLines = buildWrappedPartialLines(text, prefix);
						rewritePartialLines(nextLines);
						partialTextSeen = text;
						partialRenderedLines = nextLines;
					},
					onFinal: (text, speaker) => {
						const who = speaker ? `${speaker} ` : "";
						if (Envs.VOICE_SHOW_PARTIAL) {
							endPartialBlock();
							return;
						}
						console.log(`${color.green} [STT] [final] ${who}${text}${color.reset}`);
					},
					onSummaryDiff: (_version, _diff) => {
						if (_diff.length === 0) {
							return;
						}
						scheduleSummaryRender(_version, _diff);
					},
					onError: (error) => {
						endPartialBlock();
						console.error(
							`${color.cyan}${tag.error}${error.message}${color.reset}`,
						);
					},
				},
				ctrl.signal,
			);
			flushPendingSummary();
			endPartialBlock();
			console.log();
			console.log(`${color.greenBold}Final summary${color.reset}`);
			console.log(result.finalSummary);
			console.log();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "voice-summary failed";
			console.error(`${color.cyan}${tag.error}${message}${color.reset}`);
			console.log();
		} finally {
			if (summaryTimer) {
				clearTimeout(summaryTimer);
			}
			pendingSummary = null;
		}
	} finally {
		activeVoiceSummaryAbort = null;
		process.off("SIGINT", onSigint);
	}
}

type TurnAccumulator = {
	usage: { input: number; output: number; total: number };
	toolCalls: number;
	runtime: ReturnType<typeof createEmptyExecutionRuntimeState>;
	timeline: Array<{ id: string; text: string }>;
	onEvent: (event: AgentRunEvent) => void;
};

function createTurnAccumulator(params: {
	totalUsage: { input: number; output: number; total: number };
	onTotalUsage: (usage: {
		input: number;
		output: number;
		total: number;
	}) => void;
	onTodoRuntime: (state: TodoRuntimeState) => void;
}): TurnAccumulator {
	const turn: TurnAccumulator = {
		usage: { input: 0, output: 0, total: 0 },
		toolCalls: 0,
		runtime: createEmptyExecutionRuntimeState(),
		timeline: [],
		onEvent: (event) => {
			turn.runtime = updateExecutionRuntime(turn.runtime, event);
			turn.timeline = appendExecutionTimeline(turn.timeline, event);
			if (event.kind === "tool-call") {
				turn.toolCalls += 1;
				if (event.name === "todo") {
					const parsed = maybeExtractTodoStateFromCallArgs(event.args);
					if (parsed) {
						params.onTodoRuntime(parsed);
					}
				}
			}
			if (event.kind === "usage") {
				turn.usage = {
					input: event.inTokens ?? 0,
					output: event.outTokens ?? 0,
					total: event.totalTokens ?? 0,
				};
				params.onTotalUsage({
					input: params.totalUsage.input + turn.usage.input,
					output: params.totalUsage.output + turn.usage.output,
					total: params.totalUsage.total + turn.usage.total,
				});
			}
		},
	};
	return turn;
}

export async function runAgentLoop(): Promise<void> {
	const rl = createInterface({ input, output });
	rl.on("SIGINT", () => {
		if (activeVoiceSummaryAbort && !activeVoiceSummaryAbort.signal.aborted) {
			activeVoiceSummaryAbort.abort();
			return;
		}
		// Outside voice mode, allow Ctrl+C to exit the CLI loop.
		rl.close();
	});
	const sessionOrchestrator = new SessionOrchestrator();
	sessionOrchestrator.resetSession();
	let totalUsage = { input: 0, output: 0, total: 0 };
	let todoRuntime: TodoRuntimeState | null = null;
	/** 完整本地逐字 transcript（每轮追加）；经 `buildContextMessagesWithUserMessage` 得到可能含压缩/前缀折叠的 `contextMessages` 再传给模型 */
	const transcriptMessages: TranscriptMessage[] = [];

	console.log(
		`${color.cyan}Hint: Ctrl+C to cancel current turn, "q" or Ctrl+D to exit.${color.reset}`,
	);

	try {
		while (true) {
			let query: string;
			try {
				query = await rl.question(color.promptPrefix);
			} catch (error) {
				if (error instanceof Error && "code" in error) {
					const code = (error as { code?: string }).code;
					if (code === "ERR_USE_AFTER_CLOSE") {
						break;
					}
				}
				throw error;
			}
			const normalized = query.trim().toLowerCase();
			if (normalized === "/voice-summary") {
				await runVoiceSummaryCommand();
				continue;
			}
			if (!normalized || normalized === "q" || normalized === "exit") {
				break;
			}

			const ctrl = new AbortController();
			const onSigint = () => ctrl.abort();
			process.once("SIGINT", onSigint);
			let transcriptModelPrefixSnapshot: TranscriptMessage[] | null = null;

			try {
				const turn = createTurnAccumulator({
					totalUsage,
					onTotalUsage: (nextTotal) => {
						totalUsage = nextTotal;
					},
					onTodoRuntime: (state) => {
						todoRuntime = state;
					},
				});
				const latestUserMessage: UserTranscriptMessage = {
					role: "user",
					content: query,
				};
				const prepared = await sessionOrchestrator.prepareTurn({
					transcriptMessagesBeforeTurn: transcriptMessages,
					latestUserMessage,
				});
				const {
					contextMessages,
					transcriptModelPrefixSnapshot: snapshot,
					requestContext,
				} = prepared;
				transcriptModelPrefixSnapshot = snapshot;
				transcriptMessages.push(latestUserMessage);
				const result = await coreAgent.stream(contextMessages, {
					abortSignal: ctrl.signal,
					requestContext,
					onStepFinish: (step) => {
						const s = step as {
							request?: { body?: { model?: string; temperature?: number } };
							finishReason?: string;
							toolCalls: ReadonlyArray<{ payload: { toolName: string } }>;
							usage: {
								inputTokens?: number;
								outputTokens?: number;
								totalTokens?: number;
							};
						};
						const body = s.request?.body ?? {};
						if (!Envs.CLI_DEBUG_STEP) {
							return;
						}
						// TODO: Optimize log output to CLI and TUI
						console.log();
						console.log(
							`${color.magenta}${tag.step}${body.model ?? "unknown"}${body.temperature !== undefined ? ` >> temperature: ${body.temperature}` : ""} ${color.reset}`,
						);
						console.log(
							`${color.magenta}${tag.step}${s.finishReason}${s.toolCalls.length > 0 ? ` >> toolCalls: ${s.toolCalls.map((t) => t.payload.toolName).join(",")}` : ""} ${color.reset}`,
						);
						console.log(
							`${color.magenta}${tag.step}in=${formatTokens(s.usage.inputTokens)} out=${formatTokens(s.usage.outputTokens)} tot=${formatTokens(s.usage.totalTokens)} ${color.reset}`,
						);
					},
				} as AgentExecutionOptionsBase<unknown>);
				const assistantText = await renderStream(result, {
					onEvent: turn.onEvent,
				});
				sessionOrchestrator.commitAssistantText(assistantText);
				if (assistantText.length > 0) {
					transcriptMessages.push({
						role: "assistant",
						content: assistantText,
					});
				}
				if (todoRuntime) {
					console.log(
						`${color.cyan}${tag.stat}${formatTodoCallSummary(todoRuntime)}${color.reset}`,
					);
				}
				console.log(`${color.cyan}${tag.stat}turn summary${color.reset}`);
				console.log(
					`  tools=${turn.toolCalls} thinking=${turn.runtime.thinkingActive} subagents(run/ok/fail)=${turn.runtime.subagentsRunning}/${turn.runtime.subagentsCompleted}/${turn.runtime.subagentsFailed}`,
				);
				if (turn.runtime.lastToolName) {
					console.log(`  lastTool=${turn.runtime.lastToolName}`);
				}
				console.log(
					`  usage turn(in/out/tot)=${formatTokens(turn.usage.input)}/${formatTokens(turn.usage.output)}/${formatTokens(turn.usage.total)} total=${formatTokens(totalUsage.total)}`,
				);
				if (turn.timeline.length > 0) {
					console.log("  recent events:");
					for (const entry of turn.timeline.slice(-5)) {
						console.log(`    - ${entry.text}`);
					}
				}
				console.log();
			} catch (error) {
				const tail = transcriptMessages.at(-1);
				if (tail?.role === "user") {
					transcriptMessages.pop();
				}
				sessionOrchestrator.restoreSnapshot(transcriptModelPrefixSnapshot);
				if (
					ctrl.signal.aborted ||
					(error instanceof Error && error.name === "AbortError")
				) {
					console.log(`\n${color.cyan}[aborted]${color.reset}`);
				} else {
					const message =
						error instanceof Error ? error.message : "Unknown generation error";
					console.error(`Generate failed: ${message}`);
					console.error("Please retry your prompt.");
				}
				console.log();
			} finally {
				process.off("SIGINT", onSigint);
			}
		}
	} finally {
		rl.close();
	}
}
