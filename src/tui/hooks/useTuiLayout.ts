import { useMemo } from "react";
import { computeTuiLayout, type TuiLayout } from "../lib/layout-types";

export type { TuiLayout } from "../lib/layout-types";

export const useTuiLayout = (cols: number, rows: number): TuiLayout =>
	useMemo(() => computeTuiLayout(cols, rows), [cols, rows]);
