import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { checkProject } from "../checkProject";

afterEach(cleanupFixtures);

describe("checkProject", () => {
	it("reports the series, chapters, word counts and Codex of the fixture, and finds no problems", async () => {
		const root = copyFixture("series");
		const { exitCode, report } = await checkProject(root);
		expect(exitCode).toBe(0);
		expect(report).toContain('SERIES  "The Lantern Cycle" (s-7k2p)  placed: 2, unplaced: 1');
		expect(report).toContain("1. Book 1: The Harbour Wakes  [aaa]");
		expect(report).toContain("chapters: 3 placed, 1 unplaced, 1 archived   words: 55 of 80,000 planned");
		expect(report).toContain("1. Chapter 1  (ch-a1.md, 22 words)");
		expect(report).toContain("2. Book 2  [bbb]");
		expect(report).toContain("CODEX   6 notes, 2 virtual folders, 1 archived, 6 aliases");
		expect(report).toContain("PROBLEMS: none");
		expect(report).toMatch(/indexed \d+ files and \d+ folders in \d+ ms/);
		expect(report).toMatch(/scan time \d+ ms/);
		expect(report).toContain("RESIDUE of removed features (left untouched)");
	});

	it("never writes to the source folder", async () => {
		const root = copyFixture("series");
		const before = snapshot(root);
		await checkProject(root);
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		// and leaves no temp copy behind
		const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("sf-check-"));
		expect(leftovers).toEqual([]);
	});

	it("refuses a pre-0.17 layout with exit code 2", async () => {
		const root = copyFixture("pre-0.17");
		const before = snapshot(root);
		const { exitCode, report } = await checkProject(root);
		expect(exitCode).toBe(2);
		expect(report).toContain("REFUSED");
		expect(report).toContain("0.17.1");
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
	});

	it("reads an empty project", async () => {
		const { exitCode, report } = await checkProject(copyFixture("empty"));
		expect(exitCode).toBe(0);
		expect(report).toContain("placed: 0, unplaced: 0");
	});

	it("reports unreadable frontmatter, stray files and missing pieces", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(path.join(root, "_story-library/novel-bbb.md"), "---\nbook-id-reference: &x b\nz: *x\n---\n");
		fs.writeFileSync(path.join(root, "_story-library/stray.txt"), "x");
		fs.mkdirSync(path.join(root, "_story-library/zzz"));
		fs.writeFileSync(path.join(root, "_story-library/aaa/ch-extra.md"), "an unregistered chapter");
		fs.mkdirSync(path.join(root, "Codex/sub"));
		const { exitCode, report } = await checkProject(root);
		expect(exitCode).toBe(1);
		expect(report).toContain("unreadable frontmatter in _story-library/novel-bbb.md");
		expect(report).toContain("_story-library/stray.txt: unexpected file at the library root");
		expect(report).toContain("_story-library/zzz: book folder with no _story-library/novel-zzz.md");
		expect(report).toContain("aaa/ch-extra.md: chapter file has no entry in _story-library/novel-aaa.md");
		expect(report).toContain("Codex/sub: a real folder inside Codex/");
	});

	it("reports name collisions when the file system allows them", async () => {
		const root = copyFixture("series");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-case-"));
		fs.writeFileSync(path.join(dir, "a"), "x");
		const caseInsensitive = fs.existsSync(path.join(dir, "A"));
		fs.rmSync(dir, { recursive: true, force: true });
		if (caseInsensitive) return; // such a project can't exist on this file system
		fs.writeFileSync(path.join(root, "Codex/jane.md"), "twin");
		const { report } = await checkProject(root);
		expect(report).toContain("name collision: Codex/Jane.md  <->  Codex/jane.md");
	});

	it("rejects a path that isn't a folder", async () => {
		const { exitCode } = await checkProject("/definitely/not/here");
		expect(exitCode).toBe(2);
	});
});
