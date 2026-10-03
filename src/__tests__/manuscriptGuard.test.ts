import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { App, TFile } from "obsidian";
import { ForbiddenWriteError, writeManuscriptChapterBody } from "../writeGuard";
import { BACKSTAGE_ROOT, CODEX_ROOT, bookFilePath, libraryBookPath, libraryChapterPath } from "../paths";
import { makeTFile, makeTFolder } from "./obsidianStub";

/** One book ("BookA") with two placed chapters, an unplaced idea, and an archived chapter; a second
 * book ("BookB") with one placed chapter; plus a Codex note and a backstage file. */
function makeWorld() {
	const files = new Map<string, TFile>();
	const contents = new Map<string, string>();
	const add = (path: string, text = "") => {
		const file = makeTFile(path) as unknown as TFile;
		files.set(path, file);
		contents.set(path, text);
		return file;
	};
	const ch1 = add(libraryChapterPath("BookA", "a1.md"), "One.\n");
	const ch2 = add(libraryChapterPath("BookA", "a2.md"), "Two.\n");
	const idea = add(libraryChapterPath("BookA", "idea.md"), "Idea.\n");
	const archived = add(libraryChapterPath("BookA", "old.md"), "Old.\n");
	const other = add(libraryChapterPath("BookB", "b1.md"), "Other book.\n");
	const codex = add(`${CODEX_ROOT}/Hero.md`, "Hero.\n");
	const backstage = add(`${BACKSTAGE_ROOT}/BookA/notes.md`, "Notes.\n");
	add(bookFilePath("BookA"));
	add(bookFilePath("BookB"));

	const folderA = makeTFolder(libraryBookPath("BookA"));
	folderA.children = [ch1, ch2, idea, archived] as never;
	const folderB = makeTFolder(libraryBookPath("BookB"));
	folderB.children = [other] as never;
	const folders = new Map([
		[folderA.path, folderA],
		[folderB.path, folderB],
	]);
	const frontmatter: Record<string, Record<string, unknown>> = {
		[bookFilePath("BookA")]: { "chapter-order": ["a1.md", "a2.md", "old.md"], archive: ["old.md"] },
		[bookFilePath("BookB")]: { "chapter-order": ["b1.md"] },
	};
	const writes: string[] = [];

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => folders.get(path) ?? files.get(path) ?? null,
			process: async (file: TFile, fn: (data: string) => string) => {
				const before = contents.get(file.path) ?? "";
				const after = fn(before);
				if (after !== before) writes.push(file.path);
				contents.set(file.path, after);
				return after;
			},
		},
		metadataCache: {
			getCache: (path: string) => (frontmatter[path] ? { frontmatter: frontmatter[path] } : null),
		},
	} as unknown as App;

	return { app, contents, writes, ch1, ch2, idea, archived, other, codex, backstage };
}

describe("writeManuscriptChapterBody", () => {
	it("writes a placed chapter of the open book when the base matches disk", async () => {
		const w = makeWorld();
		const result = await writeManuscriptChapterBody(w.app, w.ch1, "BookA", "One.\n", "One, edited.\n");
		expect(result).toEqual({ status: "written" });
		expect(w.contents.get(w.ch1.path)).toBe("One, edited.\n");
	});

	it("leaves disk untouched and reports a conflict when the base is stale", async () => {
		const w = makeWorld();
		w.contents.set(w.ch1.path, "Changed elsewhere.\n");
		const result = await writeManuscriptChapterBody(w.app, w.ch1, "BookA", "One.\n", "Mine.\n");
		expect(result).toEqual({ status: "conflict", disk: "Changed elsewhere.\n" });
		expect(w.contents.get(w.ch1.path)).toBe("Changed elsewhere.\n");
		expect(w.writes).toEqual([]);
	});

	it("writes nothing when the text is unchanged", async () => {
		const w = makeWorld();
		expect(await writeManuscriptChapterBody(w.app, w.ch2, "BookA", "Two.\n", "Two.\n")).toEqual({ status: "unchanged" });
		expect(w.writes).toEqual([]);
	});

	const refusals: [string, (w: ReturnType<typeof makeWorld>) => [TFile, string]][] = [
		["an unplaced (idea) chapter", (w) => [w.idea, "BookA"]],
		["an archived chapter", (w) => [w.archived, "BookA"]],
		["a chapter of another book", (w) => [w.other, "BookA"]],
		["a chapter claimed for the wrong book", (w) => [w.ch1, "BookB"]],
		["a Codex note", (w) => [w.codex, "BookA"]],
		["a backstage file", (w) => [w.backstage, "BookA"]],
		["the book's own novel.md", (w) => [makeTFile(bookFilePath("BookA")) as unknown as TFile, "BookA"]],
		["a TFile not in the vault index", (w) => [makeTFile(libraryChapterPath("BookA", "a1.md")) as unknown as TFile, "BookA"]],
		["a traversal path", (w) => [makeTFile(`${libraryBookPath("BookA")}/../BookA/a1.md`) as unknown as TFile, "BookA"]],
		["a nested path inside the book folder", (w) => [makeTFile(`${libraryBookPath("BookA")}/sub/a1.md`) as unknown as TFile, "BookA"]],
		["a non-markdown file", (w) => [makeTFile(libraryChapterPath("BookA", "a1.txt")) as unknown as TFile, "BookA"]],
		["an absolute path", (w) => [makeTFile(`/${libraryChapterPath("BookA", "a1.md")}`) as unknown as TFile, "BookA"]],
	];
	for (const [name, pick] of refusals) {
		it(`refuses ${name}, before touching anything`, async () => {
			const w = makeWorld();
			const [file, book] = pick(w);
			await expect(writeManuscriptChapterBody(w.app, file, book, "x", "y")).rejects.toThrow(ForbiddenWriteError);
			expect(w.writes).toEqual([]);
		});
	}
});

describe("architecture: the prose write path has one caller", () => {
	const SRC = join(__dirname, "..");
	const ALLOWED = new Set(["writeGuard.ts", join("view", "manuscript", "manuscriptWriter.ts")]);

	/** Code only: a comment naming the entry point (book.ts's createChapter doc does) isn't a use. */
	function code(file: string): string {
		return readFileSync(file, "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/(^|[^:])\/\/.*$/gm, "$1");
	}

	function sourceFiles(dir: string): string[] {
		const out: string[] = [];
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				if (entry !== "__tests__") out.push(...sourceFiles(full));
			} else if (entry.endsWith(".ts")) {
				out.push(full);
			}
		}
		return out;
	}

	it("only manuscriptWriter.ts references writeManuscriptChapterBody", () => {
		const offenders = sourceFiles(SRC)
			.filter((file) => code(file).includes("writeManuscriptChapterBody"))
			.map((file) => relative(SRC, file))
			.filter((file) => !ALLOWED.has(file));
		expect(offenders).toEqual([]);
	});

	it("only manuscriptWriter.ts imports writeGuard's chapter-body entry point under any alias", () => {
		// A renamed import (`import { writeManuscriptChapterBody as w }`) still names it, so the scan
		// above catches it; a namespace import of writeGuard could reach it without naming it.
		const namespaceImports = sourceFiles(SRC)
			.filter((file) => /import\s+\*\s+as\s+\w+\s+from\s+["'][./]*writeGuard["']/.test(code(file)))
			.map((file) => relative(SRC, file));
		expect(namespaceImports).toEqual([]);
	});
});
