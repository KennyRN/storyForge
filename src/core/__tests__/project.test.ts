import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { ForbiddenWriteError } from "../backend/guard";
import { UnreadableFrontmatterError } from "../frontmatter";
import { LegacyLayoutError, Project } from "../project";
import { ProjectIndex } from "../projectIndex";

afterEach(cleanupFixtures);

async function open(name = "series") {
	const root = copyFixture(name);
	return { root, project: await Project.open(new NodeFsBackend(root)) };
}

const stripTimes = (i: ProjectIndex) => i.all().map((e) => ({ ...e, mtimeMs: 0 })).sort((a, b) => (a.path < b.path ? -1 : 1));

describe("Project.open", () => {
	it("opens the series and empty fixtures", async () => {
		const { project } = await open();
		expect(project.exists("_story-library/series.md")).toBe(true);
		const empty = await open("empty");
		expect(empty.project.index.all()).toEqual([]);
	});

	it("refuses a pre-0.17 layout with a clear error and no writes", async () => {
		const root = copyFixture("pre-0.17");
		const before = snapshot(root);
		await expect(Project.open(new NodeFsBackend(root))).rejects.toBeInstanceOf(LegacyLayoutError);
		await expect(Project.open(new NodeFsBackend(root))).rejects.toThrow(/0\.17\.1/);
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});
});

