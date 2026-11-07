import { describe, expect, it } from "vitest";
import { classifyLinkTarget, codexLinkMarkdown, encodeLinkPath, relativeLinkPath, suggestCodexEntries, type CodexLinkEntry, type LinkWorld } from "../codexLinks";
import { scanLinks } from "../linkScan";

const NOTE = "Codex/Jane Harbour.md";

describe("the relative path, from each file that can hold a link", () => {
	it("from a chapter, a Codex note, the novel file (synopsis and plot notes) and series.md", () => {
		expect(relativeLinkPath("_story-library/aaa/ch-a1.md", NOTE)).toBe("../../Codex/Jane Harbour.md");
		expect(relativeLinkPath("Codex/Sam.md", NOTE)).toBe("Jane Harbour.md");
		expect(relativeLinkPath("_story-library/novel-aaa.md", NOTE)).toBe("../Codex/Jane Harbour.md");
		expect(relativeLinkPath("_story-library/series.md", NOTE)).toBe("../Codex/Jane Harbour.md");
		expect(relativeLinkPath("notes/idea.md", NOTE)).toBe("../Codex/Jane Harbour.md");
		expect(relativeLinkPath("notes/archive/old.md", NOTE)).toBe("../../Codex/Jane Harbour.md");
	});
	it("spaces and the other characters a link can't carry are percent-encoded; the slashes are not", () => {
		expect(encodeLinkPath("../../Codex/Jane Harbour.md")).toBe("../../Codex/Jane%20Harbour.md");
		expect(encodeLinkPath("Codex/A (b) #1? 100%.md")).toBe("Codex/A%20%28b%29%20%231%3F%20100%25.md");
	});
	it("the whole link: the name as its text, brackets in a name escaped", () => {
		expect(codexLinkMarkdown("_story-library/aaa/ch-a1.md", NOTE, "Jane Harbour")).toBe("[Jane Harbour](../../Codex/Jane%20Harbour.md)");
		expect(codexLinkMarkdown("Codex/Sam.md", NOTE, "Jane Harbour")).toBe("[Jane Harbour](Jane%20Harbour.md)");
	});
	it("what it writes is a link the scanner reads back, with the same target (so the rewriter will find it)", () => {
		const md = codexLinkMarkdown("_story-library/aaa/ch-a1.md", NOTE, "Jane Harbour");
		const [l] = scanLinks(md);
		expect(decodeURIComponent(l.target)).toBe("../../Codex/Jane Harbour.md");
		expect(md.slice(l.textStart, l.textEnd)).toBe("Jane Harbour");
	});
});

const E = (name: string, aliases: string[] = [], archived = false): CodexLinkEntry => ({ path: `Codex/${name}.md`, name, aliases, archived });
const ENTRIES = [E("Jane", ["J"]), E("Sam", ["Sammy"]), E("Harbour"), E("Zoë Åberg — 日本語"), E("Retired", [], true), E("Janet Smith", ["Jan"])];

describe("the [[ suggestions", () => {
	const names = (q: string) => suggestCodexEntries(ENTRIES, q).map((s) => [s.entry.name, s.text]);
	it("offers every entry that isn't archived, of any type, when nothing is typed", () => {
		expect(suggestCodexEntries(ENTRIES, "").map((s) => s.entry.name)).toEqual(["Harbour", "Jane", "Janet Smith", "Sam", "Zoë Åberg — 日本語"]);
	});
	it("matches the start of a name first, accents and case ignored", () => {
		expect(names("ja")).toEqual([["Jane", "Jane"], ["Janet Smith", "Janet Smith"]]);
		expect(names("zoe")).toEqual([["Zoë Åberg — 日本語", "Zoë Åberg — 日本語"]]);
	});
	it("matches an alias, and the alias becomes the link's text", () => {
		expect(names("sammy")).toEqual([["Sam", "Sammy"]]);
		expect(suggestCodexEntries(ENTRIES, "sammy")[0].alias).toBe("Sammy");
		expect(names("jan")).toEqual([["Jane", "Jane"], ["Janet Smith", "Janet Smith"]]); // a name wins over an alias of another entry
	});
	it("a name, then an alias, that merely contain the query come after the ones that start with it", () => {
		expect(names("ar")).toEqual([["Harbour", "Harbour"]]);
	});
	it("never offers an archived entry", () => {
		expect(names("ret")).toEqual([]);
	});
	it("at most eight", () => {
		const many = Array.from({ length: 20 }, (_, i) => E(`Name ${i}`));
		expect(suggestCodexEntries(many, "name")).toHaveLength(8);
	});
});

describe("what a link's target is (live or muted, and the tooltip)", () => {
	const files = new Set(["Codex/Jane.md", "Codex/Retired.md", "_story-library/aaa/ch-a1.md", "notes/idea.md", "Codex/Jane Harbour.md"]);
	const world: LinkWorld = { file: (p) => [...files].find((f) => f.toLowerCase() === p.toLowerCase()) ?? null, isArchived: (p) => p === "Codex/Retired.md" };
	const from = "_story-library/aaa/ch-a2.md";
	const kind = (t: string, f = from) => classifyLinkTarget(f, t, world);
	it("a Codex note is live, archived or not", () => {
		expect(kind("../../Codex/Jane.md")).toEqual({ kind: "codex", path: "Codex/Jane.md", archived: false });
		expect(kind("../../Codex/Jane%20Harbour.md#x")).toEqual({ kind: "codex", path: "Codex/Jane Harbour.md", archived: false });
		expect(kind("../../Codex/Retired.md")).toEqual({ kind: "codex", path: "Codex/Retired.md", archived: true });
		expect(kind("Jane.md", "Codex/Sam.md")).toEqual({ kind: "codex", path: "Codex/Jane.md", archived: false });
		expect(kind("<../../Codex/Jane.md>")).toEqual({ kind: "codex", path: "Codex/Jane.md", archived: false });
	});
	it("a chapter, another note, nothing, and the web are muted", () => {
		expect(kind("ch-a1.md")).toEqual({ kind: "chapter" });
		expect(kind("../../notes/idea.md")).toEqual({ kind: "note" });
		expect(kind("../../Codex/Nobody.md")).toEqual({ kind: "missing" });
		expect(kind("../../../../outside.md")).toEqual({ kind: "missing" });
		expect(kind("https://example.com/Codex/Jane.md")).toEqual({ kind: "web" });
		expect(kind("#heading")).toEqual({ kind: "missing" });
	});
	it("a link broken by a move outside the app is muted, truthfully", () => {
		expect(kind("../Codex/Jane.md")).toEqual({ kind: "missing" }); // one level too shallow from a chapter
	});
});
