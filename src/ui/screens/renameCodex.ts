import { isReservedFileName, RESERVED_NAME_EXPLANATION } from "../../core/codex";
import type { LinkRewritePlan, LinkRewriteResult } from "../../core/linkRewriter";
import { button } from "../kit/button";
import { bringForward, openDialog, type OpenDialog } from "../kit/dialog";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";

const UNLINKABLE = /[[\]#^|]/;
export const UNLINKABLE_EXPLANATION = "A note name can't contain [ ] # ^ |, because no link can carry them.";
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1).replace(/\.md$/i, "");

/** What is wrong with a typed name, in words, or null. */
export function nameProblem(typed: string, current: string): string | null {
	const name = typed.trim().replace(/\.md$/i, "");
	if (!name) return "Type a name.";
	if (UNLINKABLE.test(name)) return UNLINKABLE_EXPLANATION;
	if (isReservedFileName(name)) return RESERVED_NAME_EXPLANATION;
	if (name === current) return "That is the note's name already.";
	return null;
}

const list = (items: string[], title: string): HTMLElement | null =>
	items.length
		? el("details", { class: "sf-plan-more" }, el("summary", { text: title }), el("ul", {}, ...items.slice(0, 50).map((t) => el("li", { text: t })), items.length > 50 ? el("li", { class: "sf-muted", text: `and ${items.length - 50} more` }) : null))
		: null;