describe("Project writes", () => {
	it("modifyFrontmatter changes only the lines of the changed key and keeps the index current", async () => {
		const { root, project } = await open();
		const file = path.join(root, "_story-library/series.md");
		const before = fs.readFileSync(file, "utf8");
		await project.modifyFrontmatter("_story-library/series.md", "---\n---\n", (fm) => {
			fm["series-title"] = "Renamed Cycle";
		});
		const after = fs.readFileSync(file, "utf8");
		expect(after).toBe(before.replace("series-title: The Lantern Cycle", "series-title: Renamed Cycle"));
		expect(project.frontmatter("_story-library/series.md")).toMatchObject({ "series-title": "Renamed Cycle", "x-unknown-note": "kept by every rewrite" });
		// the index matches a fresh scan
		const fresh = await ProjectIndex.build(new NodeFsBackend(root));
		expect(stripTimes(project.index)).toEqual(stripTimes(fresh));
	});

	it("writes nothing when the mutation changes nothing", async () => {
		const { root, project } = await open();
		const before = snapshot(root);
		await project.modifyFrontmatter("_story-library/series.md", "", (fm) => {
			fm["series-title"] = "The Lantern Cycle";
		});
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("creates a missing backstage file from its default content, then applies the mutation", async () => {
		const { root, project } = await open("empty");
		await project.modifyFrontmatter("_backstage/storyforge/codex.md", "---\nfolders:\norder:\n---\n", (fm) => {
			fm.order = ["a"];
		});
		expect(fs.readFileSync(path.join(root, "_backstage/storyforge/codex.md"), "utf8")).toBe("---\nfolders:\norder:\n  - a\n---\n");
		expect(project.frontmatter("_backstage/storyforge/codex.md")).toEqual({ folders: null, order: ["a"] });
	});

	it("creates a chapter, refuses to write or rename it, and keeps prose byte-identical", async () => {
		const { root, project } = await open();
		await project.createFile("_story-library/aaa/ch-new.md", "");
		expect(project.isFile("_story-library/aaa/ch-new.md")).toBe(true);
		const before = snapshot(root);
		await expect(project.writeText("_story-library/aaa/ch-a1.md", "x")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.writeText("Codex/Jane.md", "x")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.rename("Codex/Jane.md", "Codex/Janet.md")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.retire("_story-library/aaa/ch-a1.md")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.createFile("_export/x.json", "{}")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.createFile("_story-library/aaa/ch-a1.md", "")).rejects.toMatchObject({ code: "EEXIST" });
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("edits only the aliases key of a Codex note, leaving body and other keys byte-identical", async () => {
		const { root, project } = await open();
		const file = path.join(root, "Codex/Jane.md");
		const before = fs.readFileSync(file, "utf8");
		await project.modifyCodexNoteAliases("Codex/Jane.md", (aliases) => [...aliases, "Janey"]);
		const after = fs.readFileSync(file, "utf8");
		expect(after).toContain('  - "Jay: the first"\n  - Janey\n');
		expect(after.replace("  - Janey\n", "")).toBe(before);
		expect(project.frontmatter("Codex/Jane.md")?.aliases).toEqual(["J", "Jay: the first", "Janey"]);
		await expect(project.modifyCodexNoteAliases("_story-library/aaa/ch-a1.md", (a) => a)).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.modifyCodexNoteAliases("Codex/Nope.md", (a) => a)).rejects.toBeInstanceOf(ForbiddenWriteError);
	});

	it("keeps CRLF in a CRLF Codex note when editing aliases", async () => {
		const { root, project } = await open();
		await project.modifyCodexNoteAliases("Codex/Windows.md", () => ["Win", "Dows"]);
		const text = fs.readFileSync(path.join(root, "Codex/Windows.md"), "utf8");
		expect(text).toBe("---\r\naliases:\r\n  - Win\r\n  - Dows\r\n---\r\n\r\nA note written with Windows line endings.\r\nSecond line.\r\n");
	});

	it("adds frontmatter to a Codex note that has none (aliases only)", async () => {
		const { root, project } = await open();
		await project.modifyCodexNoteAliases("Codex/Harbour.md", () => ["The Port"]);
		expect(fs.readFileSync(path.join(root, "Codex/Harbour.md"), "utf8")).toBe("---\naliases:\n  - The Port\n---\n# The Harbour\n\nA note with no frontmatter at all.\n");
	});

	it("refuses to edit a file with unreadable frontmatter, leaving it untouched", async () => {
		const { root, project } = await open();
		const bad = "---\na: &x 1\nb: *x\n---\nbody\n";
		fs.writeFileSync(path.join(root, "_backstage/storyforge/odd.md"), bad);
		await project.index.applyChange({ type: "created", path: "_backstage/storyforge/odd.md" });
		expect(() => project.frontmatter("_backstage/storyforge/odd.md")).toThrow(UnreadableFrontmatterError);
		await expect(project.modifyFrontmatter("_backstage/storyforge/odd.md", "", (fm) => (fm.x = 1))).rejects.toBeInstanceOf(UnreadableFrontmatterError);
		expect(fs.readFileSync(path.join(root, "_backstage/storyforge/odd.md"), "utf8")).toBe(bad);
	});

	it("renames backstage files and retires them to .trash, updating the index", async () => {
		const { root, project } = await open();
		await project.rename("_backstage/storyforge/aaa/chapters/ch-a1.md", "_backstage/storyforge/aaa/chapters/ch-z.md");
		expect(project.exists("_backstage/storyforge/aaa/chapters/ch-a1.md")).toBe(false);
		expect(project.exists("_backstage/storyforge/aaa/chapters/ch-z.md")).toBe(true);
		const moved = await project.retire("_backstage/storyforge/aaa/chapters/ch-z.md");
		expect(moved).toBe(".trash/_backstage/storyforge/aaa/chapters/ch-z.md");
		expect(fs.existsSync(path.join(root, moved))).toBe(true);
		expect(project.exists("_backstage/storyforge/aaa/chapters/ch-z.md")).toBe(false);
	});

	it("updateText creates, updates and skips", async () => {
		const { root, project } = await open();
		await project.updateText("_backstage/storyforge/aaa/wordcount.md", (cur) => (cur ?? "") + "# touched\n");
		expect(fs.readFileSync(path.join(root, "_backstage/storyforge/aaa/wordcount.md"), "utf8").endsWith("# touched\n")).toBe(true);
		await project.updateText("_backstage/storyforge/new/file.md", (cur) => (cur === null ? "fresh\n" : null));
		expect(fs.readFileSync(path.join(root, "_backstage/storyforge/new/file.md"), "utf8")).toBe("fresh\n");
		const before = snapshot(root);
		await project.updateText("_backstage/storyforge/new/file.md", () => null);
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
	});
});
