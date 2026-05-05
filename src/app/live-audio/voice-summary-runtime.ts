import { z } from "zod";
import { voiceSummaryAgent } from "../../mastra/agents/voice-summary";

export type VoiceTranscriptSegment = {
	id: string;
	text: string;
	speaker?: string;
	startMs?: number;
	endMs?: number;
};

export type VoiceSummaryItem = {
	id: string;
	text: string;
};

export type VoiceSummaryState = {
	items: VoiceSummaryItem[];
	segments: VoiceTranscriptSegment[];
	lastCommittedSegmentIndex: number;
	version: number;
	nextItemSeq: number;
	openCarryItemId: string | null;
	openCarryBudget: number;
};

export type VoiceSummaryDiffEntry = {
	kind: "added" | "updated" | "removed";
	item: VoiceSummaryItem;
};

const roundSummaryItemSchema = z.object({
	text: z.string().min(1),
});

const summaryResponseSchema = z.object({
	refineOpenText: z.string().nullable().optional(),
	items: z.array(roundSummaryItemSchema).max(3),
});

const MAX_SEGMENTS = 200;
const MAX_SUMMARY_ITEMS = 8;

export function createInitialVoiceSummaryState(): VoiceSummaryState {
	return {
		items: [],
		segments: [],
		lastCommittedSegmentIndex: 0,
		version: 0,
		nextItemSeq: 1,
		openCarryItemId: null,
		openCarryBudget: 0,
	};
}

export function appendTranscriptSegment(
	state: VoiceSummaryState,
	segment: VoiceTranscriptSegment,
): VoiceSummaryState {
	const nextSegments = [...state.segments, segment];
	const pruned =
		nextSegments.length > MAX_SEGMENTS
			? nextSegments.slice(nextSegments.length - MAX_SEGMENTS)
			: nextSegments;
	const dropped = nextSegments.length - pruned.length;
	return {
		...state,
		segments: pruned,
		lastCommittedSegmentIndex: Math.max(0, state.lastCommittedSegmentIndex - dropped),
	};
}

function buildPrompt(params: {
	openCarryItem: VoiceSummaryItem | null;
	newSegments: VoiceTranscriptSegment[];
}): string {
	const { openCarryItem, newSegments } = params;
	return [
		"Summarize ONLY this round of realtime transcript updates.",
		"Use Simplified Chinese for all item text.",
		"Even when transcript is English, output Chinese summaries.",
		"Only summarize what is explicitly present in transcript segments.",
		"Do not repeat old concluded points.",
		"Return strict JSON only in this shape:",
		'{"refineOpenText":"string|null","items":[{"text":"..."}]}.',
		"refineOpenText: update previous unfinished point only when this round clearly continues it; otherwise null.",
		"items: 1-3 NEW points from this round only. Do not include old points.",
		"Do not output markdown.",
		"",
		"Previous unfinished point (can refine once):",
		JSON.stringify(openCarryItem, null, 2),
		"",
		"New transcript segments:",
		JSON.stringify(newSegments, null, 2),
	].join("\n");
}

function parseAgentJson(text: string): z.infer<typeof summaryResponseSchema> {
	const trimmed = text.trim();
	let candidate = trimmed;
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) {
		candidate = trimmed.slice(start, end + 1);
	}
	const parsed = JSON.parse(candidate) as unknown;
	return summaryResponseSchema.parse(parsed);
}

function normalizeSummaryItems(items: Array<{ text: string }>): string[] {
	const deduped: VoiceSummaryItem[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const text = item.text.trim();
		if (!text || seen.has(text)) {
			continue;
		}
		seen.add(text);
		deduped.push({ id: "", text });
		if (deduped.length >= MAX_SUMMARY_ITEMS) {
			break;
		}
	}
	return deduped.map((x) => x.text);
}

function isLikelyIncomplete(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}
	if (!/[。！？!?]$/u.test(trimmed)) {
		return true;
	}
	return false;
}

export async function summarizeVoiceIncremental(
	state: VoiceSummaryState,
): Promise<{ state: VoiceSummaryState; diff: VoiceSummaryDiffEntry[] }> {
	if (state.lastCommittedSegmentIndex >= state.segments.length) {
		return { state, diff: [] };
	}

	const newSegments = state.segments.slice(state.lastCommittedSegmentIndex);
	const openCarryItem =
		state.openCarryItemId && state.openCarryBudget > 0
			? state.items.find((item) => item.id === state.openCarryItemId) ?? null
			: null;
	const prompt = buildPrompt({
		openCarryItem,
		newSegments,
	});
	const result = await voiceSummaryAgent.generate(
		[{ role: "user", content: prompt }],
		{ maxSteps: 1 },
	);
	const text = result.text?.trim() ?? "";
	if (!text) {
		return { state, diff: [] };
	}

	const parsed = parseAgentJson(text);
	const normalizedItems = normalizeSummaryItems(parsed.items);
	let nextItems = state.items;
	let nextSeq = state.nextItemSeq;
	let nextOpenCarryItemId: string | null = null;
	let nextOpenCarryBudget = 0;
	const diff: VoiceSummaryDiffEntry[] = [];

	if (openCarryItem && parsed.refineOpenText && parsed.refineOpenText.trim().length > 0) {
		const refined = parsed.refineOpenText.trim();
		if (refined !== openCarryItem.text) {
			nextItems = nextItems.map((item) =>
				item.id === openCarryItem.id ? { ...item, text: refined } : item,
			);
			diff.push({
				kind: "updated",
				item: { id: openCarryItem.id, text: refined },
			});
		}
	}

	for (const textItem of normalizedItems) {
		const item: VoiceSummaryItem = {
			id: `sum-${String(nextSeq++)}`,
			text: textItem,
		};
		nextItems = [...nextItems, item];
		diff.push({ kind: "added", item });
	}

	if (normalizedItems.length > 0) {
		const newest = normalizedItems[normalizedItems.length - 1];
		if (isLikelyIncomplete(newest)) {
			const lastAdded = nextItems[nextItems.length - 1];
			nextOpenCarryItemId = lastAdded?.id ?? null;
			nextOpenCarryBudget = lastAdded ? 1 : 0;
		}
	}

	const nextState: VoiceSummaryState = {
		...state,
		items: nextItems,
		lastCommittedSegmentIndex: state.segments.length,
		version: state.version + (diff.length > 0 ? 1 : 0),
		nextItemSeq: nextSeq,
		openCarryItemId: nextOpenCarryItemId,
		openCarryBudget: nextOpenCarryBudget,
	};

	return { state: nextState, diff };
}
