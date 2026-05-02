import type { Workspace } from "@mastra/core/workspace";

/**
 * 启动时展示「已发现哪些 skills」的纯文本行（无 ANSI，供 CLI 上色或 TUI 块）。
 */
export async function getStartupSkillLogLines(
	workspace: Workspace,
): Promise<string[]> {
	const skills = workspace.skills;
	if (!skills) {
		return ["[skills] (none — workspace.skills unavailable)"];
	}
	try {
		const list = await skills.list();
		if (list.length === 0) {
			return [
				"[skills] loaded: 0",
				"[skills] hint: add SKILL.md under src/mastra/skills/ or project .skills/",
			];
		}
		const lines: string[] = [`[skills] loaded: ${list.length}`];
		for (const m of list) {
			lines.push(`[skills]   • ${m.name}: ${m.description}`);
		}
		return lines;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return [`[skills] discovery failed: ${msg}`];
	}
}
