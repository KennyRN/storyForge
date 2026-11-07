import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../src/backends/node-fs";
import { ProjectIndex } from "../../src/core/projectIndex";
import { addCaseCollision, addNfdName, cleanupFixtures, copyFixture, fsIsCaseInsensitive, snapshot } from "../helpers/fixtures";

afterEach(cleanupFixtures);

describe("fixtures", () => {
	it("the series fixture indexes cleanly", async () => {
		const root = copyFixture("series");
		const index = await ProjectIndex.build(new NodeFsBackend(root));
		expect(index.unreadable()).toEqual([]);
		expect(index.collisions()).toEqual([]);
		expect(index.exists(".obsidian")).toBe(false);
		expect(index.frontmatter("_story-library/series.md")).toMatchObject({ "series-title": "The Lantern Cycle", order: ["aaa", "bbb"] });
		const novel = index.frontmatter("_story-library/novel-aaa.md") as Record<string, unknown>;
		expect(novel["chapter-order"]).toEqual(["ch-a1.md", "ch-a2.md", "ch-a5.md"]);
		expect(Object.keys(novel.chapters as object)).toEqual(["ch-a1.md", "ch-a2.md", "ch-a3.md", "ch-a4.md", "ch-a5.md"]);
		expect(index.frontmatter("Codex/Harbour.md")).toBeNull(); // no frontmatter
		expect(index.frontmatter("Codex/Windows.md")).toEqual({ aliases: ["Win"] });
		expect(index.frontmatter("Codex/Zoë Åberg — 日本語.md".normalize("NFC"))).toEqual({ aliases: ["Zoe"] });
		expect(index.get("elsewhere/readme.md")?.frontmatterState).toBeUndefined(); // outside storyForge's folders: not read
		expect(index.get("_story-library/ccc")?.kind).toBe("folder");
		expect(index.wordCount("_story-library/aaa/ch-a2.md")).toBe(10); // <!--comment--> stripped
	});

	it("the empty fixture has no visible entries", async () => {
		const index = await ProjectIndex.build(new NodeFsBackend(copyFixture("empty")));
		expect(index.all()).toEqual([]);
	});

	it("the pre-0.17 fixture holds only legacy roots", async () => {
		const index = await ProjectIndex.build(new NodeFsBackend(copyFixture("pre-0.17")));
		expect(index.exists("_sf-storylibrary")).toBe(true);
		expect(index.exists("_story-library")).toBe(false);
	});

	it("a copied fixture is byte-identical to the original and independent of it", () => {
		const a = copyFixture("series");
		const b = copyFixture("series");
		expect(snapshot(a)).toEqual(snapshot(b));
	});

	it("adds case collisions and NFD names to a temp copy when the file system allows", async () => {
		const root = copyFixture("series");
		const added = addCaseCollision(root);
		expect(added).toBe(!fsIsCaseInsensitive());
		const nfd = addNfdName(root);
		const index = await ProjectIndex.build(new NodeFsBackend(root));
		expect(index.exists(`Codex/${nfd}`)).toBe(true);
		expect(index.exists("Codex/Café Noir.md")).toBe(true); // NFC lookup finds it either way
		if (added) expect(index.collisions().length).toBe(1);
	});
});
