import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { readChapterPlot, writeChapterPlot } from "../book";
import { commitPlotNote } from "../fieldWriter";
import { LIBRARY_ROOT, bookFilePath } from "../paths";

const BOOK = "BookA";
const NOVEL = bookFilePath(BOOK);
const entry = { "chapter-id": "c1", "chapter-title": "One" };

function make(plot?: string) {
	return memoryProject({
		[`${LIBRARY_ROOT}/${BOOK}`]: null,
		[NOVEL]: fmFile({ chapters: { "ch1.md": plot === undefined ? entry : { ...entry, plot } } }),
	});
}

describe("plot notes", () => {
	const awkward = [
		"line one\nline two\n\nline four",
		'she said "no": then left',
		"# not a heading\n- not a list",
		"  leading spaces survive\n    and so do these",
		"emoji 🌿 and 'quotes' and: colons",
		"ends with a colon:",
	];
	for (const text of awkward) {
		it(`round-trips ${JSON.stringify(text)}`, async () => {
			const { project } = await make();
			await writeChapterPlot(project, BOOK, "ch1.md", text);
			expect(await readChapterPlot(project, BOOK, "ch1.md")).toBe(text);
		});
	}

	it("trims only the end, and clears the key for an empty or whitespace-only note", async () => {
		const { project, fm } = await make("old");
		await writeChapterPlot(project, BOOK, "ch1.md", "  kept  \n\n");
		expect(await readChapterPlot(project, BOOK, "ch1.md")).toBe("  kept");
		await writeChapterPlot(project, BOOK, "ch1.md", " \n ");
		expect((fm(NOVEL).chapters as Record<string, Record<string, unknown>>)["ch1.md"].plot).toBeUndefined();
	});

	it("writes nothing when the note is unchanged", async () => {
		const { project, backend } = await make("same");
		const before = backend.files.get(NOVEL);
		expect(await commitPlotNote(project, BOOK, "ch1.md", "same", "same\n")).toEqual({ status: "unchanged" });
		expect(backend.files.get(NOVEL)).toEqual(before);
	});

	it("writes when the disk still holds what the field saw", async () => {
		const { project } = await make("old");
		expect((await commitPlotNote(project, BOOK, "ch1.md", "old", "new")).status).toBe("written");
		expect(await readChapterPlot(project, BOOK, "ch1.md")).toBe("new");
	});

	it("on a conflict leaves the file byte-identical and puts the author's text in a recovery file", async () => {
		const { project, backend } = await make("changed elsewhere");
		const before = backend.files.get(NOVEL);
		const result = await commitPlotNote(project, BOOK, "ch1.md", "what the field saw", "the author's words");
		expect(result.status).toBe("conflict");
		if (result.status !== "conflict") return;
		expect(result.current).toBe("changed elsewhere");
		expect(backend.files.get(NOVEL)).toEqual(before);
		expect(result.recovery.ok).toBe(true);
		if (!result.recovery.ok) return;
		expect(result.recovery.path).toMatch(new RegExp(`^_sf-backup/recovery/${BOOK}/ch1 \\(plot note\\) .*\\.md$`));
		const saved = backend.files.get(result.recovery.path);
		expect(typeof saved === "string" ? saved : new TextDecoder().decode(saved as Uint8Array)).toBe("the author's words");
	});
});
