/**
 * 单行流式指示器一帧：9 格 ░▒▓ 亮带环移（shimmer）。
 */
export function getStreamingLineFrame(tick: number): string {
	const head = tick % 9;
	return Array.from({ length: 9 }, (_, j) => {
		const d = (j - head + 9) % 9;
		if (d === 0) {
			return "▓";
		}
		if (d === 1 || d === 8) {
			return "▒";
		}
		return "░";
	}).join("");
}
