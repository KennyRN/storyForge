import { NUMBERING_STYLE_OPTIONS, type NumberingStyle } from "../../core/numberingStyle";
import type { AutomaticBackupFrequency } from "../../core/backup";
import { APPEARANCE_PARTS, APPEARANCE_SIZE_RANGE, APPEARANCE_SIZE_STEP, APPEARANCE_SIZE_STEP_SHIFT, CODEX_COLOURS, SESSION_LIMITS, appearanceKey, setSetting, type AppearancePart, type CodexColour, type ProjectSettings, type StoryKind } from "../../app/settings";
import { FAMILY_INFO, FONT_FAMILIES, isFontFamily, nearestWeight, type FontFamily } from "../../core/fontFamilies";
import { sampleStyle } from "../appearance";
import { button } from "../kit/button";
import { openDialog } from "../kit/dialog";
import { el } from "../kit/dom";
import { typingSection } from "./typingSettings";
import { widthsSettings } from "./widthsSettings";
import type { AppModel } from "../model";

const SOURCE_WORDS = { "project.md": "this project", "data.json": "the plugin's settings", default: "default" } as const;
const CODEX_COLOUR_NAMES: Record<CodexColour, string> = { text: "Text", yellow: "Yellow", green: "Green", aqua: "Aqua", blue: "Blue", purple: "Purple", orange: "Orange", grey: "Grey" };
const PART_NAMES: Record<AppearancePart, string> = { codex: "Codex list", novel: "Novel title", series: "Series name", chapter: "Selected chapter" };
const PART_SAMPLES: Record<AppearancePart, string> = { codex: "Cast · Jane Harbour · Ælfric", novel: "Book 1: The Harbour Wakes", series: "The Lantern Cycle", chapter: "Chapter 1: The Storm" };
const WEIGHT_NAMES: Record<number, string> = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
const PAGES = ["General", "Story", "Appearance", "Writing", "Sessions", "Backups", "This Mac"] as const;
type Page = (typeof PAGES)[number];
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

	/** A size in rem, with its pixel equivalent (the page's base is 16 px). */
	const remText = (rem: number): string => `${+rem.toFixed(3)} rem (${+(rem * 16).toFixed(1)} px)`;
	const appearancePart = (part: AppearancePart): HTMLElement => {
		const name = PART_NAMES[part];
		const [lo, hi] = APPEARANCE_SIZE_RANGE[part];
		const font = settings.values[appearanceKey(part, "Font")] as FontFamily | null;
		const weightNow = settings.values[appearanceKey(part, "Weight")] as number;
		const sizeNow = settings.values[appearanceKey(part, "Size")] as number;
		const fontKey = appearanceKey(part, "Font");

		const fontSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} font` } }, el("option", { text: "Current look", attrs: { value: "" } }), ...FONT_FAMILIES.map((f) => el("option", { text: f, attrs: { value: f } })));
		fontSelect.value = font ?? "";
		fontSelect.disabled = off;
		fontSelect.addEventListener("change", () => {
			const chosen = isFontFamily(fontSelect.value) ? fontSelect.value : null;
			void (async () => {
				await change(fontKey, chosen as never);
				// The weight goes with the author to the new font where it has it, else the nearest it does have.
				const weightKey = appearanceKey(part, "Weight");
				const kept = settings.values[weightKey] as number; // read now, not when the page was drawn: a weight just chosen may have landed since
				if (chosen && nearestWeight(chosen, kept) !== kept) await change(weightKey, nearestWeight(chosen, kept) as never);
			})();
		});

		const weights = font ? FAMILY_INFO[font].weights : [weightNow];
		const weightSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} weight` } }, ...weights.map((w) => el("option", { text: `${WEIGHT_NAMES[w] ?? w} (${w})`, attrs: { value: String(w) } })));
		weightSelect.value = String(font ? nearestWeight(font, weightNow) : weightNow);
		weightSelect.disabled = off || !font;
		weightSelect.addEventListener("change", () => void change(appearanceKey(part, "Weight"), Number(weightSelect.value) as never));

		// The size: committed on Return or leaving the field; rounded to the nearest step at once; refused outside its range; Escape restores.
		const sizeInput = el("input", { class: "sf-field sf-setting-control", attrs: { type: "text", inputmode: "decimal", "aria-label": `${name} size (rem)` } });
		const sizeHint = el("span", { class: "sf-muted sf-setting-source", text: remText(sizeNow) });
		sizeInput.value = String(sizeNow);
		sizeInput.disabled = off || !font;
		const refuse = (): void => {
			sizeInput.value = String(sizeNow);
			sizeInput.setAttribute("aria-invalid", "true");
			sizeHint.setAttribute("role", "alert");
			sizeHint.textContent = `Between ${lo} and ${hi} rem`;
		};
		const commitSize = (): void => {
			const text = sizeInput.value.trim().replace(",", ".");
			const typed = text === "" ? Number.NaN : Number(text);
			if (!Number.isFinite(typed) || typed < lo || typed > hi) return refuse();
			const rounded = Math.round(Math.round(typed / APPEARANCE_SIZE_STEP) * APPEARANCE_SIZE_STEP * 1000) / 1000;
			const next = Math.min(hi, Math.max(lo, rounded));
			sizeInput.value = String(next); // the rounded figure at once
			sizeInput.removeAttribute("aria-invalid");
			sizeHint.removeAttribute("role");
			sizeHint.textContent = remText(next);
			if (next !== sizeNow) void change(appearanceKey(part, "Size"), next as never);
		};
		sizeInput.addEventListener("change", commitSize);
		sizeInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commitSize();
			} else if (e.key === "Escape") {
				e.stopPropagation(); // put the figure back without closing the dialog
				sizeInput.value = String(sizeNow);
				sizeInput.removeAttribute("aria-invalid");
				sizeHint.removeAttribute("role");
				sizeHint.textContent = remText(sizeNow);
			} else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				e.preventDefault();
				const step = e.shiftKey ? APPEARANCE_SIZE_STEP_SHIFT : APPEARANCE_SIZE_STEP;
				const base = Number(sizeInput.value.replace(",", "."));
				const from = Number.isFinite(base) ? base : sizeNow;
				const next = Math.min(hi, Math.max(lo, Math.round((from + (e.key === "ArrowUp" ? step : -step)) * 1000) / 1000));
				sizeInput.value = String(next);
				commitSize();
			}
		});

		const rows: HTMLElement[] = [
			row("Font", fontSelect, fontKey),
			row("Weight", weightSelect, appearanceKey(part, "Weight")),
			el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Size" }), sizeInput, sizeHint),
		];
		if (font === "Fraunces") {
			const soft = el("input", { class: "sf-field sf-setting-control", attrs: { type: "number", min: "0", max: "100", step: "25", "aria-label": `${name} Softness (0 to 100)` } });
			soft.value = String(settings.values[appearanceKey(part, "Soft")]);
			soft.disabled = off;
			soft.addEventListener("change", () => {
				const v = Number(soft.value);
				if (Number.isInteger(v) && v >= 0 && v <= 100) void change(appearanceKey(part, "Soft"), v as never);
				else redraw();
			});
			const wonk = el("input", { attrs: { type: "checkbox", "aria-label": `${name} Wonk` } });
			wonk.checked = settings.values[appearanceKey(part, "Wonk")] as boolean;
			wonk.disabled = off;
			wonk.addEventListener("change", () => void change(appearanceKey(part, "Wonk"), wonk.checked as never));
			rows.push(row("Softness", soft, appearanceKey(part, "Soft")), row("Wonk", wonk, appearanceKey(part, "Wonk")));
		}
		const sample = el("div", { class: "sf-sample", attrs: { "aria-label": `Sample of the ${name.toLowerCase()}`, role: "img" }, text: PART_SAMPLES[part] });
		sample.setAttribute("style", sampleStyle(part, settings.values));
		return section(name, [...rows, sample], `Appearance: ${name}`);
	};

	let page: Page = "General";
	const body = el("div", { class: "sf-settings" });
	const redraw = (): void => {
		const numbering = Object.entries(NUMBERING_STYLE_OPTIONS) as [NumberingStyle, string][];
		const storyKind = (): HTMLElement => {
			const group = el("div", { class: "sf-swatches", attrs: { role: "radiogroup", "aria-label": "This story is" } });
			for (const [choice, text] of [["series", "A series"], ["standalone", "One standalone novel"]] as [StoryKind, string][]) {
				const chosen = settings.values.storyKind === choice;
				const b = el("button", { class: `sf-swatch${chosen ? " is-chosen" : ""}`, dataset: { choice }, attrs: { type: "button", role: "radio", "aria-checked": String(chosen) }, text });
				b.disabled = off;
				b.addEventListener("click", () => void change("storyKind", choice));
				group.append(b);
			}
			return el("div", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "This story is" }), group, source("storyKind"));
		};
		const pages: Record<Page, HTMLElement[]> = {
			General: [
				section("Interface", [
					select("autoFocus", "Opens in", [["true", "storytelling"], ["false", "library"]], (v) => v === "true"),
					check("highlightActiveChapter", "Highlight the active chapter"),
					check("hideSeriesPane", "Hide the series pane (for one standalone book)"),
				]),
			],
			Story: [
				section("Story", [storyKind()]),
				section("Numbering", [
					select("seriesNumberingStyle", "Series numbering", numbering, (v) => v as NumberingStyle),
					select("chapterNumberingStyle", "Chapter numbering", numbering, (v) => v as NumberingStyle),
				]),
			],
			Appearance: [...APPEARANCE_PARTS.map(appearancePart), section("Codex colour", [codexColour()])],
			Writing: [section("Typing", typingSection({ settings: settings.values, off, change, check, notify: (text) => model.notices.notify({ text }) }))],
			Sessions: [
				section("Sessions", [
					number("sessionIdleMinutes", "Session idle limit (minutes)", SESSION_LIMITS.idleMinutes),
					number("sessionMinShownMinutes", "Shortest session shown (minutes)", SESSION_LIMITS.minShownMinutes),
					number("sessionEditingWpm", "Count as editing below (words per minute)", SESSION_LIMITS.editingWpm, true),
				]),
				section("Display", [check("showSessionReadout", "Show the current session in the stats panel")]),
			],
			Backups: [
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
			],
			"This Mac": [section("This Mac, this project", [widthsSettings(model)])],
		};
		const tabs = el("div", { class: "sf-settings-tabs", attrs: { role: "tablist", "aria-orientation": "vertical", "aria-label": "Settings sections" } });
		PAGES.forEach((p, i) => {
			const active = p === page;
			tabs.append(
				el("button", {
					class: `sf-settings-tab${active ? " is-active" : ""}`,
					dataset: { page: p },
					attrs: { type: "button", role: "tab", "aria-selected": String(active), "aria-controls": "sf-settings-page", tabindex: active ? "0" : "-1" },
					text: p,
					on: {
						click: () => ((page = p), redraw()),
						keydown: (e) => {
							const next = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
							if (!next) return;
							e.preventDefault();
							page = PAGES[(i + next + PAGES.length) % PAGES.length];
							redraw();
							body.querySelector<HTMLElement>(".sf-settings-tab.is-active")?.focus();
						},
					},
				}),
			);
		});
		const panel = el("div", { class: "sf-settings-page", attrs: { id: "sf-settings-page", role: "tabpanel", "aria-label": page } }, ...(off ? [el("p", { class: "sf-muted", text: running.readOnlyReason })] : []), ...pages[page]);
		body.replaceChildren(tabs, panel);
		body.querySelectorAll("select").forEach((s) => {
			if (s.getAttribute("aria-label") === "Opens in") s.value = String(settings.values.autoFocus);
		});
	};
	const section = (title: string, rows: HTMLElement[], label = title): HTMLElement => el("section", { class: "sf-settings-section", attrs: { "aria-label": label } }, el("h3", { class: "sf-summary-title", text: title }), ...rows);
	redraw();
	openDialog({ title: "Settings", body, buttons: [{ label: "Done", kind: "primary" }] });
}
