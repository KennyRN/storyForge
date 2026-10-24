import { summaryIsEmpty, type ReconcileSummary } from "../../core/reconciler";
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
	if (summaryIsEmpty(s)) return;

	const section = (title: string, rows: (HTMLElement | string)[]): HTMLElement | null => (rows.length ? el("section", { class: "sf-summary-section", attrs: { "aria-label": title } }, el("h3", { class: "sf-summary-title", text: title }), el("ul", { class: "sf-summary-list" }, ...rows.map((r) => el("li", {}, r)))) : null);

	const pruned = s.pruned.map((p) => el("span", { class: "sf-summary-row" }, el("span", { text: `${name(p.path)}: it is gone from the folder; its text was kept at ${p.recoveryPath}` }), button({ label: "Reveal", kind: "quiet", onClick: () => void model.reveal(p.recoveryPath) })));
	const body = el(
		"div",
		{ class: "sf-summary" },
		el("p", { class: "sf-muted", text: "storyForge found changes made while it was closed." }),
		section("Matched", s.matched.map((m) => `${m.from} is now ${m.to}`)),
		section("Pruned", pruned),
		section("Could not tell which file", s.ambiguous.map((a) => `${a.path} could be ${a.candidates.map(name).join(" or ")}. Nothing was changed.`)),
		section("Added", s.added),
		section("Left as they were", s.gated.map((g) => `${g.area.replace(/^book:/, "").replace(/^codex$/, "Codex")}: ${GATE_WORDS[g.reason] ?? g.reason}`)),
		section("Not looked at", s.skipped.map((k) => `${k.path}: ${k.reason}`)),
	);
	openDialog({ title: "Changes found when opening", body, buttons: [{ label: "OK", kind: "primary" }] });
}
