/** Every mutating data-layer operation, with exactly what it may change on the `series` fixture. */
import * as fs from "node:fs";
import { expect } from "vitest";
import * as path from "node:path";
import type { OpSpec, Ctx } from "../helpers/diskSafety";
import {
	archiveChapter, createBook, createChapter, ensureAllChapterEntries, insertChapterEntry, removeChapterEntry, readBookFrontmatter, renameBookTitle, renameChapterEntry, renameChapterTitle,
	rekeyCodexNoteReferences, reorderSeriesBooks, syncAllBookReferenceFields, unarchiveChapter,
	upsertChapterEntry, writeBookArchiveOrder, writeBookChapterOrder, writeBookUnplacedOrder, writeBookCoverImage, writeBookPlannedChapterLength,
	writeBookPlannedNovelLength, writeBookSynopsis, writeChapterColor, writeChapterLocation, writeChapterPlot, writeChapterPlotThread,
	writeChapterPov, writeChapterTags, writeDefaultPov, writeDialogueQuotes, writeNovelTags,
} from "../../src/core/book";
import { createContinuingChapter } from "../../src/core/chapterCreation";
import { deleteChapterSidecar, renameChapterSidecar, updateChapterFingerprint } from "../../src/core/chapterSidecar";
import {
	addCodexNoteAlias, archiveCodexItem, convertCodexNoteToFolder, createCodexFolder, createCodexNote, ensureVirtualFolder, moveCodexItem,
	rekeyCodexNotePath, removeCodexFolder, renameCodexFolder,
	reorderArchivedCodexItems, setCodexEntryType, unarchiveCodexItem,
} from "../../src/core/codex";
import {
	getBookWordStats, recomputeBookCurrent, recomputeBookTotal, recordChapterArchive, recordChapterEdit, recordChapterUnarchive,
} from "../../src/core/history";
import {
	reconcileDelete, reconcileRename,
} from "../../src/core/reconciliation";
import {
	ensureAllSeriesBookEntries, ensureSeriesFile, renameSeriesBookEntry, upsertSeriesBookEntry, writeSeriesBookColor, writeSeriesBookTitle,
	writeSeriesCoverImage, writeSeriesDescription, writeSeriesOrder, writeSeriesTitle, writeUnplacedOrder,
} from "../../src/core/series";
import { renameStoryDetailsSidecar, deleteStoryDetailsSidecar } from "../../src/core/storyDetailsSidecar";
import { ensureTagRegistryFile } from "../../src/core/tagRegistry";

const S = "_story-library/series.md";
const N = "_story-library/novel-aaa.md";
const NB = "_story-library/novel-bbb.md";
const CODEX = "_backstage/storyforge/codex.md";
const WC = "_backstage/storyforge/aaa/wordcount.md";
const SIDE = "_backstage/storyforge/aaa/chapters/ch-a1.md";
const DETAILS = "_backstage/storyforge/aaa/story-details/ch-a1.md";
const fm = (...touched: string[][]) => ({ format: "frontmatter" as const, touched });
const yaml = (...touched: string[][]) => ({ format: "yaml" as const, touched });

/** Moves something "outside the app", then tells the index (as the file watcher will). */
async function externalRename(ctx: Ctx, from: string, to: string): Promise<void> {
	fs.mkdirSync(path.dirname(ctx.abs(to)), { recursive: true });
	fs.renameSync(ctx.abs(from), ctx.abs(to));
	await ctx.project.index.applyChange({ type: "renamed", from, to });
}
async function externalDelete(ctx: Ctx, file: string): Promise<void> {
	fs.rmSync(ctx.abs(file), { recursive: true });
	await ctx.project.index.applyChange({ type: "deleted", path: file });
}
const JANE = { path: "Codex/Jane.md", name: "Jane" };
const SAM = { path: "Codex/Sam.md", name: "Sam" };

