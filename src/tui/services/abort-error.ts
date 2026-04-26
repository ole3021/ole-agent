/**
 * 识别流/请求因 `AbortSignal` 中止产生的错误，避免记为普通 `error`。
 */
export const isAbortError = (error: unknown): boolean => {
	if (error == null || typeof error !== "object") {
		return false;
	}
	if (error instanceof DOMException && error.name === "AbortError") {
		return true;
	}
	const name = (error as { name?: string }).name;
	return name === "AbortError";
};
