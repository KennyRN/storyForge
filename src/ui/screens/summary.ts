import { summaryIsEmpty, type ReconcileSummary } from "../../core/reconciler";
import { targetNameOf, tidyHappened } from "../../core/tempTidy";
import { button } from "../kit/button";
import { openDialog } from "../kit/dialog";
import { el } from "../kit/dom";
import type { AppModel } from "../model";

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
	if (summaryIsEmpty(s) && !tidyHappened(tidy)) return;

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
		el("p", { class: "sf-muted", text: summaryIsEmpty(s) ? "storyForge tidied up after a save that was interrupted." : "storyForge found changes made while it was closed." }),
		section("Words that may not have been saved", unsaved),
		section("Other files that may not have been saved", unsavedOther),
		section("Earlier versions kept", earlier),
		section("Matched", s.matched.map((m) => `${m.from} is now ${m.to}`)),
		section("Pruned", pruned),
		section("Could not tell which file", s.ambiguous.map((a) => `${a.path} could be ${a.candidates.map(name).join(" or ")}. Nothing was changed.`)),
		section("Added", s.added),
		section("Left as they were", s.gated.map((g) => `${g.area.replace(/^book:/, "").replace(/^codex$/, "Codex")}: ${GATE_WORDS[g.reason] ?? g.reason}`)),
		section("Not looked at", s.skipped.map((k) => `${k.path}: ${k.reason}`)),
		section("Tidied", [...tidied, ...readOnlyFound]),
		section("Left where they are", stayed),
	);
	openDialog({ title: "Changes found when opening", body, buttons: [{ label: "OK", kind: "primary" }] });
}
