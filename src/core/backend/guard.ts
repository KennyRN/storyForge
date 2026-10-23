/**
 * The write guard, as a pure decision over an operation (docs/project-handle.md §6).
 *
 * It sits at the backend boundary (see guarded.ts), below the data layer, so no data function can
 * get around it. Its rules are the 0.17.1 guard's, made explicit, minus the `_export/` allowance,
 * plus the hardening that case, Unicode and separator variants of a protected folder never get
 * through. The same rules are written as a data table in test/guard-spec/guard.json, which the
 * Rust guard in Brief 4 must pass unchanged.
 */
import {
	BACKSTAGE_ROOT,
	BACKUPS_FOLDER,
	CODEX_ROOT,
	EXPORT_ROOT,
	LIBRARY_ROOT,
	NOTES_ROOT,
	isCodexNotePath,
	isLibraryChapterPath,
	isLibraryRootFilePath,
} from "../paths";
import { foldKey, resolvePath } from "../pathRules";

export type GuardOp =
	| { op: "write-file"; path: string }
	| { op: "write-binary"; path: string }
	| { op: "create-file"; path: string }
	| { op: "create-folder"; path: string }
	| { op: "rename"; from: string; to: string }
	| { op: "retire"; path: string }
	/** `keys`: the top-level frontmatter keys the edit changes. Codex notes allow exactly ["aliases"]. */
	| { op: "frontmatter-edit"; path: string; keys?: readonly string[] }
	/** Compare-then-write of an existing chapter or Codex note body. Only the prose writer calls this. */
	| { op: "prose-write"; path: string }
	/** Compare-then-write of an existing markdown file in the library, Codex or notes. Only the link rewriter calls this. */
	| { op: "link-rewrite"; path: string }
	/** Create-if-absent of `_sf-backup/<name>.zip`. */
	| { op: "backup-create"; path: string }
	/** Create-if-absent of `_sf-backup/recovery/**.md`. */
	| { op: "recovery-create"; path: string }
	/** `Codex/*.md` to `Codex/*.md`. Only the link rewriter calls this. */
	| { op: "codex-rename"; from: string; to: string };

export type GuardDecision = { allow: true } | { allow: false; reason: string };

export class ForbiddenWriteError extends Error {
	constructor(
		public readonly path: string,
		public readonly reason = "outside every allowed root",
		public readonly op?: string,
	) {
		super(`storyForge refused to ${op ?? "write"} "${path}": ${reason}`);
		this.name = "ForbiddenWriteError";
	}
}

const PROTECTED_ROOTS = [LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT, "_backstage", BACKUPS_FOLDER, EXPORT_ROOT];

type PathClass =
	| "backstage-root"
	| "backstage"
	| "flat-root-file"
	| "chapter"
	| "codex-note"
	| "library-root"
	| "library-book"
	| "codex-root"
	| "notes-root"
	| "backup-root"
	| "backup"
	| "other";

function classify(p: string): PathClass {
	if (p === BACKSTAGE_ROOT) return "backstage-root";
	if (p.startsWith(`${BACKSTAGE_ROOT}/`)) return "backstage";
	if (isLibraryRootFilePath(p)) return "flat-root-file";
	if (isLibraryChapterPath(p)) return "chapter";
	if (isCodexNotePath(p)) return "codex-note";
	if (p === LIBRARY_ROOT) return "library-root";
	if (p === CODEX_ROOT) return "codex-root";
	if (p === NOTES_ROOT) return "notes-root";
	if (p.startsWith(`${LIBRARY_ROOT}/`) && p.split("/").length === 2) return "library-book";
	if (p === BACKUPS_FOLDER) return "backup-root";
	if (p.startsWith(`${BACKUPS_FOLDER}/`)) return "backup";
	return "other";
}

const refuse = (reason: string): GuardDecision => ({ allow: false, reason });
const ALLOW: GuardDecision = { allow: true };

/** Reason text for a path that is refused: names the case/Unicode variant problem when that is the cause. */
function otherReason(p: string): string {
	const key = foldKey(p);
	for (const root of PROTECTED_ROOTS) {
		const r = root.toLowerCase();
		if (key === r || key.startsWith(r + "/")) {
			return `"${p}" is a case or Unicode variant of the protected folder "${root}"`;
		}
	}
	return "outside every allowed root";
}

function isMetadata(c: PathClass): boolean {
	return c === "backstage" || c === "flat-root-file";
}

