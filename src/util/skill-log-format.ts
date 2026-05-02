const MASTRA_SKILL_TOOLS = new Set(["skill", "skill_read", "skill_search"]);

export function isMastraSkillTool(toolName: string): boolean {
	return MASTRA_SKILL_TOOLS.has(toolName);
}

/** CLI / TUI：skill 类工具调用的一行摘要（仅名称 / 路径 / 查询，无概要） */
export function formatSkillToolCallSummary(
	toolName: string,
	args: unknown,
): string {
	const a = args as Record<string, unknown> | null | undefined;
	if (toolName === "skill") {
		return String(a?.name ?? "").trim() || "(未指定)";
	}
	if (toolName === "skill_read") {
		const skillName = String(a?.skillName ?? "").trim() || "(未指定)";
		const path = String(a?.path ?? "").trim() || "(未指定)";
		return `${skillName} @ ${path}`;
	}
	if (toolName === "skill_search") {
		const q = String(a?.query ?? "").trim() || "(空查询)";
		return q;
	}
	return "";
}

/** 工具结果短预览（不展开正文） */
export function formatSkillToolResultPreview(
	toolName: string,
	_result: unknown,
): string {
	if (toolName === "skill") {
		return "已载入";
	}
	if (toolName === "skill_read") {
		return "已读取";
	}
	if (toolName === "skill_search") {
		return "已完成";
	}
	return "";
}
