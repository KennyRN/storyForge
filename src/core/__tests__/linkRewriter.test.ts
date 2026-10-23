import { describe, expect, it } from "vitest";
import { memoryProject } from "../../../test/helpers/memoryProject";
import { sha256Text } from "../hash";
import { NotACodexNoteError, UnlinkableNameError, planCodexRename } from "../linkRewriter";

const CH = "_story-library/aaa/ch1.md";

async function plan(files: Record<string, string | null>, newName = "Janet", note = "Codex/Jane.md") {
	const m = await memoryProject({ "Codex/Jane.md": "---\naliases: [J]\n---\nJane's page.\n", ...files });
	return { ...m, plan: await planCodexRename(m.project, note, newName) };
}
const spansOf = (p: Awaited<ReturnType<typeof plan>>["plan"], file: string) => p.files.find((f) => f.path === file)?.spans ?? [];

describe("planCodexRename: the link forms", () => {
	it("recognises every form in the brief and keeps display text, headings, block references and embed markers", async () => {
		const body = [
			"[[Jane]] [[Jane|Her]] [[Jane#Early life]] [[Jane#^abc123]] [[Jane#Early life|Her]] [[Jane#^abc|Blk]]",
			"![[Jane]] ![[Jane|200]] ![[Jane#Early life]] ![[Jane#^abc]]",
			"[[Codex/Jane]] [[Codex/Jane.md]] [[Codex/Jane.md|x]] [[Codex/Jane#h|y]] ![[Codex/Jane]]",
			"[a](Codex/Jane.md) [b](Codex/Jane.md#Early%20life) [c](<Codex/Jane.md>) [d](Codex/Jane.md \"T\") ![e](Codex/Jane.md)",
		].join("\n");
		const { plan: p } = await plan({ [CH]: body });
		expect(p.unchanged).toBe(false);
		expect(p.newPath).toBe("Codex/Janet.md");
		const spans = spansOf(p, CH);
		expect(spans).toHaveLength(6 + 4 + 5 + 5);
		// every span replaces just the name: apply them and look at the result
		let out = body;
		for (const s of [...spans].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.new + out.slice(s.end);
		expect(out).toBe(
			[
				"[[Janet]] [[Janet|Her]] [[Janet#Early life]] [[Janet#^abc123]] [[Janet#Early life|Her]] [[Janet#^abc|Blk]]",
				"![[Janet]] ![[Janet|200]] ![[Janet#Early life]] ![[Janet#^abc]]",
				"[[Codex/Janet]] [[Codex/Janet.md]] [[Codex/Janet.md|x]] [[Codex/Janet#h|y]] ![[Codex/Janet]]",
				"[a](Codex/Janet.md) [b](Codex/Janet.md#Early%20life) [c](<Codex/Janet.md>) [d](Codex/Janet.md \"T\") ![e](Codex/Janet.md)",
			].join("\n"),
		);
		expect(p.files[0].hash).toBe(sha256Text(body));
		expect(p.totalLinks).toBe(20);
	});

	it("encodes spaces in markdown links and keeps them literal inside angle brackets", async () => {
		const body = "[a](Codex/Jane.md) [b](<Codex/Jane.md>) [c](Codex/Jane)";
		const { plan: p } = await plan({ [CH]: body }, "Janet Smith (II)");
		const out = apply(body, spansOf(p, CH));
		expect(out).toBe("[a](Codex/Janet%20Smith%20%28II%29.md) [b](<Codex/Janet Smith (II).md>) [c](Codex/Janet%20Smith%20%28II%29)");
	});

	it("matches the old name written with encoded spaces, relative paths, other capitalisation and Unicode forms", async () => {
		const m = await memoryProject({ "Codex/Jane Doe.md": "x", "notes/n.md": "[a](Codex/Jane%20Doe.md) [b](../Codex/Jane%20Doe.md) [[jane doe]] [[CODEX/jane doe.MD]] [c](./nothing.md)" });
		const p = await planCodexRename(m.project, "Codex/Jane Doe.md", "Janet");
		expect(spansOf(p, "notes/n.md")).toHaveLength(4);
		const cafe = await memoryProject({ "Codex/Café.md": "x", "notes/n.md": "[[Café]] [[Café]]" });
		const p2 = await planCodexRename(cafe.project, "Codex/Café.md", "Bar");
		expect(spansOf(p2, "notes/n.md")).toHaveLength(2);
	});

	it("rewrites links inside frontmatter values, planned as frontmatter spans with their key path", async () => {
		const { plan: p } = await plan({ "notes/n.md": '---\nrelated: "[[Jane]]"\nlinks:\n  - "[[Codex/Jane.md|J]]"\n  - plain\nnested:\n  who: "see [[Jane]] and [[Sam]]"\n---\nBody [[Jane]]\n' });
		const spans = spansOf(p, "notes/n.md");
		expect(spans.map((s) => [s.region, s.keyPath])).toEqual([
			["frontmatter", ["related"]], ["frontmatter", ["links", 0]], ["frontmatter", ["nested", "who"]], ["body", undefined],
		]);
		expect(spans[2]).toMatchObject({ old: "Jane", new: "Janet", start: 6, end: 10 });
	});

	it("includes the note's own file, chapters (archived too), notes and novel files", async () => {
		const { plan: p } = await plan({
			"Codex/Jane.md": "Self: [[Jane]]",
			[CH]: "[[Jane]]",
			"_story-library/novel-aaa.md": "---\nx: 1\n---\nSynopsis [[Jane]]",
			"notes/archive/old.md": "[[Jane]]",
			"Codex/Sam.md": "[[Jane]] [[Sam]]",
		});
		expect(p.files.map((f) => f.path)).toEqual(["Codex/Jane.md", "Codex/Sam.md", "_story-library/aaa/ch1.md", "_story-library/novel-aaa.md", "notes/archive/old.md"].sort());
	});
});

describe("planCodexRename: which links count", () => {
	it("a bare link with two same-named notes in the project is ambiguous: left, and listed", async () => {
		const { plan: p } = await plan({ "notes/Jane.md": "x", [CH]: "A [[Jane]] and a [[Codex/Jane]] and [a](Codex/Jane.md)" });
		expect(spansOf(p, CH).map((s) => s.form)).toEqual(["wikilink", "markdown"]);
		expect(p.ambiguous).toEqual([{ path: CH, text: "[[Jane]]", region: "body", start: 2, end: 10, otherFiles: ["notes/Jane.md"] }]);
	});

	it("a same-named file in another folder or with other capitalisation also makes a bare link ambiguous", async () => {
		const { plan: p } = await plan({ "elsewhere/JANE.md": "x", [CH]: "[[Jane]]" });
		expect(p.files).toEqual([]);
		expect(p.ambiguous).toHaveLength(1);
		expect(p.ambiguous[0].otherFiles).toEqual(["elsewhere/JANE.md"]);
	});

	it("an iCloud placeholder with the same name also makes a bare link ambiguous", async () => {
		const { plan: p } = await plan({ "notes/.Jane.md.icloud": "stub", [CH]: "[[Jane]]" });
		expect(p.ambiguous).toHaveLength(1);
		expect(p.notDownloaded).toEqual(["notes/Jane.md"]);
	});

	it("links in code blocks, inline code and comments are untouched", async () => {
		const body = "```\n[[Jane]]\n```\n`[[Jane]]` %% [[Jane]] %%\n~~~\n[[Codex/Jane]]\n~~~\nreal [[Jane]]";
		const { plan: p } = await plan({ [CH]: body });
		expect(spansOf(p, CH)).toHaveLength(1);
		expect(body.slice(spansOf(p, CH)[0].start - 2, spansOf(p, CH)[0].end + 2)).toBe("[[Jane]]");
		expect(spansOf(p, CH)[0].start).toBe(body.lastIndexOf("[[Jane]]") + 2);
	});

	it("links to other notes, external URLs and headings-only are ignored", async () => {
		const { plan: p } = await plan({ [CH]: "[[Sam]] [[#Heading]] [x](https://example.com/Codex/Jane.md) [y](Codex/Sam.md) [[Janet]] [[Jane2]]" });
		expect(p.files).toEqual([]);
		expect(p.totalLinks).toBe(0);
	});

	it("counts links in other markdown files outside storyForge's folders, read-only", async () => {
		const { plan: p } = await plan({ "elsewhere/readme.md": "[[Codex/Jane]] [[Codex/Jane.md]]", "other/x.md": "[a](Codex/Jane.md)", "_backstage/storyforge/x.md": "[[Codex/Jane]]", [CH]: "[[Jane]]" });
		expect(p.outside).toEqual({ linkCount: 3, files: [{ path: "elsewhere/readme.md", count: 2 }, { path: "other/x.md", count: 1 }] });
		expect(p.files.map((f) => f.path)).toEqual([CH]);
	});

	it("reports files it couldn't read and placeholders in storyForge's folders", async () => {
		const m = await memoryProject({ "Codex/Jane.md": "x", [CH]: "[[Jane]]", "_story-library/aaa/.ch2.md.icloud": "stub" });
		const orig = m.backend.readText.bind(m.backend);
		m.backend.readText = async (p: string) => {
			if (p === CH) throw new Error("EIO");
			return orig(p);
		};
		const p = await planCodexRename(m.project, "Codex/Jane.md", "Janet");
		expect(p.unreadable).toEqual([{ path: CH, reason: "EIO" }]);
		expect(p.notDownloaded).toEqual(["_story-library/aaa/ch2.md"]);
	});

	it("flags a file whose frontmatter can't be read but holds links", async () => {
		const { plan: p } = await plan({ "notes/n.md": "---\nrel: &a [[Jane]]\nagain: *a\n---\nBody [[Jane]]" });
		expect(p.frontmatterSkipped).toEqual(["notes/n.md"]);
		expect(spansOf(p, "notes/n.md").map((s) => s.region)).toEqual(["body"]);
	});
});

describe("planCodexRename: the name", () => {
	it("goes through the existing sanitising and uniqueness rules", async () => {
		const { plan: p } = await plan({ "Codex/Janet.md": "x" }, "  Jan/et?  ");
		expect(p.newPath).toBe("Codex/Janet 2.md");
		expect(p.newName).toBe("Janet 2");
	});
	it("a blank, unchanged or self-resolving name is a no-op plan", async () => {
		for (const name of ["", "  ", "Jane", "Jane.md", "Jane?"]) expect((await plan({}, name)).plan.unchanged, name).toBe(true);
	});
	it("a case-only rename is a real rename", async () => {
		const { plan: p } = await plan({ [CH]: "[[Jane]]" }, "JANE");
		expect(p.unchanged).toBe(false);
		expect(p.newPath).toBe("Codex/JANE.md");
	});
	it("refuses a name links can't carry, and names that aren't Codex notes", async () => {
		const m = await memoryProject({ "Codex/Jane.md": "x", "notes/n.md": "x" });
		await expect(planCodexRename(m.project, "Codex/Jane.md", "Janet #2")).rejects.toBeInstanceOf(UnlinkableNameError);
		await expect(planCodexRename(m.project, "Codex/Jane.md", "A [[B]]")).rejects.toBeInstanceOf(UnlinkableNameError);
		await expect(planCodexRename(m.project, "notes/n.md", "X")).rejects.toBeInstanceOf(NotACodexNoteError);
		await expect(planCodexRename(m.project, "Codex/Nobody.md", "X")).rejects.toBeInstanceOf(NotACodexNoteError);
	});
	it("reads only: planning writes nothing", async () => {
		const { backend } = await plan({ [CH]: "[[Jane]]" });
		expect(backend.writes).toEqual([]);
	});
});

function apply(text: string, spans: { start: number; end: number; new: string }[]): string {
	let out = text;
	for (const s of [...spans].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.new + out.slice(s.end);
	return out;
}
