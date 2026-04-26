import { tuiLayoutConfig } from "../config/layout.config";

const { breakpoints: bp, chrome, main, sidebar, transcript } = tuiLayoutConfig;

export type WidthBreakpoint = "xs" | "sm" | "md";
export type HeightBreakpoint = "short" | "normal";

export interface UiBreakpoints {
	width: WidthBreakpoint;
	height: HeightBreakpoint;
}

export const computeBreakpoints = (
	cols: number,
	rows: number,
): UiBreakpoints => ({
	width:
		cols < bp.widthSmMinCols ? "xs" : cols < bp.widthMdMinCols ? "sm" : "md",
	height: rows < bp.heightNormalMinRows ? "short" : "normal",
});

/** Main column + transcript height (keeps in sync with TuiApp). */
export const computeTuiLayout = (cols: number, rows: number) => {
	const layoutBp = computeBreakpoints(cols, rows);
	const hasSidebar = cols >= sidebar.minTotalCols;
	const sidebarWidth = hasSidebar ? sidebar.widthCols : 0;
	const leftCols = Math.max(
		main.minContentCols,
		cols - sidebarWidth - (hasSidebar ? sidebar.gapCols : 0),
	);
	const contentHeight = rows - chrome.verticalReservedRows;
	const transcriptHeight = Math.max(
		transcript.minHeightRows,
		layoutBp.height === "short"
			? contentHeight - transcript.belowContentWhenShort
			: contentHeight - transcript.belowContentWhenNormal,
	);
	return {
		bp: layoutBp,
		hasSidebar,
		sidebarWidth,
		leftCols,
		contentHeight,
		transcriptHeight,
	};
};

export type TuiLayout = ReturnType<typeof computeTuiLayout>;
