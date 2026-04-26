/**
 * 终端一行的「显示列数」与按列折行。宽字符（常见 CJK / 全角等）计 2，其余可打印 ASCII 等计 1。
 * 与 OpenTUI/常见等宽 TUI 对东亚文字的占用一致。
 */
export function isWideCodePoint(codePoint: number): boolean {
	if (codePoint < 0x20 || codePoint === 0x7f) {
		return false;
	}
	return (
		(codePoint >= 0x1_100 && codePoint <= 0x1_15f) ||
		(codePoint >= 0x2_310 && codePoint <= 0x2_31f) ||
		(codePoint >= 0x2_e80 && codePoint <= 0x9_fff) ||
		(codePoint >= 0xa_960 && codePoint <= 0xa_97f) ||
		(codePoint >= 0xac_00 && codePoint <= 0xd_7a3) ||
		(codePoint >= 0xf9_00 && codePoint <= 0xfa_ff) ||
		(codePoint >= 0xfe_10 && codePoint <= 0xfe_1f) ||
		(codePoint >= 0xfe_30 && codePoint <= 0xfe_6b) ||
		(codePoint >= 0xff_01 && codePoint <= 0xff_60) ||
		(codePoint >= 0xff_e0 && codePoint <= 0xff_e6) ||
		(codePoint >= 0x1_f300 && codePoint <= 0x1_f64f) ||
		(codePoint >= 0x1_f900 && codePoint <= 0x1_f9ff)
	);
}

export function terminalCodeWidth(codePoint: number): number {
	if (codePoint < 0x20) {
		return 0;
	}
	if (isWideCodePoint(codePoint)) {
		return 2;
	}
	return 1;
}

export function terminalDisplayWidth(s: string): number {
	let w = 0;
	for (let i = 0; i < s.length; ) {
		const cp = s.codePointAt(i) ?? 0;
		const step = cp > 0xffff ? 2 : 1;
		w += terminalCodeWidth(cp);
		i += step;
	}
	return w;
}

/** 从行首起截取至多 `maxCols` 个显示列的字符串，不截断宽字符 */
export function takeDisplayColumns(
	s: string,
	maxCols: number,
): { line: string; rest: string } {
	if (maxCols < 1 || s.length === 0) {
		return { line: "", rest: s };
	}
	let used = 0;
	const parts: string[] = [];
	let i = 0;
	while (i < s.length) {
		const cp = s.codePointAt(i) ?? 0;
		const ch = String.fromCodePoint(cp);
		const step = ch.length;
		const cw = Math.max(0, terminalCodeWidth(cp));
		if (cw > 0 && used + cw > maxCols) {
			break;
		}
		used += cw;
		parts.push(ch);
		i += step;
	}
	if (parts.length === 0 && s.length > 0) {
		const cp = s.codePointAt(0) ?? 0;
		const ch = String.fromCodePoint(cp);
		return { line: ch, rest: s.slice(ch.length) };
	}
	return { line: parts.join(""), rest: s.slice(i) };
}

export function wrapToDisplayWidth(s: string, maxCols: number): string[] {
	const mc = Math.max(1, maxCols);
	if (!s) {
		return [""];
	}
	const lines: string[] = [];
	let rem = s;
	while (rem.length > 0) {
		const { line, rest } = takeDisplayColumns(rem, mc);
		lines.push(line);
		rem = rest;
	}
	if (lines.length === 0) {
		lines.push("");
	}
	return lines;
}

/**
 * 首行最多 `wFirst` 列，同段续行每行最多 `wNext` 列（均指正文，不含行首前缀）。
 */
export function wrapFirstSegmentDisplayWidths(
	s: string,
	wFirst: number,
	wNext: number,
): string[] {
	const wf = Math.max(1, wFirst);
	const wn = Math.max(1, wNext);
	if (!s) {
		return [""];
	}
	const { line, rest } = takeDisplayColumns(s, wf);
	if (rest.length === 0) {
		return [line];
	}
	const out: string[] = [line];
	let rem = rest;
	while (rem.length > 0) {
		const { line: l2, rest: r2 } = takeDisplayColumns(rem, wn);
		out.push(l2);
		rem = r2;
	}
	return out;
}
