import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
	lstat,
	mkdir,
	realpath,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { workspaceRoot } from "../config/workspace-root";

export const MAX_READ_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_WRITE_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_OUTPUT_CHARS = 50_000; // 50,000 characters
export const MAX_LINES_DEFAULT = 2_000; // 2,000 lines

export interface ResolvedPath {
	absolute: string;
	relativeToRoot: string;
	exists: boolean;
}

const PROTECTED_DIR_SEGMENTS = new Set([".git", "node_modules", ".ssh"]);

/**
 * Returns true if the workspace-relative path targets something we never want
 * agents to read or mutate (secrets, vcs internals, vendored deps, ssh keys).
 *
 * Matches on full path segments to avoid false positives like ".gitignore" or
 * "environment.ts" and false negatives like ".env.production" that a naive
 * substring match would produce.
 */
export function isProtectedPath(relativePath: string): boolean {
	const segments = relativePath
		.replaceAll(sep, "/")
		.split("/")
		.filter((s) => s.length > 0 && s !== ".");
	if (segments.length === 0) {
		return false;
	}
	for (const seg of segments) {
		if (PROTECTED_DIR_SEGMENTS.has(seg)) {
			return true;
		}
		if (seg === ".env" || seg.startsWith(".env.")) {
			return true;
		}
	}
	return false;
}

async function realExistingAncestor(abs: string): Promise<string> {
	let current = abs;
	while (true) {
		if (existsSync(current)) {
			return await realpath(current);
		}
		const parent = resolve(current, "..");
		if (parent === current) {
			return current;
		}
		current = parent;
	}
}

/**
 * Resolves a user-supplied path and guarantees it stays inside the workspace,
 * both syntactically (no "../" escape) and physically (no symlink escape).
 */
export async function resolveSafePath(input: string): Promise<ResolvedPath> {
	if (typeof input !== "string" || input.length === 0) {
		throw new Error("Path must be a non-empty string");
	}
	if (input.includes("\0")) {
		throw new Error("Path contains null byte");
	}

	const absolute = isAbsolute(input)
		? resolve(input)
		: resolve(workspaceRoot, input);

	const relToRoot = relative(workspaceRoot, absolute);
	if (relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
		throw new Error(`Path escapes workspace: ${input}`);
	}

	const ancestor = await realExistingAncestor(absolute);
	const relAncestor = relative(workspaceRoot, ancestor);
	if (relAncestor.startsWith("..") || isAbsolute(relAncestor)) {
		throw new Error(`Resolved path escapes workspace: ${input}`);
	}

	if (isProtectedPath(relToRoot)) {
		throw new Error(`Path is protected and cannot be accessed: ${relToRoot}`);
	}

	return {
		absolute,
		relativeToRoot: relToRoot === "" ? "." : relToRoot,
		exists: existsSync(absolute),
	};
}

/**
 * Asserts the target is a regular, non-symlink file. Returns its size.
 */
export async function assertRegularFile(abs: string): Promise<number> {
	const st = await lstat(abs);
	if (st.isSymbolicLink()) {
		throw new Error("Refusing to operate on symlink");
	}
	if (!st.isFile()) {
		throw new Error("Path is not a regular file");
	}
	return st.size;
}

export function assertTextContent(content: string, label = "content"): void {
	if (content.includes("\0")) {
		throw new Error(`Refusing to write binary ${label} (contains null byte)`);
	}
}

/**
 * Crash-safe write: writes to a sibling tmp file with exclusive-create flag,
 * then atomically renames over the target. Stale tmp files are cleaned up on
 * any failure.
 */
export async function atomicWriteFile(
	abs: string,
	content: string,
): Promise<void> {
	await mkdir(dirname(abs), { recursive: true });
	const tmp = `${abs}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
	try {
		await writeFile(tmp, content, { encoding: "utf8", flag: "wx" });
		await rename(tmp, abs);
	} catch (err) {
		try {
			await unlink(tmp);
		} catch {
			// best effort cleanup
		}
		throw err;
	}
}

/**
 * True if the buffer looks binary (contains NUL bytes in its inspected head).
 */
export function looksBinary(buf: Buffer): boolean {
	const head = buf.subarray(0, Math.min(buf.length, 8_000));
	return head.indexOf(0) !== -1;
}

export function errorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}
