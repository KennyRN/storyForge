import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Who may call the caller-restricted backend operations. The guard sees paths and operations, not
 * callers, so this test is what keeps the prose tenet (decision 19): chapter and Codex note bodies
 * are written only by the prose writer and the link rewriter.
 */
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
		return p.endsWith(".ts") ? [p] : [];
	});
}
/** Source with `import type ...` statements removed: importing a type grants no power. */
const valueImportsOnly = (text: string) => text.replace(/import\s+type\s+[^;]*?from\s+["'][^"']*["'];?/g, "");
const files = walk(SRC).map((p) => ({ path: relative(SRC, p), text: readFileSync(p, "utf8") }));

/** Calls of `.name(` anywhere in src, outside the defining and allowed files. */
const RESTRICTED: Record<string, string[]> = {
	proseWrite: ["core/proseWriter.ts"],
	linkRewrite: ["core/linkRewriter.ts"],
	codexRename: ["core/linkRewriter.ts"],
	createBackup: ["core/backup.ts"],
	createRecovery: ["core/recovery.ts"],
	removeTemp: ["core/tempTidy.ts"],
	writeTextIfUnchanged: ["core/backend/guarded.ts", "backends/node-fs/index.ts"],
	// The cover commands (decision 42): the picker is reached only from the model, the reader only from the cover box.
	pickCover: ["ui/model.ts"],
	readCover: ["ui/overviews/cover.ts"],
};
const DEFINERS = new Set(["core/backend/guarded.ts", "core/backend/types.ts", "backends/node-fs/index.ts"]);

describe("architecture: who may call the restricted backend operations", () => {
	for (const [method, allowed] of Object.entries(RESTRICTED)) {
		it(`${method} is called only from ${allowed.join(", ")}`, () => {
			const callers = files
				.filter((f) => new RegExp(`\\.${method}\\s*\\(`).test(f.text) && !DEFINERS.has(f.path) && !allowed.includes(f.path))
				.map((f) => f.path);
			expect(callers).toEqual([]);
		});
	}

	it("the restricted modules are imported only by the modules that may use them", () => {
		const importers = (mod: string) =>
			files.filter((f) => new RegExp(`from\\s+["'][^"']*/${mod}["']`).test(valueImportsOnly(f.text)) && f.path !== `core/${mod}.ts`).map((f) => f.path);
		// Nothing but the prose writer and the link rewriter may import each other's operations, and
		// reconciliation, opening, backups and recovery never import either writer.
		for (const writer of ["proseWriter", "linkRewriter"]) {
			const bad = importers(writer).filter((p) => !["core/openProject.ts", "core/index.ts"].includes(p));
			expect(bad, `${writer} is imported by`).toEqual([]);
		}
		// Reconciliation, backups, recovery, the snapshot and the index never reach for either writer.
		for (const mod of ["reconciler", "reconciliation", "backup", "recovery", "snapshot", "project", "projectIndex"]) {
			const f = files.find((x) => x.path === `core/${mod}.ts`);
			expect(f, mod).toBeDefined();
			expect(/from\s+["'][^"']*\/(proseWriter|linkRewriter)["']/.test(valueImportsOnly(f!.text)), `${mod} imports a prose writer`).toBe(false);
		}
	});

	it("nothing outside the backend reaches the raw backend's write methods", () => {
		const offenders = files
			.filter((f) => !DEFINERS.has(f.path) && /\braw\.(writeText|writeTextIfUnchanged|createFile|rename|retire)\b/.test(f.text))
			.map((f) => f.path);
		expect(offenders).toEqual([]);
	});

	it("the field editors (plot notes, synopsis, description) can't reach the prose writer, the chapter editor or the session tracker (decision 47)", () => {
		// Their text is written only through FieldState and fieldWriter.ts; they never start, extend or count in a writing session.
		const FIELD_FILES = ["ui/overviews/fieldCommitter.ts", "ui/overviews/fieldState.ts", "ui/overviews/sectionFields.ts"];
		const FORBIDDEN_IMPORTS = [/\/proseWriter["']/, /\/editor\/editor["']/, /\/editor\/editorHost["']/, /\/sessionRecorder["']/, /\/sessions["']/, /\/sessionFiles["']/];
		const FORBIDDEN_CALLS = [/\.setBody\s*\(/, /\.onAuthorEdit\b/, /\bmountSessionEditor\b/, /\bProseSession\b/, /\bProseWriter\b/];
		for (const path of FIELD_FILES) {
			const file = files.find((f) => f.path === path);
			expect(file, `${path} exists`).toBeDefined();
			const text = valueImportsOnly(file!.text);
			for (const re of FORBIDDEN_IMPORTS) expect(re.test(text), `${path} imports ${re}`).toBe(false);
			for (const re of FORBIDDEN_CALLS) expect(re.test(text), `${path} uses ${re}`).toBe(false);
		}
		// The only editor module they may use is the typing aids, which has no session or writer in it.
		for (const path of ["ui/editor/typingAids.ts", "ui/editor/shortcodePopup.ts"]) {
			const aids = files.find((f) => f.path === path)!;
			for (const re of [...FORBIDDEN_IMPORTS, ...FORBIDDEN_CALLS]) expect(re.test(valueImportsOnly(aids.text)), `${path} uses ${re}`).toBe(false);
		}
	});

	it("the context panel's read-only chapter text can't reach the prose writer, the chapter editor or the session tracker (Brief 14 §1.6)", () => {
		// It only reads: the editor that holds the chapter tells it each change (EditorHost.watchText), and it holds no session.
		const file = files.find((f) => f.path === "ui/context/chapterText.ts");
		expect(file, "ui/context/chapterText.ts exists").toBeDefined();
		const text = valueImportsOnly(file!.text);
		const FORBIDDEN_IMPORTS = [/\/proseWriter["']/, /\/editor\/editor["']/, /\/editor\/editorHost["']/, /\/sessionRecorder["']/, /\/sessions["']/, /\/sessionFiles["']/, /\/typingAids["']/, /\/fieldWriter["']/];
		const FORBIDDEN_CALLS = [/\.setBody\s*\(/, /\.onAuthorEdit\b/, /\bmountSessionEditor\b/, /\bProseSession\b/, /\bProseWriter\b/, /\.sessionIn\s*\(/, /\bopenFile\b/];
		for (const re of FORBIDDEN_IMPORTS) expect(re.test(text), `chapterText.ts imports ${re}`).toBe(false);
		for (const re of FORBIDDEN_CALLS) expect(re.test(text), `chapterText.ts uses ${re}`).toBe(false);
		// And the one thing it asks the editor host for is the text: watchText and liveText.
		expect([...new Set([...text.matchAll(/model\.editors\??\.(\w+)/g)].map((m) => m[1]))].sort()).toEqual(["liveText", "watchText"]);
	});

	it("the typing aids are mounted only in the chapter and note editor and in the field editors (decision 53); the rename, settings and search boxes take none", () => {
		const users = files.filter((f) => /\btypingAids\s*\(/.test(valueImportsOnly(f.text)) && f.path !== "ui/editor/typingAids.ts").map((f) => f.path).sort();
		expect(users).toEqual(["ui/editor/editor.ts", "ui/overviews/fieldCommitter.ts"]);
	});
});