export function checkGuard(op: GuardOp): GuardDecision {
	const resolve = (raw: string): string | null => {
		const p = resolvePath(raw);
		return p === null || p === "" ? null : p;
	};
	const bad = (raw: string) => refuse(`"${raw}" is not a safe relative path`);

	if (op.op === "codex-rename") {
		const from = resolve(op.from);
		const to = resolve(op.to);
		if (from === null) return bad(op.from);
		if (to === null) return bad(op.to);
		if (isCodexNotePath(from) && isCodexNotePath(to)) return ALLOW;
		return refuse("a Codex rename is only ever Codex/<name>.md to Codex/<name>.md");
	}

	if (op.op === "rename") {
		const from = resolve(op.from);
		const to = resolve(op.to);
		if (from === null) return bad(op.from);
		if (to === null) return bad(op.to);
		const cf = classify(from);
		const ct = classify(to);
		if (isMetadata(cf) && isMetadata(ct)) return ALLOW;
		if (cf === "other") return refuse(otherReason(from));
		if (ct === "other") return refuse(otherReason(to));
		return refuse(`renaming ${cf} to ${ct} is not allowed`);
	}

	const p = resolve(op.path);
	if (p === null) return bad(op.path);
	const c = classify(p);

	switch (op.op) {
		case "write-file":
		case "write-binary":
			if (c === "backup") return refuse("_sf-backup/ is create-only: nothing in it is ever overwritten");
			if (c === "backstage" || c === "flat-root-file") return ALLOW;
			if (c === "chapter") return refuse("chapter prose is never written");
			if (c === "codex-note") return refuse("Codex note bodies are never written");
			return refuse(c === "other" ? otherReason(p) : `a ${c} is not a writable file`);
		case "create-file":
			if (c === "backup") return refuse("_sf-backup/ files are created only as backups or recovery files");
			if (c === "backstage" || c === "flat-root-file" || c === "chapter" || c === "codex-note") return ALLOW;
			return refuse(c === "other" ? otherReason(p) : `cannot create a file at a ${c}`);
		case "create-folder":
			if (c === "backstage-root" || c === "backstage" || c === "library-root" || c === "library-book" || c === "codex-root" || c === "notes-root" || c === "backup-root" || c === "backup") {
				return ALLOW;
			}
			return refuse(c === "other" ? otherReason(p) : `cannot create a folder at a ${c}`);
		case "retire":
			if (isMetadata(c)) return ALLOW;
			return refuse(c === "other" ? otherReason(p) : `only backstage metadata is ever retired, not a ${c}`);
		case "prose-write":
			if (c === "chapter" || c === "codex-note") return ALLOW;
			return refuse(c === "other" ? otherReason(p) : `prose is only written to chapters and Codex notes, not a ${c}`);
		case "link-rewrite":
			if (c === "chapter" || c === "codex-note" || (p.startsWith("notes/") && p.toLowerCase().endsWith(".md") && !p.split("/").some((x) => x.startsWith(".")))) return ALLOW;
			return refuse(c === "other" && !p.startsWith("notes/") ? otherReason(p) : `links are only rewritten in chapters, Codex notes and notes, not a ${c}`);
		case "backup-create":
			if (c === "backup" && p.split("/").length === 2 && p.toLowerCase().endsWith(".zip")) return ALLOW;
			return refuse("backups are _sf-backup/<name>.zip");
		case "recovery-create":
			if (c === "backup" && p.startsWith(`${BACKUPS_FOLDER}/recovery/`) && p.split("/").length >= 4 && p.toLowerCase().endsWith(".md")) return ALLOW;
			return refuse("recovery files are _sf-backup/recovery/<folder>/<name>.md");
		case "frontmatter-edit":
			if (isMetadata(c)) return ALLOW;
			if (c === "codex-note") {
				const keys = op.keys;
				if (keys && keys.length === 1 && keys[0] === "aliases") return ALLOW;
				return refuse("Codex notes allow editing the aliases key only");
			}
			if (c === "chapter") return refuse("chapter frontmatter is never edited");
			return refuse(c === "other" ? otherReason(p) : `cannot edit frontmatter at a ${c}`);
	}
}

/** Throws ForbiddenWriteError when the guard refuses `op`. */
export function assertAllowed(op: GuardOp): void {
	const decision = checkGuard(op);
	if (!decision.allow) {
		const path = op.op === "rename" || op.op === "codex-rename" ? `${op.from} -> ${op.to}` : op.path;
		throw new ForbiddenWriteError(path, decision.reason, op.op);
	}
}
