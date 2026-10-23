import { describe, expect, it } from "vitest";
import { MemoryBackend } from "../../../test/helpers/memoryBackend";
import { UnreadableFrontmatterError } from "../frontmatter";
import { sha256Text } from "../hash";
import { ProjectIndex } from "../projectIndex";

const NOVEL = '---\nbook-id-reference: "b1"\nchapter-order:\n  - a.md\n---\nBody words here.\n';

function project() {
	return new MemoryBackend({
		"_story-library/series.md": "---\nseries-title: S\n---\n",
		"_story-library/novel-ABC.md": NOVEL,
		"_story-library/ABC/a.md": "one two three four\n",
		"Codex/Jane.md": "---\naliases:\n  - J\n---\nShe walks.\n",
		"_backstage/storyforge/codex.md": "---\ntypes: {}\n---\n",
		"notes/n.md": "note note\n",
		"elsewhere/readme.md": "---\nx: 1\n---\nnot read\n",
		"elsewhere/pic.png": new Uint8Array([1, 2, 3]),
		".obsidian/app.json": "{}",
		".git/HEAD": "ref",
	});
}

describe("sha256Text", () => {
	it("matches known vectors", () => {
		expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
		expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
		expect(sha256Text("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
	});
});

describe("ProjectIndex.build", () => {
	it("scans everything, skipping hidden folders", async () => {
		const index = await ProjectIndex.build(project());
		const paths = index.all().map((e) => e.path).sort();
		expect(paths).toContain("_story-library/ABC/a.md");
		expect(paths).toContain("elsewhere/pic.png");
		expect(paths.some((p) => p.startsWith(".obsidian") || p.startsWith(".git"))).toBe(false);
		expect(index.get("_story-library")?.kind).toBe("folder");
	});

	it("reads, hashes and counts only inside storyForge's own folders", async () => {
		const backend = project();
		const index = await ProjectIndex.build(backend);
		expect(backend.reads).not.toContain("elsewhere/readme.md");
		expect(backend.reads).not.toContain("elsewhere/pic.png");
		expect(index.get("elsewhere/readme.md")?.frontmatterState).toBeUndefined();
		expect(index.frontmatter("elsewhere/readme.md")).toBeNull();
		expect(index.get("elsewhere/pic.png")?.size).toBe(3);
		expect(backend.reads.sort()).toEqual(
			[
				"Codex/Jane.md",
				"_backstage/storyforge/codex.md",
				"_story-library/ABC/a.md",
				"_story-library/novel-ABC.md",
				"_story-library/series.md",
				"notes/n.md",
			].sort(),
		);
	});

	it("serves frontmatter, word counts and hashes synchronously", async () => {
		const index = await ProjectIndex.build(project());
		expect(index.frontmatter("_story-library/novel-ABC.md")).toEqual({ "book-id-reference": "b1", "chapter-order": ["a.md"] });
		expect(index.frontmatter("Codex/Jane.md")).toEqual({ aliases: ["J"] });
		expect(index.frontmatter("_story-library/ABC/a.md")).toBeNull();
		expect(index.wordCount("_story-library/novel-ABC.md")).toBe(3); // body only
		expect(index.wordCount("_story-library/ABC/a.md")).toBe(4);
		expect(index.hash("_story-library/ABC/a.md")).toBe(sha256Text("one two three four\n"));
	});

	it("lists folders sorted by name, case-insensitively", async () => {
		const b = new MemoryBackend({ "Codex/b.md": "x", "Codex/A.md": "x", "Codex/c.md": "x" });
		const index = await ProjectIndex.build(b);
		expect(index.list("Codex").map((e) => e.path)).toEqual(["Codex/A.md", "Codex/b.md", "Codex/c.md"]);
		expect(index.list("").map((e) => e.path)).toEqual(["Codex"]);
		expect(index.list("nope")).toEqual([]);
	});
});

describe("path rules", () => {
	it("looks up case-insensitively and reports the on-disk spelling", async () => {
		const index = await ProjectIndex.build(project());
		expect(index.get("codex/JANE.md")?.path).toBe("Codex/Jane.md");
		expect(index.exists("_STORY-LIBRARY/Series.MD")).toBe(true);
		expect(index.list("CODEX").map((e) => e.path)).toEqual(["Codex/Jane.md"]);
	});

	it("looks up Unicode-normalised names (NFC query, NFD on disk and the reverse)", async () => {
		const nfd = "Café.md"; // e + combining acute
		const nfc = "Café.md";
		const index = await ProjectIndex.build(new MemoryBackend({ [`Codex/${nfd}`]: "x" }));
		expect(index.get(`Codex/${nfc}`)?.path).toBe(`Codex/${nfd}`);
		const index2 = await ProjectIndex.build(new MemoryBackend({ [`Codex/${nfc}`]: "x" }));
		expect(index2.get(`Codex/${nfd}`)?.path).toBe(`Codex/${nfc}`);
	});

	it("tolerates ./, // and backslashes in queries; refuses escapes", async () => {
		const index = await ProjectIndex.build(project());
		expect(index.exists("./Codex//Jane.md")).toBe(true);
		expect(index.exists("Codex\\Jane.md")).toBe(true);
		expect(index.exists("../Codex/Jane.md")).toBe(false);
		expect(index.exists("/Codex/Jane.md")).toBe(false);
	});

	it("indexes and reports colliding entries, never merging them", async () => {
		const index = await ProjectIndex.build(new MemoryBackend({ "Codex/Jane.md": "a", "Codex/jane.md": "b" }));
		expect(index.collisions()).toEqual([{ key: "codex/jane.md", paths: ["Codex/Jane.md", "Codex/jane.md"] }]);
		expect(index.list("Codex")).toHaveLength(2);
		expect(index.get("Codex/Jane.md")?.collision).toBe(true);
		expect(index.get("Codex/jane.md")?.path).toBe("Codex/jane.md"); // exact spelling wins
		expect(index.get("CODEX/JANE.MD")).toBeDefined();
	});
});

describe("unreadable frontmatter", () => {
	it("is marked, reported, and throws on read — never treated as empty", async () => {
		const b = new MemoryBackend({ "_story-library/novel-X.md": "---\na: &x 1\nb: *x\n---\nbody\n" });
		const index = await ProjectIndex.build(b);
		expect(index.get("_story-library/novel-X.md")?.frontmatterState).toBe("unreadable");
		expect(index.unreadable().map((e) => e.path)).toEqual(["_story-library/novel-X.md"]);
		expect(() => index.frontmatter("_story-library/novel-X.md")).toThrow(UnreadableFrontmatterError);
		expect(index.wordCount("_story-library/novel-X.md")).toBe(1);
	});
});

describe("write-through and external changes", () => {
	it("matches a fresh scan after writes", async () => {
		const backend = project();
		const index = await ProjectIndex.build(backend);
		const text = "---\nid: z\n---\nfresh words now\n";
		await backend.writeText("_story-library/ABC/b.md", text);
		index.setFile("_story-library/ABC/b.md", { size: text.length, mtimeMs: 2, text });
		const fresh = await ProjectIndex.build(backend);
		const strip = (i: ProjectIndex) =>
			i.all().map((e) => ({ ...e, mtimeMs: 0 })).sort((a, b) => (a.path < b.path ? -1 : 1));
		expect(strip(index)).toEqual(strip(fresh));
		expect(index.wordCount("_story-library/ABC/b.md")).toBe(3);
	});

	it("creates missing parent folders in the index", async () => {
		const index = await ProjectIndex.build(new MemoryBackend());
		index.setFile("_story-library/NEW/ch.md", { size: 0, mtimeMs: 1, text: "" });
		expect(index.get("_story-library")?.kind).toBe("folder");
		expect(index.get("_story-library/NEW")?.kind).toBe("folder");
		expect(index.list("_story-library/NEW").map((e) => e.path)).toEqual(["_story-library/NEW/ch.md"]);
	});

	it("moves and removes whole subtrees", async () => {
		const index = await ProjectIndex.build(project());
		index.moveEntry("_story-library/ABC", "_story-library/XYZ");
		expect(index.exists("_story-library/ABC/a.md")).toBe(false);
		expect(index.wordCount("_story-library/XYZ/a.md")).toBe(4);
		index.removeEntry("_story-library/XYZ");
		expect(index.exists("_story-library/XYZ")).toBe(false);
		expect(index.exists("_story-library/XYZ/a.md")).toBe(false);
	});

	it("applies external created / modified / deleted / renamed changes from the backend", async () => {
		const backend = project();
		const index = await ProjectIndex.build(backend);

		backend.setFile("Codex/New.md", "---\naliases: [N]\n---\nhello\n");
		await index.applyChange({ type: "created", path: "Codex/New.md" });
		expect(index.frontmatter("Codex/New.md")).toEqual({ aliases: ["N"] });

		backend.setFile("Codex/New.md", "---\naliases: [M]\n---\nhello there\n");
		await index.applyChange({ type: "modified", path: "Codex/New.md" });
		expect(index.frontmatter("Codex/New.md")).toEqual({ aliases: ["M"] });
		expect(index.wordCount("Codex/New.md")).toBe(2);

		await backend.rename("Codex/New.md", "Codex/Renamed.md");
		await index.applyChange({ type: "renamed", from: "Codex/New.md", to: "Codex/Renamed.md" });
		expect(index.exists("Codex/New.md")).toBe(false);
		expect(index.exists("Codex/Renamed.md")).toBe(true);

		await backend.rename("_story-library/ABC", "_story-library/DEF");
		await index.applyChange({ type: "renamed", from: "_story-library/ABC", to: "_story-library/DEF" });
		expect(index.wordCount("_story-library/DEF/a.md")).toBe(4);
		expect(index.exists("_story-library/ABC")).toBe(false);

		backend.files.delete("Codex/Renamed.md");
		await index.applyChange({ type: "deleted", path: "Codex/Renamed.md" });
		expect(index.exists("Codex/Renamed.md")).toBe(false);
	});

	it("ignores hidden paths in external changes", async () => {
		const backend = project();
		const index = await ProjectIndex.build(backend);
		backend.setFile(".obsidian/new.json", "{}");
		await index.applyChange({ type: "created", path: ".obsidian/new.json" });
		expect(index.exists(".obsidian/new.json")).toBe(false);
	});
});
