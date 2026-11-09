import { summaryIsEmpty, type ReconcileSummary } from "../../core/reconciler";
import { unusableOnWindows, type UnusableName } from "../../core/windowsNames";
import { targetNameOf, tidyHappened } from "../../core/tempTidy";
import { button } from "../kit/button";
import { openDialog } from "../kit/dialog";
import { el } from "../kit/dom";
import type { AppModel } from "../model";

const unusableRow = (u: UnusableName): string => `${u.path}: ${u.reason}. It stays as it is; a copy of this project on Windows would not have it.`;
const name = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

const GATE_WORDS: Record<string, string> = {
	"novel-exists": "its novel file already exists",
	"folder-missing": "its chapter folder is missing",
	"folder-empty": "its chapter folder is empty",
	"not-downloaded": "some files are still in iCloud",
	unreadable: "its details can't be read",
	"codex-missing": "the Codex folder is missing",
};

/**
 * Shown after opening a project, and only if something happened: files matched to where they moved, pruned
 * (with their recovery files), ambiguous, added, or held back. A quiet open shows nothing at all.
 */
export function maybeShowReconciliation(model: AppModel): void {
	const running = model.running;
	if (!running) return;
	const s: ReconcileSummary = running.opened.reconciliation;
	const tidy = running.opened.leftovers;
	// Names already in the project that Windows couldn't hold: listed, never renamed (Brief 22, ruling 2). Shown when the
	// list changes (the first time, and again only when new names appear); Settings can show it at any time.
	const unusable = unusableOnWindows(running.opened.project.index);
	const told = new Set(model.nav.windowsNamesSeen);
	const newNames = unusable.some((u) => !told.has(u.path));
	if (summaryIsEmpty(s) && !tidyHappened(tidy) && !newNames) return;
	const showUnusable = newNames ? unusable : [];
	if (newNames || model.nav.windowsNamesSeen.length !== unusable.length) {
		model.nav.windowsNamesSeen = unusable.map((u) => u.path);
		model.touch("nav");
	}

	const section = (title: string, rows: (HTMLElement | string)[]): HTMLElement | null => (rows.length ? el("section", { class: "sf-summary-section", attrs: { "aria-label": title } }, el("h3", { class: "sf-summary-title", text: title }), el("ul", { class: "sf-summary-list" }, ...rows.map((r) => el("li", {}, r)))) : null);

	// Leftover temporary files (docs/temp-tidy.md): anything that may hold unsaved words first and plainly; an earlier
	// version quietly. Modification times decide only the wording; everything that differs was kept.
	const leftoverName = (path: string): string => targetNameOf(name(path));
	const row = (r: (typeof tidy.recovered)[number], text: string, muted = false): HTMLElement => el("span", { class: muted ? "sf-summary-row sf-muted" : "sf-summary-row" }, el("span", { text }), button({ label: "Reveal", kind: "quiet", onClick: () => void model.reveal(r.recoveryPath) }));
	const proseKinds = new Set(["chapter", "codex", "recovery-file"]);
	const newerOnes = tidy.recovered.filter((r) => r.newer);
	const unsaved = newerOnes.filter((r) => proseKinds.has(r.kind)).map((r) => row(r, `${leftoverName(r.leftover)}: a save didn't finish, and what was being saved is newer than the file beside it, so it may hold words that were never saved. It was kept at ${r.recoveryPath}.`));
	const unsavedOther = newerOnes.filter((r) => !proseKinds.has(r.kind)).map((r) => row(r, `${leftoverName(r.leftover)}: a save didn't finish, and what was being saved is newer than the file beside it, so it may hold changes that were never saved. It was kept at ${r.recoveryPath}.`));
	const earlier = tidy.recovered.filter((r) => !r.newer).map((r) => row(r, `${leftoverName(r.leftover)}: an earlier version was kept at ${r.recoveryPath}.`, true));
	const tidied = tidy.removed.length ? [`${tidy.removed.length} leftover temporary ${tidy.removed.length === 1 ? "file was" : "files were"} removed. Nothing in ${tidy.removed.length === 1 ? "it" : "them"} was unique.`] : [];
	const stayed = tidy.left.map((l) => `${name(l.path)}: ${l.reason}.`);
	const readOnlyFound = tidy.foundReadOnly.length ? [`${tidy.foundReadOnly.length} leftover temporary ${tidy.foundReadOnly.length === 1 ? "file was" : "files were"} found, but this project is read-only, so nothing was moved or removed.`] : [];
	const pruned = s.pruned.map((p) => el("span", { class: "sf-summary-row" }, el("span", { text: `${name(p.path)}: it is gone from the folder; its text was kept at ${p.recoveryPath}` }), button({ label: "Reveal", kind: "quiet", onClick: () => void model.reveal(p.recoveryPath) })));
	const body = el(
		"div",
		{ class: "sf-summary" },
		el("p", { class: "sf-muted", text: summaryIsEmpty(s) && !tidyHappened(tidy) ? "Nothing was changed. These names are only listed." : summaryIsEmpty(s) ? "storyForge tidied up after a save that was interrupted." : "storyForge found changes made while it was closed." }),
		section("Words that may not have been saved", unsaved),
		section("Other files that may not have been saved", unsavedOther),
		section("Earlier versions kept", earlier),
		section("Matched", s.matched.map((m) => `${m.from} is now ${m.to}${m.referenceFiles ? ` (PoV and location lists in ${m.referenceFiles} novel ${m.referenceFiles === 1 ? "file" : "files"} followed it)` : ""}`)),
		section("Pruned", pruned),
		section("Could not tell which file", s.ambiguous.map((a) => `${a.path} could be ${a.candidates.map(name).join(" or ")}. Nothing was changed.`)),
		section("Added", s.added),
		section("Left as they were", s.gated.map((g) => `${g.area.replace(/^book:/, "").replace(/^codex$/, "Codex")}: ${GATE_WORDS[g.reason] ?? g.reason}`)),
		section("Not looked at", s.skipped.map((k) => `${k.path}: ${k.reason}`)),
		section("Tidied", [...tidied, ...readOnlyFound]),
		section("Left where they are", stayed),
		section("Can't be used on Windows", showUnusable.map(unusableRow)),
	);
	openDialog({ title: "Changes found when opening", body, buttons: [{ label: "OK", kind: "primary" }] });
}

/** Settings ▸ General ▸ "Names Windows can't use": the same list, whenever the author wants it (Brief 22). */
export function openWindowsNames(model: AppModel): void {
	const running = model.running;
	if (!running) return;
	const unusable = unusableOnWindows(running.opened.project.index);
	const body = el(
		"div",
		{ class: "sf-summary" },
		el("p", { class: "sf-muted", text: unusable.length ? "These files and folders already in this project have names Windows can't hold. They stay exactly as they are; a copy of the project on Windows would not have them." : "Every name in this project can be used on Windows." }),
		el("ul", { class: "sf-summary-list" }, ...unusable.map((u) => el("li", {}, unusableRow(u)))),
	);
	openDialog({ key: "windows-names", title: "Names Windows can't use", body, buttons: [{ label: "OK", kind: "primary" }] });
}
