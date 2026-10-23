import { describe, expect, it } from "vitest";
import * as book from "../../src/core/book";
import * as chapterCreation from "../../src/core/chapterCreation";
import * as chapterSidecar from "../../src/core/chapterSidecar";
import * as codex from "../../src/core/codex";
import * as history from "../../src/core/history";
import * as reconciliation from "../../src/core/reconciliation";
import * as series from "../../src/core/series";
import * as storyDetailsSidecar from "../../src/core/storyDetailsSidecar";
import * as tagRegistry from "../../src/core/tagRegistry";
import { OPS } from "./ops";

/** Async data-layer functions that only read. */
const READ_ONLY = new Set([
	"readBookSynopsis",
	"readChapterPlot",
	"readSeriesDescription",
	"readChapterWordCount",
	"getChapterDaily",
	"getProjectWordStats",
	"uniqueCodexFilename",
	"readChapterFingerprint",
]);
/** Covered by name under a different spelling in ops.ts. */
const ALIASES: Record<string, string> = {
	handleChapterRename: "reconcileRename",
	handleChapterCrossBookMove: "reconcileRename",
	handleChapterDelete: "reconcileDelete",
	handleBookFolderRename: "reconcileRename",
	handleCodexNoteRename: "reconcileRename",
	getBookWordStats: "getBookWordStats",
};

describe("the disk-safety suite covers every mutating data-layer function", () => {
	const modules: Record<string, Record<string, unknown>> = {
		book, chapterCreation, chapterSidecar, codex, history, reconciliation, series, storyDetailsSidecar, tagRegistry,
	};
	const names = OPS.map((o) => o.name).join("\n");
	for (const [moduleName, mod] of Object.entries(modules)) {
		for (const [fnName, fn] of Object.entries(mod)) {
			if (typeof fn !== "function" || fn.constructor.name !== "AsyncFunction" || READ_ONLY.has(fnName)) continue;
			it(`${moduleName}.${fnName}`, () => {
				const needle = ALIASES[fnName] ?? fnName;
				expect(names.includes(needle), `no operation in test/diskSafety/ops.ts exercises ${moduleName}.${fnName}`).toBe(true);
			});
		}
	}
});
