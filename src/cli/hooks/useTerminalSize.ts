import { useStdout } from "ink";
import { useEffect, useState } from "react";

export type TerminalSize = {
	cols: number;
	rows: number;
};

export const useTerminalSize = (): TerminalSize => {
	const { stdout } = useStdout();
	const [size, setSize] = useState<TerminalSize>({
		cols: stdout.columns ?? 80,
		rows: stdout.rows ?? 24,
	});

	useEffect(() => {
		const onResize = () => {
			setSize({
				cols: stdout.columns ?? 80,
				rows: stdout.rows ?? 24,
			});
		};
		stdout.on("resize", onResize);
		return () => {
			stdout.off("resize", onResize);
		};
	}, [stdout]);

	return size;
};
