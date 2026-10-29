import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../../test/helpers/memoryProject";
import { buildNameIndex } from "../names";
import { collectNameSources, isUsableName } from "../nameSources";
import { typeWith } from "./simulate";

describe("where the names come from", () => {
	it("every Codex title, the aliases of each note, and the project's word list", async () => {
		const { project } = await memoryProject({
			"Codex/Ælfric.md": fmFile({ aliases: ["Aelfric the Fair", "Ælf"] }),
			"Codex/Jane.md": "No frontmatter.\n",
			"Codex/Zoë Åberg — 日本語.md": "A title with a dash and kanji.\n",
			"Codex/Retired.md": fmFile({ aliases: "Old Retired" }),
			"Codex/notes.txt": "not a note",
			"notes/Elsewhere.md": "not Codex",
		});
		const sources = collectNameSources(project, ["Hrothgar", "[bad]"]);
		const spellings = sources.map((s) => s.spelling).sort();
		expect(spellings).toEqual(["Aelfric the Fair", "Hrothgar", "Jane", "Old Retired", "Retired", "Ælf", "Ælfric"].sort());
		expect(sources.find((s) => s.spelling === "Ælf")).toMatchObject({ title: false, origin: "Codex/Ælfric.md" });
		expect(sources.find((s) => s.spelling === "Hrothgar")).toMatchObject({ title: true, origin: "word list" });
	});

	it("a note whose frontmatter can't be read still gives its title, never its aliases", async () => {
		const { project } = await memoryProject({ "Codex/Odd.md": "---\naliases: &a [x]\nmore: *a\n---\nbody\n" });
		expect(collectNameSources(project, []).map((s) => s.spelling)).toEqual(["Odd"]);
	});

	it("an empty or missing Codex gives only the word list", async () => {
		const { project } = await memoryProject({});
		expect(collectNameSources(project, ["Sam"]).map((s) => s.spelling)).toEqual(["Sam"]);
	});

	it("names with punctuation or symbols inside a word are left out", () => {
		for (const ok of ["Jane", "Mary-Anne", "O'Neil", "Zoë Åberg", "Red Blossom", "Ælfric", "Thorn 2"]) expect(isUsableName(ok), ok).toBe(true);
		for (const bad of ["Jay: the first", "a — b", "[x]", "日本語 — 3", "Dr. Who"]) expect(isUsableName(bad), bad).toBe(false);
		expect(isUsableName("Jay: the first")).toBe(false);
		expect(isUsableName("Zoë Åberg — 日本語")).toBe(false);
	});

	it("feeds the corrector: an alias, a title and a word-list name all work", async () => {
		const { project } = await memoryProject({ "Codex/Ælfric.md": fmFile({ aliases: ["Ælf"] }), "Codex/Jane.md": "x\n" });
		const names = buildNameIndex(collectNameSources(project, ["Hrothgar"]));
		expect(typeWith("aelfric aelf jane hrothgar ", { names }).doc).toBe("Ælfric Ælf Jane Hrothgar ");
	});
});
