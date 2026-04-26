/**
 * 转写区可用正文行数（与 `TranscriptView` DOM 顶/底栏一致，供 `useScrollController` 同参使用）。
 */
const MIN_HEIGHT_FOOTER_ROW = 2;
const CHROME_TOP_AND_BOTTOM = 1;

export const getTranscriptBodyScrollRows = (height: number): number =>
	Math.max(
		1,
		height - (height >= MIN_HEIGHT_FOOTER_ROW ? CHROME_TOP_AND_BOTTOM : 1),
	);
