import { NUMBERING_STYLE_OPTIONS, type NumberingStyle } from "../../core/numberingStyle";
import type { AutomaticBackupFrequency } from "../../core/backup";
import { CODEX_COLOURS, SESSION_LIMITS, setSetting, type CodexColour, type ProjectSettings } from "../../app/settings";
import { button } from "../kit/button";
import { openDialog } from "../kit/dialog";
import { el } from "../kit/dom";
import { typingSection } from "./typingSettings";
import { widthsSettings } from "./widthsSettings";
import type { AppModel } from "../model";

const SOURCE_WORDS = { "project.md": "this project", "data.json": "the plugin's settings", default: "default" } as const;
const CODEX_COLOUR_NAMES: Record<CodexColour, string> = { text: "Text", yellow: "Yellow", green: "Green", aqua: "Aqua", blue: "Blue", purple: "Purple", orange: "Orange", grey: "Grey" };
const FREQUENCIES: Record<AutomaticBackupFrequency, string> = { "every-open": "Every time the project opens", daily: "Once a day", weekly: "Once a week" };

/**
 * The settings view (⌘,): numbering, backups, sessions, typing and the interface. Each change is written to `project.md` only when
 * the value really changes (decision 23), and each row says, quietly, where its value comes from.
 */
export function openSettings(model: AppModel): void {
	const running = model.running;
	if (!running) return void model.notices.notify({ text: "Open a project first." });
	const project = running.opened.project;
	const settings = running.settings;
	const off = !!running.readOnlyReason;

	const change = async <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]): Promise<void> => {
		await model.guard(async () => {
			await setSetting(project, settings, key, value);
			model.touch("settings", "library", "nav", "face");
			redraw();
		}, "save the setting");
	};
	const source = (key: keyof ProjectSettings): HTMLElement => el("span", { class: "sf-muted sf-setting-source", text: SOURCE_WORDS[settings.sources[key]] });

	const select = <K extends keyof ProjectSettings>(key: K, label: string, options: [string, string][], toValue: (v: string) => ProjectSettings[K]): HTMLElement => {
		const input = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": label } }, ...options.map(([value, text]) => el("option", { text, attrs: { value } })));
		input.value = String(settings.values[key]);
		input.disabled = off;
		input.addEventListener("change", () => void change(key, toValue(input.value)));
		return row(label, input, key);
	};
	const check = (key: "highlightActiveChapter" | "hideSeriesPane" | "automaticBackup" | "showSessionReadout" | "typingSmartPunctuation" | "typingNameAutocorrect" | "typingShortcodes" | "typingShortcodeNames" | "typingSpecialCharactersButton", label: string): HTMLElement => {
		const input = el("input", { attrs: { type: "checkbox", "aria-label": label } });
		input.checked = settings.values[key];
		input.disabled = off;
		input.addEventListener("change", () => void change(key, input.checked));
		return row(label, input, key);
	};
	/** The Codex colour: named swatches, one chosen (a radio group). */
	const codexColour = (): HTMLElement => {
		const group = el("div", { class: "sf-swatches", attrs: { role: "radiogroup", "aria-label": "Codex colour" } });
		for (const choice of CODEX_COLOURS) {
			const chosen = settings.values.codexColour === choice;
			const b = el("button", { class: `sf-swatch${chosen ? " is-chosen" : ""}`, dataset: { choice }, attrs: { type: "button", role: "radio", "aria-checked": String(chosen), "aria-label": CODEX_COLOUR_NAMES[choice] }, }, el("span", { class: `sf-swatch-dot sf-swatch-dot--${choice}` }), CODEX_COLOUR_NAMES[choice]);
			b.disabled = off;
			b.addEventListener("click", () => void change("codexColour", choice));
			group.append(b);
		}
		// A div, not the label the other rows use: a click on a label would press the first swatch.
		return el("div", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Codex colour" }), group, source("codexColour"));
	};
	/** A whole-number field. Committed when it loses focus or Return is pressed; a value outside the range is put back. Blank means off, where `nullable`. */
	const number = (key: "sessionIdleMinutes" | "sessionMinShownMinutes" | "sessionEditingWpm", label: string, [lo, hi]: readonly [number, number], nullable = false): HTMLElement => {
		const input = el("input", { class: "sf-field sf-setting-control", attrs: { type: "number", min: String(lo), max: String(hi), step: "1", "aria-label": label, ...(nullable ? { placeholder: "off" } : {}) } });
		const current = settings.values[key];
		input.value = current === null ? "" : String(current);
		input.disabled = off;
		input.addEventListener("change", () => {
			const text = input.value.trim();
			const next = text === "" ? null : Number(text);
			const ok = next === null ? nullable : Number.isInteger(next) && next >= lo && next <= hi;
			if (!ok) return void redraw();
			void change(key, next as never);
		});
		return row(label, input, key);
	};
	const row = (label: string, control: HTMLElement, key: keyof ProjectSettings): HTMLElement => el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: label }), control, source(key));

	const body = el("div", { class: "sf-settings" });
	const redraw = (): void => {
		const numbering = Object.entries(NUMBERING_STYLE_OPTIONS) as [NumberingStyle, string][];
		body.replaceChildren(
			...(off ? [el("p", { class: "sf-muted", text: running.readOnlyReason })] : []),
			section("Numbering", [
				select("seriesNumberingStyle", "Series numbering", numbering, (v) => v as NumberingStyle),
				select("chapterNumberingStyle", "Chapter numbering", numbering, (v) => v as NumberingStyle),
			]),
			section("Backups", [
				check("automaticBackup", "Back up automatically"),
				select("automaticBackupFrequency", "How often", Object.entries(FREQUENCIES), (v) => v as AutomaticBackupFrequency),
				el(
					"div",
					{ class: "sf-setting-row" },
					el("span", { class: "sf-setting-label", text: "Everything in the project folder" }),
					button({
						label: "Back up everything now",
						disabled: off,
						onClick: () =>
							void model.guard(async () => {
								const result = await model.controller.manualBackup("full");
								model.notices.notify({ text: `Backed up ${result.fileCount} files to ${result.path}.`, actions: [{ label: "Reveal", onClick: () => void model.reveal(result.path), dismiss: false }] });
							}, "back up"),
					}),
				),
			]),
			section("Sessions", [
				number("sessionIdleMinutes", "Session idle limit (minutes)", SESSION_LIMITS.idleMinutes),
				number("sessionMinShownMinutes", "Shortest session shown (minutes)", SESSION_LIMITS.minShownMinutes),
				number("sessionEditingWpm", "Count as editing below (words per minute)", SESSION_LIMITS.editingWpm, true),
			]),
			section("Display", [check("showSessionReadout", "Show the current session in the stats panel")]),
			section("Typing", typingSection({ settings: settings.values, off, change, check, notify: (text) => model.notices.notify({ text }) })),
			section("Interface", [
				select("autoFocus", "Opens in", [["true", "storytelling"], ["false", "library"]], (v) => v === "true"),
				check("highlightActiveChapter", "Highlight the active chapter"),
				check("hideSeriesPane", "Hide the series pane (for one standalone book)"),
				codexColour(),
			]),
			section("This Mac, this project", [widthsSettings(model)]),
		);
		body.querySelectorAll("select").forEach((s) => {
			if (s.getAttribute("aria-label") === "Opens in") s.value = String(settings.values.autoFocus);
		});
	};
	const section = (title: string, rows: HTMLElement[]): HTMLElement => el("section", { class: "sf-settings-section", attrs: { "aria-label": title } }, el("h3", { class: "sf-summary-title", text: title }), ...rows);
	redraw();
	openDialog({ title: "Settings", body, buttons: [{ label: "Done", kind: "primary" }] });
}
