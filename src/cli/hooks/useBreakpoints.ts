export type WidthBreakpoint = "xs" | "sm" | "md";
export type HeightBreakpoint = "short" | "normal";

export type UiBreakpoints = {
	width: WidthBreakpoint;
	height: HeightBreakpoint;
};

export const useBreakpoints = (cols: number, rows: number): UiBreakpoints => {
	const width: WidthBreakpoint = cols < 60 ? "xs" : cols < 100 ? "sm" : "md";
	const height: HeightBreakpoint = rows < 14 ? "short" : "normal";
	return { width, height };
};