export const OPS: OpSpec[] = [
	// ------------------------------------------------------------------------------- series.md
	{ name: "writeSeriesTitle", run: (c) => writeSeriesTitle(c.project, "New Title"), changed: { [S]: fm(["series-title"]) } },
	{ name: "writeSeriesOrder", run: (c) => writeSeriesOrder(c.project, ["bbb", "aaa"]), changed: { [S]: fm(["order"]) } },
	{ name: "writeSeriesOrder (unchanged writes nothing)", run: (c) => writeSeriesOrder(c.project, ["aaa", "bbb"]) },
	{ name: "writeUnplacedOrder (unchanged writes nothing)", run: (c) => writeUnplacedOrder(c.project, ["ccc"]) },
	{ name: "writeUnplacedOrder", run: (c) => writeUnplacedOrder(c.project, []), changed: { [S]: fm(["unplaced-order"]) } },
	{
		name: "upsertSeriesBookEntry",
		run: (c) => upsertSeriesBookEntry(c.project, "ddd", "b-ddd4", "Fourth Book"),
		changed: { [S]: fm(["books", "ddd"]) },
	},
	{
		name: "upsertSeriesBookEntry (append to order)",
		run: (c) => upsertSeriesBookEntry(c.project, "ddd", "b-ddd4", "Fourth Book", { appendToOrder: true }),
		changed: { [S]: fm(["books", "ddd"], ["order"]) },
	},
	{
		name: "writeSeriesBookTitle",
		run: (c) => writeSeriesBookTitle(c.project, "aaa", "Renamed Book"),
		changed: { [S]: fm(["books", "aaa", "book-title"]) },
	},
	{ name: "writeSeriesBookColor (set)", run: (c) => writeSeriesBookColor(c.project, "bbb", "#112233"), changed: { [S]: fm(["books", "bbb", "book-color"]) } },
	{ name: "writeSeriesBookColor (clear)", run: (c) => writeSeriesBookColor(c.project, "aaa", null), changed: { [S]: fm(["books", "aaa", "book-color"]) } },
	{
		name: "renameSeriesBookEntry",
		run: (c) => renameSeriesBookEntry(c.project, "ccc", "ccd"),
		changed: { [S]: fm(["books", "ccc"], ["books", "ccd"], ["unplaced-order"]) },
	},
	{ name: "ensureAllSeriesBookEntries (nothing missing)", run: (c) => ensureAllSeriesBookEntries(c.project) },
	{
		name: "ensureAllSeriesBookEntries (a new folder)",
		run: async (c) => {
			await c.project.createFolder("_story-library/ddd");
			await ensureAllSeriesBookEntries(c.project);
		},
		changed: { [S]: fm(["books", "ddd"]) },
	},
	{ name: "ensureSeriesFile (exists)", run: (c) => ensureSeriesFile(c.project) },
	{
		name: "writeSeriesDescription (body only)",
		run: (c) => writeSeriesDescription(c.project, "A new description."),
		changed: { [S]: { format: "text", frontmatterSame: true } },
	},
	{
		name: "writeSeriesCoverImage",
		run: (c) => writeSeriesCoverImage(c.project, new Uint8Array([1, 2, 3]).buffer, "png"),
		changed: { [S]: fm(["cover-image"]) },
		added: ["_backstage/storyforge/_series/cover.png", ".trash/_backstage/storyforge/_series/cover.jpg"],
		removed: ["_backstage/storyforge/_series/cover.jpg"],
	},

	// ------------------------------------------------------------------------ novel-<code>.md
	{ name: "writeBookChapterOrder", run: (c) => writeBookChapterOrder(c.project, "aaa", ["ch-a2.md", "ch-a1.md", "ch-a5.md"]), changed: { [N]: fm(["chapter-order"]) } },
	{ name: "writeBookUnplacedOrder", run: (c) => writeBookUnplacedOrder(c.project, "aaa", ["ch-a3.md", "ch-a9.md"]), changed: { [N]: fm(["unplaced"]) } },
	{ name: "writeBookUnplacedOrder (unchanged)", run: (c) => writeBookUnplacedOrder(c.project, "aaa", ["ch-a3.md"]) },
	{ name: "writeBookChapterOrder (unchanged)", run: (c) => writeBookChapterOrder(c.project, "aaa", ["ch-a1.md", "ch-a2.md", "ch-a5.md"]) },
	{ name: "writeBookPlannedNovelLength", run: (c) => writeBookPlannedNovelLength(c.project, "aaa", 90000), changed: { [N]: fm(["planned-novel-length"]) } },
	{ name: "writeBookPlannedNovelLength (clear)", run: (c) => writeBookPlannedNovelLength(c.project, "aaa", null), changed: { [N]: fm(["planned-novel-length"]) } },
	{ name: "writeBookPlannedChapterLength", run: (c) => writeBookPlannedChapterLength(c.project, "aaa", 3000), changed: { [N]: fm(["planned-chapter-length"]) } },
	{
		name: "writeBookCoverImage",
		run: (c) => writeBookCoverImage(c.project, "aaa", new Uint8Array([9, 9]).buffer, "jpg"),
		changed: { [N]: fm(["cover-image"]) },
		added: ["_backstage/storyforge/aaa/cover.jpg", ".trash/_backstage/storyforge/aaa/cover.png"],
		removed: ["_backstage/storyforge/aaa/cover.png"],
	},
	{ name: "archiveChapter", run: (c) => archiveChapter(c.project, "aaa", "ch-a1.md"), changed: { [N]: fm(["chapter-order"], ["unplaced"], ["archive"]) } },
	{ name: "unarchiveChapter", run: (c) => unarchiveChapter(c.project, "aaa", "ch-a4.md"), changed: { [N]: fm(["chapter-order"], ["unplaced"], ["archive"]) } },
	{ name: "writeBookArchiveOrder (unchanged)", run: (c) => writeBookArchiveOrder(c.project, "aaa", ["ch-a4.md"]) },
	{ name: "syncAllBookReferenceFields (already in sync)", run: (c) => syncAllBookReferenceFields(c.project) },
	{
		name: "renameBookTitle",
		run: (c) => renameBookTitle(c.project, "aaa", "Brand New Title"),
		changed: { [S]: fm(["books", "aaa", "book-title"]), [N]: fm(["book-title-reference"]) },
	},
	{
		name: "reorderSeriesBooks",
		run: (c) => reorderSeriesBooks(c.project, ["bbb", "aaa"]),
		changed: { [S]: fm(["order"]), [N]: fm(["series-order-reference"]), [NB]: fm(["series-order-reference"]) },
	},
	{
		name: "upsertChapterEntry (new)",
		run: (c) => upsertChapterEntry(c.project, "aaa", "ch-a6.md", "c-a6zz", "Six"),
		changed: { [N]: fm(["chapters", "ch-a6.md"]) },
	},
	{
		name: "renameChapterTitle",
		run: (c) => renameChapterTitle(c.project, "aaa", "ch-a1.md", "A New Title"),
		changed: { [N]: fm(["chapters", "ch-a1.md", "chapter-title"]) },
	},
	{ name: "writeDialogueQuotes", run: (c) => writeDialogueQuotes(c.project, "aaa", "double"), changed: { [N]: fm(["dialogue-quotes"]) } },
	{
		name: "writeDefaultPov",
		run: (c) => writeDefaultPov(c.project, "aaa", "Codex/Sam.md", "Sam"),
		changed: { [N]: fm(["default-pov-path"], ["default-pov-name"]) },
	},
	{
		name: "writeChapterPov (replaces a v1 scalar)",
		run: (c) => writeChapterPov(c.project, "aaa", "ch-a1.md", [JANE, SAM]),
		changed: { [N]: fm(["chapters", "ch-a1.md", "pov"]) },
	},
	{
		name: "writeChapterPov (drops legacy pov-path/pov-name)",
		run: (c) => writeChapterPov(c.project, "aaa", "ch-a2.md", [SAM]),
		changed: { [N]: fm(["chapters", "ch-a2.md", "pov"], ["chapters", "ch-a2.md", "pov-path"], ["chapters", "ch-a2.md", "pov-name"]) },
	},
	{
		name: "writeChapterLocation",
		run: (c) => writeChapterLocation(c.project, "aaa", "ch-a1.md", [{ path: "Codex/Harbour.md", name: "Harbour" }, SAM]),
		changed: { [N]: fm(["chapters", "ch-a1.md", "location"]) },
	},
	{ name: "writeChapterTags", run: (c) => writeChapterTags(c.project, "aaa", "ch-a1.md", ["draft", "final"]), changed: { [N]: fm(["chapters", "ch-a1.md", "tags"]) } },
	{
		name: "writeChapterPlotThread",
		run: (c) => writeChapterPlotThread(c.project, "aaa", "ch-a1.md", "romance"),
		changed: { [N]: fm(["chapters", "ch-a1.md", "plot-thread"], ["chapters", "ch-a1.md", "chapter-color"]) },
	},
	{ name: "writeChapterColor", run: (c) => writeChapterColor(c.project, "aaa", "ch-a1.md", "#112233"), changed: { [N]: fm(["chapters", "ch-a1.md", "chapter-color"]) } },
	{ name: "writeNovelTags", run: (c) => writeNovelTags(c.project, "aaa", ["drafting", "stalled"]), changed: { [N]: fm(["novel-tags"]) } },
	{
		name: "writeChapterPlot",
		run: (c) => writeChapterPlot(c.project, "aaa", "ch-a1.md", "A different plot."),
		changed: { [N]: fm(["chapters", "ch-a1.md", "plot"]) },
	},
	{
		name: "writeBookSynopsis (body only)",
		run: (c) => writeBookSynopsis(c.project, "aaa", "A synopsis."),
		changed: { [N]: { format: "text", frontmatterSame: true } },
	},
	{
		name: "rekeyCodexNoteReferences (a person)",
		run: (c) => rekeyCodexNoteReferences(c.project, "Codex/Jane.md", "Codex/Janet.md"),
		changed: {
			[N]: fm(["default-pov-path"], ["default-pov-name"], ["chapters", "ch-a1.md", "pov"], ["chapters", "ch-a2.md", "pov"], ["chapters", "ch-a2.md", "pov-path"], ["chapters", "ch-a2.md", "pov-name"]),
		},
	},
	{
		name: "rekeyCodexNoteReferences (a place)",
		run: (c) => rekeyCodexNoteReferences(c.project, "Codex/Harbour.md", "Codex/Port.md"),
		changed: {
			[N]: fm(["chapters", "ch-a1.md", "location"], ["chapters", "ch-a2.md", "location"], ["chapters", "ch-a2.md", "location-path"], ["chapters", "ch-a2.md", "location-name"]),
		},
	},
		{
		name: "renameChapterEntry",
		run: (c) => renameChapterEntry(c.project, "aaa", "ch-a2.md", "ch-a2x.md"),
		changed: { [N]: fm(["chapters", "ch-a2.md"], ["chapters", "ch-a2x.md"], ["chapter-order"]) },
	},
		{
		name: "removeChapterEntry",
		run: (c) => removeChapterEntry(c.project, "aaa", "ch-a3.md"),
		changed: { [N]: fm(["chapters", "ch-a3.md"], ["unplaced"], ["chapter-order"], ["archive"]) },
	},
	{
		name: "insertChapterEntry",
		run: (c) =>
			insertChapterEntry(c.project, "bbb", "ch-x.md", {
				chapterId: "c-xx", chapterTitle: "Moved in", pov: [], location: [], plot: "", tags: [], color: null, plotThreadId: null,
			}),
		changed: { [NB]: fm(["chapters", "ch-x.md"], ["unplaced"], ["archive"]) },
	},
	{ name: "ensureAllChapterEntries (all have one)", run: (c) => ensureAllChapterEntries(c.project, "aaa") },
	{
		name: "ensureAllChapterEntries (a new chapter file)",
		run: async (c) => {
			await c.project.createFile("_story-library/aaa/ch-new.md", "");
			await ensureAllChapterEntries(c.project, "aaa");
		},
		added: ["_story-library/aaa/ch-new.md"],
		changed: { [N]: fm(["chapters", "ch-new.md"]) },
	},
	{
		name: "createBook",
		run: (c) => createBook(c.project),
		added: ["_story-library/novel-ccd.md"],
		changed: { [S]: fm(["books", "ccd"]) },
	},
	{
		name: "createChapter",
		run: async (c) => {
			const made = await createChapter(c.project, "aaa");
			expect(made.path).toBe(`_story-library/aaa/${made.filename}`);
		},
		added: [/* the id is minted: asserted below */],
		changed: { [N]: fm(["chapters"]) },
		anyAdded: /^_story-library\/aaa\/[^/]+\.md$/,
	},
	{
		name: "createContinuingChapter",
		run: (c) => createContinuingChapter(c.project, "aaa", "ch-a1.md"),
		changed: { [N]: fm(["chapters"], ["chapter-order"]) },
		anyAdded: /^_story-library\/aaa\/[^/]+\.md$/,
	},

	// ------------------------------------------------------------------------------- codex.md
	{ name: "setCodexEntryType", run: (c) => setCodexEntryType(c.project, "Codex/Sam.md", "place"), changed: { [CODEX]: fm(["types", "Codex/Sam.md"]) } },
	{ name: "createCodexFolder", run: (c) => createCodexFolder(c.project, null), changed: { [CODEX]: fm(["folders"], ["order"]) } },
	{ name: "ensureVirtualFolder", run: (c) => ensureVirtualFolder(c.project, { id: "xf-test", name: "Test" }), changed: { [CODEX]: fm(["folders"], ["order"]) } },
	{
		name: "createCodexNote",
		run: (c) => createCodexNote(c.project, null, { filename: "Newbie", content: "hello\n" }),
		added: ["Codex/Newbie.md"],
		changed: { [CODEX]: fm(["order"]) },
	},
	{ name: "renameCodexFolder", run: (c) => renameCodexFolder(c.project, "f-cast", "Crew"), changed: { [CODEX]: fm(["folders", "f-cast", "name"]) } },
	{ name: "archiveCodexItem", run: (c) => archiveCodexItem(c.project, "Codex/Sam.md"), changed: { [CODEX]: fm(["folders"], ["order"], ["archive"]) } },
	{ name: "unarchiveCodexItem", run: (c) => unarchiveCodexItem(c.project, "Codex/Retired.md"), changed: { [CODEX]: fm(["order"], ["archive"]) } },
	{ name: "removeCodexFolder", run: (c) => removeCodexFolder(c.project, "f-places"), changed: { [CODEX]: fm(["folders"], ["order"]) } },
	{ name: "convertCodexNoteToFolder", run: (c) => convertCodexNoteToFolder(c.project, "Codex/Jane.md"), changed: { [CODEX]: fm(["folders"], ["order"]) } },
	{ name: "reorderArchivedCodexItems (unchanged)", run: (c) => reorderArchivedCodexItems(c.project, ["Codex/Retired.md"]) },
	{
		name: "rekeyCodexNotePath",
		run: (c) => rekeyCodexNotePath(c.project, "Codex/Sam.md", "Codex/Samuel.md"),
		changed: { [CODEX]: fm(["folders"], ["types"]) },
	},
			{ name: "moveCodexItem", run: (c) => moveCodexItem(c.project, "Codex/Sam.md", "file", "f-places", null), changed: { [CODEX]: fm(["folders"], ["order"]) } },
	{ name: "ensureTagRegistryFile (exists)", run: (c) => ensureTagRegistryFile(c.project) },

	// ------------------------------------------------- the one Codex write: aliases only
	{
		name: "addCodexNoteAlias",
		run: (c) => addCodexNoteAlias(c.project, "Codex/Jane.md", "Janey"),
		changed: { "Codex/Jane.md": { format: "frontmatter", touched: [["aliases"]] } },
	},
	{
		name: "addCodexNoteAlias (CRLF note)",
		run: (c) => addCodexNoteAlias(c.project, "Codex/Windows.md", "Dows"),
		changed: { "Codex/Windows.md": { format: "frontmatter", touched: [["aliases"]] } },
	},
	{
		name: "addCodexNoteAlias (note with no frontmatter)",
		run: (c) => addCodexNoteAlias(c.project, "Codex/Harbour.md", "The Port"),
		changed: { "Codex/Harbour.md": { format: "frontmatter", touched: [["aliases"]] } },
	},
	{
		name: "addCodexNoteAlias (no trailing newline)",
		run: (c) => addCodexNoteAlias(c.project, "Codex/NoNewline.md", "Nope"),
		changed: { "Codex/NoNewline.md": { format: "frontmatter", touched: [["aliases"]] } },
	},
	{ name: "addCodexNoteAlias (duplicate writes nothing)", run: (c) => addCodexNoteAlias(c.project, "Codex/Jane.md", "j") },

	// -------------------------------------------------------------------------------- sidecars
	{ name: "updateChapterFingerprint (existing sidecar)", run: (c) => updateChapterFingerprint(c.project, "aaa", "ch-a1.md", { opening: "NEW OPEN", closing: "NEW CLOSE" }), changed: { [SIDE]: { format: "text", frontmatterSame: true } } },
	{
		name: "updateChapterFingerprint (new sidecar)",
		run: (c) => updateChapterFingerprint(c.project, "aaa", "ch-a2.md", { opening: "o", closing: "c" }),
		added: ["_backstage/storyforge/aaa/chapters/ch-a2.md"],
	},
	{
		name: "renameChapterSidecar",
		run: (c) => renameChapterSidecar(c.project, "aaa", "ch-a1.md", "ch-a1x.md"),
		removed: [SIDE],
		added: ["_backstage/storyforge/aaa/chapters/ch-a1x.md"],
	},
	{
		name: "deleteChapterSidecar (retired to .trash)",
		run: (c) => deleteChapterSidecar(c.project, "aaa", "ch-a1.md"),
		removed: [SIDE],
		added: [`.trash/${SIDE}`],
	},
	{
		name: "renameStoryDetailsSidecar",
		run: (c) => renameStoryDetailsSidecar(c.project, "aaa", "ch-a1.md", "ch-a1x.md"),
		removed: [DETAILS],
		added: ["_backstage/storyforge/aaa/story-details/ch-a1x.md"],
	},
	{
		name: "deleteStoryDetailsSidecar (retired to .trash)",
		run: (c) => deleteStoryDetailsSidecar(c.project, "aaa", "ch-a1.md"),
		removed: [DETAILS],
		added: [`.trash/${DETAILS}`],
	},

	// ---------------------------------------------------------------------- word-count history
	{ name: "recordChapterEdit", run: (c) => recordChapterEdit(c.project, "aaa", "ch-a1.md", 17, new Date("2026-10-22T12:00:00Z")), changed: { [WC]: yaml(["current"], ["lifetimeWritten"], ["chapters"], ["daily", "2026-10-22"]) } },
	{ name: "recordChapterArchive", run: (c) => recordChapterArchive(c.project, "aaa", "ch-a4.md", 3, new Date("2026-10-22T12:00:00Z")), changed: { [WC]: yaml(["current"], ["lifetimeRemoved"], ["chapters"]) } },
	{ name: "recordChapterUnarchive", run: (c) => recordChapterUnarchive(c.project, "aaa", "ch-a4.md", new Date("2026-10-22T12:00:00Z")), changed: { [WC]: yaml(["current"], ["lifetimeRemoved"], ["chapters"]) } },
	{ name: "recomputeBookCurrent", run: (c) => recomputeBookCurrent(c.project, "aaa"), changed: { [WC]: yaml(["current"], ["chapters"]) } },
	{ name: "recomputeBookTotal", run: (c) => recomputeBookTotal(c.project, "aaa"), changed: { [WC]: yaml(["current"], ["chapters"]) } },
	{
		name: "recordChapterEdit (first edit of a book creates its history file)",
		run: (c) => recordChapterEdit(c.project, "bbb", "ch-b1.md", 16, new Date("2026-10-22T12:00:00Z")),
		added: ["_backstage/storyforge/bbb/wordcount.md"],
	},
	{ name: "getBookWordStats (a read)", run: (c) => getBookWordStats(c.project, "aaa") },

	// ---------------------------------------------------------- reconciliation of external changes
	{
		name: "reconcileRename: a chapter renamed in a file manager",
		setup: (c) => externalRename(c, "_story-library/aaa/ch-a2.md", "_story-library/aaa/ch-a2x.md"),
		run: (c) => reconcileRename(c.project, "_story-library/aaa/ch-a2.md", "_story-library/aaa/ch-a2x.md", false),
		changed: { [N]: fm(["chapter-order"], ["chapters", "ch-a2.md"], ["chapters", "ch-a2x.md"]) },
	},
	{
		name: "reconcileRename: a chapter with sidecars renamed in a file manager",
		setup: (c) => externalRename(c, "_story-library/aaa/ch-a1.md", "_story-library/aaa/ch-a1x.md"),
		run: (c) => reconcileRename(c.project, "_story-library/aaa/ch-a1.md", "_story-library/aaa/ch-a1x.md", false),
		changed: { [N]: fm(["chapter-order"], ["chapters", "ch-a1.md"], ["chapters", "ch-a1x.md"]) },
		removed: [SIDE, DETAILS],
		added: ["_backstage/storyforge/aaa/chapters/ch-a1x.md", "_backstage/storyforge/aaa/story-details/ch-a1x.md"],
	},
	{
		name: "reconcileRename: a chapter moved to another book",
		setup: (c) => externalRename(c, "_story-library/aaa/ch-a2.md", "_story-library/bbb/ch-a2.md"),
		run: (c) => reconcileRename(c.project, "_story-library/aaa/ch-a2.md", "_story-library/bbb/ch-a2.md", false),
		changed: { [N]: fm(["chapters", "ch-a2.md"], ["chapter-order"], ["unplaced"], ["archive"]), [NB]: fm(["chapters", "ch-a2.md"], ["unplaced"], ["archive"]) },
	},
	{
		name: "reconcileRename: a book folder renamed in a file manager",
		setup: (c) => externalRename(c, "_story-library/ccc", "_story-library/ccd"),
		run: (c) => reconcileRename(c.project, "_story-library/ccc", "_story-library/ccd", true),
		changed: { [S]: fm(["books", "ccc"], ["books", "ccd"], ["unplaced-order"]) },
	},
	{
		name: "reconcileRename: a book folder with backstage renamed in a file manager",
		setup: (c) => externalRename(c, "_story-library/aaa", "_story-library/aab"),
		run: (c) => reconcileRename(c.project, "_story-library/aaa", "_story-library/aab", true),
		changed: { [S]: fm(["books", "aaa"], ["books", "aab"], ["order"]) },
		removed: [
			"_backstage/storyforge/aaa/wordcount.md", SIDE, DETAILS, "_backstage/storyforge/aaa/story-details/attribution.md", "_backstage/storyforge/aaa/cover.png",
		],
		added: [
			"_backstage/storyforge/aab/wordcount.md", "_backstage/storyforge/aab/chapters/ch-a1.md", "_backstage/storyforge/aab/story-details/ch-a1.md",
			"_backstage/storyforge/aab/story-details/attribution.md", "_backstage/storyforge/aab/cover.png",
		],
	},
	{
		name: "reconcileRename: a Codex note renamed in a file manager",
		setup: (c) => externalRename(c, "Codex/Sam.md", "Codex/Samuel.md"),
		run: (c) => reconcileRename(c.project, "Codex/Sam.md", "Codex/Samuel.md", false),
		changed: { [CODEX]: fm(["folders"], ["types"]) },
	},
	{
		name: "reconcileDelete: a chapter deleted in a file manager",
		setup: (c) => externalDelete(c, "_story-library/aaa/ch-a1.md"),
		run: (c) => reconcileDelete(c.project, "_story-library/aaa/ch-a1.md"),
		changed: { [N]: fm(["chapters", "ch-a1.md"], ["chapter-order"], ["unplaced"], ["archive"]) },
		removed: [SIDE, DETAILS],
		added: [`.trash/${SIDE}`, `.trash/${DETAILS}`],
	},
	{
		name: "reconcileDelete: a Codex note deleted in a file manager",
		setup: (c) => externalDelete(c, "Codex/Jane.md"),
		run: (c) => reconcileDelete(c.project, "Codex/Jane.md"),
		// The references to it are left as they are, to show as missing (decision 42).
		changed: { [CODEX]: fm(["folders"], ["types"]) },
	},
	{
		name: "reconcileDelete: a Codex note deleted outside, its references left",
		setup: (c) => externalDelete(c, "Codex/Harbour.md"),
		run: (c) => reconcileDelete(c.project, "Codex/Harbour.md"),
		changed: { [CODEX]: fm(["folders"], ["types"]) },
	},

	// ---------------------------------------------------------------- operations that must be refused
	{ name: "refused: writing a chapter", run: (c) => c.project.writeText("_story-library/aaa/ch-a1.md", "x"), throws: /prose is never written|chapter/ },
	{ name: "refused: writing a Codex note body", run: (c) => c.project.writeText("Codex/Jane.md", "x"), throws: /Codex/ },
	{ name: "refused: editing a chapter's frontmatter", run: (c) => c.project.modifyFrontmatter("_story-library/aaa/ch-a1.md", "", (fm) => (fm.x = 1)), throws: /chapter/ },
	{ name: "refused: editing a Codex note's other keys", run: (c) => c.project.modifyFrontmatter("Codex/Jane.md", "", (fm) => (fm.type = "x")), throws: /aliases/ },
	{ name: "refused: creating over an existing chapter", run: (c) => c.project.createFile("_story-library/aaa/ch-a1.md", ""), throws: /exists/ },
	{ name: "refused: renaming a chapter through the handle", run: (c) => c.project.rename("_story-library/aaa/ch-a1.md", "_story-library/aaa/ch-z.md"), throws: true },
	{ name: "refused: retiring a Codex note", run: (c) => c.project.retire("Codex/Jane.md"), throws: true },
	{ name: "refused: writing into _export/", run: (c) => c.project.writeText("_export/new.json", "{}"), throws: /_export|outside/ },
	{ name: "refused: writing into .obsidian/", run: (c) => c.project.writeText(".obsidian/app.json", "{}"), throws: true },
	{ name: "refused: a case variant of a protected folder", run: (c) => c.project.createFile("_STORY-LIBRARY/aaa/new.md", ""), throws: /variant/ },
	{ name: "refused: an escaping path", run: (c) => c.project.writeText("_backstage/storyforge/../../Codex/Jane.md", "x"), throws: true },
	{
		name: "refused: editing a file whose frontmatter is unreadable",
		setup: async (c) => {
			fs.writeFileSync(c.abs("_story-library/novel-eee.md"), "---\nbook-id-reference: &x b-eee\nalias: *x\n---\n");
			await c.project.index.applyChange({ type: "created", path: "_story-library/novel-eee.md" });
		},
		run: (c) => c.project.modifyFrontmatter("_story-library/novel-eee.md", "---\n---\n", (fm) => (fm["book-title-reference"] = "x")),
		throws: /Unreadable frontmatter/,
	},
];
