/**
 * Path rules shared by the index, the guard and the backends (docs/project-handle.md §3, §6).
 *
 * Project paths are relative to the project root and use "/". Lookups are case-insensitive and
 * Unicode-normalised (NFC); the on-disk spelling is kept elsewhere and reported.
 */

/**
 * Resolves a raw path to its canonical project-relative form: backslashes become "/", empty and
 * "." segments are dropped, ".." segments are resolved, every segment is NFC-normalised.
 * Returns null for anything that is not a safe relative path: absolute paths (POSIX or drive
 * letter), NUL bytes, or ".." escaping the root. "" is the root itself.
 */
export function resolvePath(raw: string): string | null {
	if (raw.includes("\0")) return null;
	const unified = raw.replace(/\\/g, "/");
	if (unified.startsWith("/") || /^[A-Za-z]:/.test(unified)) return null;
	const out: string[] = [];
	for (const segment of unified.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (out.length === 0) return null;
			out.pop();
			continue;
		}
		out.push(segment.normalize("NFC"));
	}
	return out.join("/");
}

/** The case-insensitive, NFC lookup key for a path (already canonical or not). */
export function foldKey(path: string): string {
	const resolved = resolvePath(path);
	return (resolved ?? path).toLowerCase();
}

export function parentOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? "" : path.slice(0, i);
}

export function baseName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

export function joinPath(...parts: string[]): string {
	return parts.filter((p) => p !== "").join("/");
}

/** True when any segment starts with "." (`.obsidian/`, `.git/`, `.trash/`, temp files). */
export function isHiddenPath(path: string): boolean {
	return path.split("/").some((segment) => segment.startsWith("."));
}

/** True when `path` is `folder` or inside it, comparing with the lookup key. */
export function isInside(path: string, folder: string): boolean {
	const p = foldKey(path);
	const f = foldKey(folder);
	return f === "" || p === f || p.startsWith(f + "/");
}

/**
 * `.Name.md.icloud` is what macOS leaves in place of a file that iCloud has not downloaded. Returns
 * the real project path (`Name.md`) for such a stub, or null for any other path. A stub inside a
 * hidden folder is not reported.
 */
export function icloudPlaceholderTarget(path: string): string | null {
	const slash = path.lastIndexOf("/");
	const base = path.slice(slash + 1);
	if (!base.startsWith(".") || !base.endsWith(".icloud") || base.length <= ".icloud".length + 1) return null;
	return `${path.slice(0, slash + 1)}${base.slice(1, -".icloud".length)}`;
}