/** The rename dialog (docs/interface.md §6.4): the name, then the plan (what will and won't change), then the result. */
export function openRenameCodex(model: AppModel, notePath: string): void {
	if (bringForward("rename")) return;
	const running = model.running;
	if (!running) return;
	if (running.readOnlyReason) return void model.notices.notify({ kind: "warning", text: "This project is open read-only, so nothing can be renamed." });
	const current = baseName(notePath);

	const input = el("input", { class: "sf-field", attrs: { type: "text", "aria-label": "New name", spellcheck: "false" } });
	input.value = current;
	const problem = el("div", { class: "sf-rename-problem", attrs: { role: "alert" } });
	const body = el("div", { class: "sf-rename" });
	let dialog: OpenDialog;

	const stepName = (): void => {
		fill(body, el("p", { text: `Rename “${current}” and update the links to it.` }), input, problem);
		const check = (): string | null => {
			const p = nameProblem(input.value, current);
			problem.textContent = input.value.trim() === current || !input.value.trim() ? "" : (p ?? "");
			return p;
		};
		input.oninput = () => dialog.setButtons(nameButtons(check()));
		dialog.setButtons(nameButtons(check()));
		input.focus();
		input.select();
	};
	const nameButtons = (p: string | null) => [{ label: "Cancel", kind: "quiet" as const }, { label: "Next", kind: "primary" as const, disabled: p !== null, onClick: () => (void showPlan(), false) }];
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && nameProblem(input.value, current) === null) void showPlan();
	});

	const showPlan = async (): Promise<void> => {
		let plan: LinkRewritePlan;
		try {
			plan = await running.opened.renameNote.plan(notePath, input.value);
		} catch (e) {
			problem.textContent = (e as Error).message;
			return;
		}
		if (plan.unchanged) {
			problem.textContent = "That name resolves to the note's own, so there is nothing to change.";
			return;
		}
		const files = plan.files.filter((f) => f.linkCount > 0);
		fill(
			body,
			el("p", { class: "sf-plan-headline", text: plan.totalLinks === 0 ? `“${plan.oldName}” becomes “${plan.newName}”. No links point to it.` : `Renaming updates ${plural(plan.totalLinks, "link")} in ${plural(files.length, "file")}.` }),
			el("p", { class: "sf-muted", text: "A backup is made first, and anything you have typed is saved." }),
			list(files.map((f) => `${f.path}: ${plural(f.linkCount, "link")}`), "Files that change"),
			plan.referenceFiles.length ? el("p", { class: "sf-muted", text: `Chapters' PoV and location lists in ${plural(plan.referenceFiles.length, "novel file")} will follow the new name.` }) : null,
			plan.outside.linkCount ? list(plan.outside.files.map((f) => `${f.path}: ${plural(f.count, "link")}`), `${plural(plan.outside.linkCount, "link")} in notes outside storyForge's folders will not change`) : null,
			list([...plan.notDownloaded.map((p) => `${p} (still in iCloud)`), ...plan.unreadable.map((u) => `${u.path} (${u.reason})`), ...plan.frontmatterSkipped.map((p) => `${p} (its details can't be read safely)`)], "Files that could not be checked for links"),
		);
		dialog.setButtons([
			{ label: "Back", kind: "quiet", onClick: () => (stepName(), false) },
			{ label: "Rename", kind: "primary", onClick: () => (void apply(plan), false) },
		]);
	};

	const apply = async (plan: LinkRewritePlan): Promise<void> => {
		dialog.setButtons([{ label: "Renaming…", disabled: true }]);
		const editors = model.editors;
		const slot = editors?.where(notePath);
		const wasInSlot = slot && slot !== "centre" ? slot : null; // a note: the context panel or a library tab's workspace
		if (slot) await editors?.close(slot); // the note's own editor: saved and closed before the file moves
		let result: LinkRewriteResult;
		try {
			result = await model.controller.runRewrite(() => running.opened.renameNote.apply(notePath, input.value));
		} catch (e) {
			return showResult(plan, undefined, e as Error);
		}
		model.touch("codex", "library", "archive", "nav");
		if (result.status === "done" && wasInSlot) await editors?.open(wasInSlot, result.newPath);
		showResult(plan, result);
	};

	const showResult = (plan: LinkRewritePlan, r?: LinkRewriteResult, error?: Error): void => {
		const rows: (HTMLElement | null)[] = [];
		if (!r || r.status === "stopped") {
			rows.push(el("p", { class: "sf-plan-headline", text: "Nothing was changed." }), el("p", { text: `The rename stopped${r?.stoppedAt ? ` at the ${r.stoppedAt === "flush" ? "saving of open text" : r.stoppedAt === "backup" ? "backup" : "rename"}` : ""}: ${(error ?? r?.error)?.message ?? "an unknown error"}` }));
		} else if (r.status === "unchanged") {
			rows.push(el("p", { class: "sf-plan-headline", text: "Nothing to change." }));
		} else {
			rows.push(
				el("p", { class: "sf-plan-headline", text: `Renamed to “${plan.newName}”. ${plural(r.linksUpdated, "link")} updated in ${plural(r.filesUpdated.length, "file")}.` }),
				r.backupPath ? el("p", { class: "sf-summary-row" }, el("span", { class: "sf-muted", text: `Backup: ${r.backupPath}` }), button({ label: "Reveal", kind: "quiet", onClick: () => void model.reveal(r.backupPath!) })) : null,
				list(r.skippedChanged.map((p) => `${p} (it changed while this was running)`), "Files left untouched because they changed"),
				list(r.skippedUnsafe.map((u) => `${u.path}: ${u.reason}`), "Files left untouched because the edit could not be made safely"),
				r.outsideLinks ? el("p", { class: "sf-muted", text: `${plural(r.outsideLinks, "link")} in notes outside storyForge's folders were not changed.` }) : null,
				list(r.referencesSkipped.map((u) => `${u.path}: ${u.reason}`), "Novel files whose PoV and location lists could not be updated (they will show the old name as missing)"),
				r.rekeyError ? el("p", { class: "sf-rename-problem", text: `The Codex's own details could not be updated: ${r.rekeyError.message}` }) : null,
			);
		}
		fill(body, ...rows);
		dialog.setButtons([{ label: "Done", kind: "primary" }]);
	};

	dialog = openDialog({ title: "Rename note", key: "rename", body, buttons: [] });
	stepName();
}
