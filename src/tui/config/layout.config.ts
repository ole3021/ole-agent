/**
 * TUI 布局固定阈值与尺寸（与 TuiApp 主栏/侧栏/转写区保持一致）。
 * 仅存放常量，计算逻辑在 lib/layout-types.ts。
 */
export const tuiLayoutConfig = {
	breakpoints: {
		/** 列数小于该值视为 xs；否则在 widthMdMinCols 以下为 sm。 */
		widthSmMinCols: 60,
		/** 列数小于该值视为 sm；以上（含）为 md。 */
		widthMdMinCols: 100,
		/** 行数小于该值视为 short 高度。 */
		heightNormalMinRows: 14,
	},
	sidebar: {
		/** 总列数达到该值时显示侧栏。 */
		minTotalCols: 160,
		/** 侧栏占用的列数。 */
		widthCols: 54,
		/** 主栏与侧栏之间的间隔列。 */
		gapCols: 2,
	},
	main: {
		/** 主内容区最小列宽。 */
		minContentCols: 20,
	},
	chrome: {
		/** 从总行数中减去的固定行（顶栏/输入/状态等）。 */
		verticalReservedRows: 4,
	},
	transcript: {
		/** 转写区最小行数。 */
		minHeightRows: 3,
		/**
		 * 从主内容区中再为「本列中输入条 + 边框/间距」预留的行数。
		 * 不宜过大：过大会让 `transcriptHeight` 小于左栏在 flex 中实际可分配高度，出现转写与输入条之间的空白带。
		 */
		belowContentWhenShort: 5,
		belowContentWhenNormal: 4,
	},
} as const;

export type TuiLayoutConfig = typeof tuiLayoutConfig;
