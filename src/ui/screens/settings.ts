import { NUMBERING_STYLE_OPTIONS, type NumberingStyle } from "../../core/numberingStyle";
import type { AutomaticBackupFrequency } from "../../core/backup";
import { APPEARANCE_BASE_PX, APPEARANCE_PARTS, APPEARANCE_SIZE_RANGE, APPEARANCE_SIZE_STEP, APPEARANCE_SIZE_STEP_SHIFT, CODEX_COLOURS, DATA_COLOURS, EMPHASIS_COLOURS, HIGHLIGHT_COLOURS, LABEL_COLOURS, RAIL_COLOURS, SELECTION_COLOURS, SESSION_LIMITS, appearanceKey, typeKey, setSetting, type AppearancePart, type CodexColour, type DataColour, type EmphasisColour, type LabelColour, type RailColour, type SelectionColour, type ProjectSettings, type StoryKind } from "../../app/settings";
import { FAMILY_INFO, FONT_FAMILIES, isFontFamily, nearestWeight, type FontFamily } from "../../core/fontFamilies";
import { px, sampleStyle, styleLook } from "../appearance";
import { getCodexView } from "../../core/codex";
import { FOLLOW, styleOf, resolvedFont, type TypeStyle, type TypeStyleId } from "../../core/typeStyles";
import { getBookChapters, numberedChapterTitle, readBookFrontmatter } from "../../core/book";
import { numberedBookTitle, readSeriesFrontmatter } from "../../core/series";
import { button } from "../kit/button";
import { navIcon, type NavIconName } from "../kit/navIcons";
import { bringForward, openDialog } from "../kit/dialog";
import { el } from "../kit/dom";
import { typingSection } from "./typingSettings";
import { widthsSettings } from "./widthsSettings";
import type { AppModel } from "../model";

const SOURCE_WORDS = { "project.md": "this project", "data.json": "the plugin's settings", default: "default" } as const;
const DATA_COLOUR_NAMES: Record<DataColour, string> = { yellow: "Yellow", aqua: "Aqua", blue: "Blue", orange: "Orange", purple: "Purple" };
const CODEX_COLOUR_NAMES: Record<CodexColour, string> = { text: "Text", yellow: "Yellow", green: "Green", aqua: "Aqua", blue: "Blue", purple: "Purple", orange: "Orange", grey: "Grey" };
const SELECTION_COLOUR_NAMES: Record<SelectionColour, string> = { plum: "Plum", blue: "Blue", green: "Green", yellow: "Yellow", grey: "Grey" };
const EMPHASIS_COLOUR_NAMES: Record<EmphasisColour, string> = { text: "Text colour", ...DATA_COLOUR_NAMES };
const PART_NAMES: Record<AppearancePart, string> = { codex: "codex list", novel: "novel title", series: "series name", chapter: "selected chapter" };
const LABEL_COLOUR_NAMES: Record<LabelColour, string> = { text: "Text colour", muted: "Muted grey", ...DATA_COLOUR_NAMES };
const RAIL_COLOUR_NAMES: Record<RailColour, string> = { grey0: "Grey 0 (the default)", grey1: "Grey 1", grey2: "Grey 2", ...DATA_COLOUR_NAMES };
const PART_SAMPLES: Record<AppearancePart, string> = { codex: "Cast · Jane Harbour · Ælfric", novel: "Book 1: The Harbour Wakes", series: "The Lantern Cycle", chapter: "Chapter 1: The Storm" };
const WEIGHT_NAMES: Record<number, string> = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
const PAGES = ["General", "Appearance", "Writing", "Sessions", "Backups"] as const;
type Page = (typeof PAGES)[number];
/** General and Appearance are single entries with sub-pages across the top of their panes (round two; General's in round five: "this Mac" says those settings are kept on this Mac). */
const APPEARANCE_PAGES = ["interface", "library mode", "storytelling mode", "writing"] as const;
const GENERAL_PAGES = ["general", "story", "this computer"] as const;
const WRITING_PAGES = ["typing behaviours", "names", "shortcodes", "special characters"] as const;
const SUB_PAGES: Partial<Record<Page, readonly string[]>> = { General: GENERAL_PAGES, Appearance: APPEARANCE_PAGES, Writing: WRITING_PAGES };
/** Each entry of the left-hand list has Kenny's icon (volcanicMole's Rounded Settings, Layout Dashboard, Keyboard and Clipboard Data, and the Back Up shield). */
const SETTINGS_ICONS: Partial<Record<Page, NavIconName>> = { General: "settings", Appearance: "dashboard", Writing: "keyboard", Sessions: "clipboard", Backups: "backup" };
const FREQUENCIES: Record<AutomaticBackupFrequency, string> = { "every-open": "Every time the project opens", daily: "Once a day", weekly: "Once a week" };

/**
 * The settings view (⌘,): numbering, backups, sessions, typing and the interface. Each change is written to `project.md` only when
 * the value really changes (decision 23), and each row says, quietly, where its value comes from.
 */
export function openSettings(model: AppModel): void {
	if (bringForward("settings")) return;
	const running = model.running;
	if (!running) return void model.notices.notify({ kind: "warning", text: "Open a project first." });
	const project = running.opened.project;
	const settings = running.settings;

	// Live: a settings file that can't be read, or is from a newer storyForge, switches the controls off while the dialog is open.
	const isOff = (): boolean => !!running.readOnlyReason || settings.readOnly;
	let off = isOff();
	// One rule for every redraw (decisions 96 and 99, and the dialog's own writes): everything is rebuilt except the controls in use. A text
	// box with focus and text not yet committed keeps its text, caret and focus; a control whose own change is still being saved isn't
	// replaced under the person's hand. Once that change lands the control shows the stored value, like the rest.
	const pending = new Set<HTMLElement>(); // controls whose own change is being saved
	const committed = new WeakMap<HTMLElement, string>(); // what a text box held when its change was made
	let started: HTMLElement | null = null; // the control whose event is being handled right now (set for the handler's synchronous part)
	const isControl = (n: unknown): n is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => n instanceof HTMLInputElement || n instanceof HTMLSelectElement || n instanceof HTMLTextAreaElement;
	const isTextBox = (n: unknown): n is HTMLInputElement | HTMLTextAreaElement => n instanceof HTMLTextAreaElement || (n instanceof HTMLInputElement && n.type !== "checkbox" && n.type !== "radio" && n.type !== "button");
	const change = async <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]): Promise<void> => {
		const origin = started;
		if (origin) {
			pending.add(origin);
			if (isTextBox(origin)) committed.set(origin, origin.value);
		}
		try {
			await model.guard(async () => {
				model.reportReplaced(await setSetting(project, settings, key, value), value);
				model.touch("settings", "library", "nav", "face");
			}, "save the setting");
		} finally {
			if (origin) pending.delete(origin);
			redraw();
		}
	};
	const source = (key: keyof ProjectSettings): HTMLElement => el("span", { class: "sf-muted sf-setting-source", text: SOURCE_WORDS[settings.sources[key]] });

	const select = <K extends keyof ProjectSettings>(key: K, label: string, options: [string, string][], toValue: (v: string) => ProjectSettings[K]): HTMLElement => {
		const input = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": label } }, ...options.map(([value, text]) => el("option", { text, attrs: { value } })));
		input.value = String(settings.values[key]);
		input.disabled = off;
		input.addEventListener("change", () => void change(key, toValue(input.value)));
		return row(label, input, key);
	};
	const check = (key: "hideSeriesPane" | "automaticBackup" | "showSessionReadout" | "typingSmartPunctuation" | "typingNameAutocorrect" | "typingShortcodes" | "typingShortcodeNames" | "typingSpecialCharactersButton", label: string): HTMLElement => {
		const input = el("input", { attrs: { type: "checkbox", "aria-label": label } });
		input.checked = settings.values[key];
		input.disabled = off;
		input.addEventListener("change", () => void change(key, input.checked));
		return row(label, input, key);
	};
	/** Unnamed colour squares, one chosen (a radio group): the name is for the screen reader and the tooltip; the chosen one has a ring. */
	const swatches = (key: "codexColour" | "dataColour" | "selectionColour" | "highlightColour" | "boldColour" | "italicColour" | "boldItalicColour" | "smallHeadingColour" | "libraryHeaderColour" | "placedColour" | "unplacedColour" | "dataLabelColour" | "dataValueColour" | "railColour", label: string, choices: readonly string[], names: Record<string, string>, dot: (choice: string) => string, unavailable?: (choice: string) => boolean): HTMLElement => {
		const group = el("div", { class: "sf-swatches", attrs: { role: "radiogroup", "aria-label": label } });
		for (const choice of choices) {
			const chosen = settings.values[key] === choice;
			const b = el("button", { class: `sf-swatch sf-swatch--colour${chosen ? " is-chosen" : ""}`, dataset: { choice }, attrs: { type: "button", role: "radio", "aria-checked": String(chosen), "aria-label": names[choice], title: names[choice] } }, el("span", { class: `sf-swatch-dot ${dot(choice)}` }));
			b.disabled = off || !!unavailable?.(choice);
			if (unavailable?.(choice)) b.title = `${names[choice]}: the bar's own colour`;
			b.addEventListener("click", () => void change(key, choice as never));
			group.append(b);
		}
		return group;
	};
	/** One Appearance style (round five): a row of three columns, all aligned to its top: the name, the options (stacked: font and weight on one line, the size slider, the colour swatches) and the preview. */
	const gridRow = (name: string, lines: (HTMLElement | null)[], preview: HTMLElement | null, omitPreview = false): HTMLElement[] => {
		const options = el("div", { class: "sf-grid-options" }, ...lines.filter((l): l is HTMLElement => !!l));
		const tail = omitPreview ? [] : [preview ? (preview.classList.add("sf-grid-preview"), preview) : el("div", { class: "sf-grid-preview" })]; // a row beside a shared preview leaves its cell out
		return [el("div", { class: "sf-grid-name", text: name }), options, ...tail];
	};
	const line = (...cells: (HTMLElement | null)[]): HTMLElement => el("div", { class: "sf-options-line" }, ...cells.filter((c): c is HTMLElement => !!c));
	const dot = (c: string): string => `sf-swatch-dot--${c}`;
	const codexColour = (): HTMLElement => swatches("codexColour", "codex colour", CODEX_COLOURS, CODEX_COLOUR_NAMES, dot);
	const tagged = (tag: string, group: HTMLElement): HTMLElement => line(el("span", { class: "sf-muted sf-options-tag", text: tag }), group); // the bar has two swatch rows, so they are tagged
	const barColour = (): HTMLElement => tagged("bar", swatches("dataColour", "bar colour", DATA_COLOURS, DATA_COLOUR_NAMES, dot));
	const railColour = (): HTMLElement => tagged("rail", swatches("railColour", "rail colour", RAIL_COLOURS, RAIL_COLOUR_NAMES, (c) => (c.startsWith("grey") ? `sf-swatch-dot--rail-${c}` : dot(c)), (c) => c === settings.values.dataColour));
	const smallHeadingColour = (): HTMLElement => swatches("smallHeadingColour", "small heading colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, dot);
	const libraryHeaderColour = (): HTMLElement => swatches("libraryHeaderColour", "library header colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, dot);
	const placedColour = (): HTMLElement => swatches("placedColour", "placed colour", CODEX_COLOURS, CODEX_COLOUR_NAMES, dot);
	const unplacedColour = (): HTMLElement => swatches("unplacedColour", "unplaced colour", CODEX_COLOURS, CODEX_COLOUR_NAMES, dot);
	const labelDot = (c: string): string => (c === "muted" ? "sf-swatch-dot--muted" : dot(c));
	const dataLabelColour = (): HTMLElement => swatches("dataLabelColour", "data label colour", LABEL_COLOURS, LABEL_COLOUR_NAMES, labelDot);
	const dataValueColour = (): HTMLElement => swatches("dataValueColour", "data colour", LABEL_COLOURS, LABEL_COLOUR_NAMES, labelDot);
	const swatchRow = (key: "selectionColour" | "highlightColour" | "boldColour" | "italicColour" | "boldItalicColour", label: string, choices: readonly string[], names: Record<string, string>, dot: (choice: string) => string): HTMLElement =>
		el("div", { class: "sf-setting-row sf-setting-row--colour" }, el("span", { class: "sf-setting-label", text: label }), swatches(key, label, choices, names, dot));
	/** The text colours page: five rows with a sample line (the dressing's own classes, so a choice shows as it will in the editor) beside them. */
	const textColours = (): HTMLElement[] => {
		const sample = el(
			"div",
			{ class: "sf-text-sample", attrs: { role: "group", "aria-label": "Sample of the text colours" } },
			"Plain, ",
			el("span", { class: "sf-strong", text: "bold" }),
			", ",
			el("span", { class: "sf-em", text: "italic" }),
			", ",
			el("span", { class: "sf-strong sf-em", text: "bold italic" }),
			", ",
			el("span", { class: "sf-highlight", text: "highlighted" }),
			" and ",
			el("span", { class: "sf-sample-selected", text: "selected" }),
			" text.",
		);
		return [
			el("div", { class: "sf-style sf-style--colours" },
				el("div", { class: "sf-style-controls" },
					swatchRow("selectionColour", "Selection colour", SELECTION_COLOURS, SELECTION_COLOUR_NAMES, (c) => `sf-swatch-dot--sel-${c}`),
					swatchRow("highlightColour", "Highlight colour", HIGHLIGHT_COLOURS, DATA_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
					swatchRow("boldColour", "Bold colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
					swatchRow("italicColour", "Italic colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
					swatchRow("boldItalicColour", "Bold italic colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
				),
				sample,
			),
		];
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
			if (!ok) return (committed.set(input, input.value), void redraw()); // refused: the box is put back, not kept as typed
			void change(key, next as never);
		});
		return row(label, input, key);
	};
	const row = (label: string, control: HTMLElement, key: keyof ProjectSettings): HTMLElement => el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: label }), control, source(key));

	/**
	 * A size slider (round two): a drag previews live (the value beside it, the sample and the page) and the size is saved once, on release;
	 * the arrow keys step by `step` and, where `shiftStep` is given, Shift steps by that. Out-of-range figures can't be entered.
	 */
	const sizeSlider = (o: { label: string; lo: number; hi: number; step: number; shiftStep?: number; now: number; text: (v: number) => string; commit: (v: number) => void; preview: (v: number) => void }): [HTMLInputElement, HTMLElement] => {
		const slider = el("input", { class: "sf-slider sf-setting-control", attrs: { type: "range", min: String(o.lo), max: String(o.hi), step: String(o.step), "aria-label": o.label, "aria-valuetext": o.text(o.now) } });
		const value = el("span", { class: "sf-muted sf-setting-source", text: o.text(o.now) });
		slider.value = String(o.now);
		slider.disabled = off;
		const read = (): number => Math.round(Number(slider.value) * 1000) / 1000;
		slider.addEventListener("input", () => {
			value.textContent = o.text(read());
			slider.setAttribute("aria-valuetext", o.text(read()));
			o.preview(read());
		});
		slider.addEventListener("change", () => {
			if (read() !== o.now) o.commit(read());
		});
		if (o.shiftStep) {
			const shiftStep = o.shiftStep;
			slider.addEventListener("keydown", (e) => {
				const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
				if (!e.shiftKey || !dir) return;
				e.preventDefault();
				slider.value = String(Math.min(o.hi, Math.max(o.lo, Math.round((read() + dir * shiftStep) * 1000) / 1000)));
				slider.dispatchEvent(new Event("input", { bubbles: true }));
				slider.dispatchEvent(new Event("change", { bubbles: true }));
			});
		}
		return [slider, value];
	};
	/** The names the previews use: the open project's own where there are any. */
	const names = (): { series: string; novel: string; chapter: string } => {
		const book = model.nav.book;
		const chapter = model.nav.chapter;
		const safe = <T,>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };
		return {
			series: safe(() => readSeriesFrontmatter(project).seriesTitle, "The Lantern Cycle"),
			novel: safe(() => (book ? numberedBookTitle(project, book, undefined, settings.values.seriesNumberingStyle) : "Book 1"), "Book 1"),
			chapter: safe(() => (book && chapter ? numberedChapterTitle(project, book, chapter, settings.values.chapterNumberingStyle) : "Chapter 1"), "Chapter 1"),
		};
	};
	/** The first few entries of the project's Codex, in the list's own order; examples only for an empty Codex. */
	const codexNames = (): string[] => {
		try {
			const real = (getCodexView(project, "codex")?.children ?? []).map((c) => c.name).slice(0, 4);
			if (real.length) return real;
		} catch { /* an unreadable Codex: the examples */ }
		return ["Cast", "Jane Harbour", "Ælfric"];
	};
	/** A preview: the style drawn in the colour and on the background it really has, in text of the kind it is used for. */
	const preview = (name: string, text: string, where: string, font: string, inner?: HTMLElement): HTMLElement => {
		const box = el("div", { class: `sf-preview sf-preview--${where}`, attrs: { role: "img", "aria-label": `Sample of the ${name.toLowerCase()} style` } }, inner ?? text);
		box.setAttribute("style", font);
		return box;
	};
	const fontOf = (look: { family: string; weight: number; size: string; variation: string }): string => `font-family: ${look.family}; font-weight: ${look.weight}; font-size: ${look.size}; font-variation-settings: ${look.variation};`;
	const previewText = (style: TypeStyle): { text: string; where: string } => {
		const n = names();
		switch (style.id) {
			case "body": return { text: "Back Up Now · Open Project… · Hide the series pane", where: "panel" };
			case "bodyBold": return { text: n.series, where: "panel" };
			case "smallHeading": return { text: "storytelling · placed", where: "small-heading" };
			case "hint": return { text: "Between 0.75 and 2 rem", where: "hint" };
			case "heading": return { text: "Settings", where: "raised" };
			case "title": return { text: "Series overview", where: "panel" };
			case "libraryHeader": return { text: "Placed Chapters · Unplaced Chapters", where: "library-header" };
			default: return { text: style.sample, where: "card" };
		}
	};
	/** The chapters the list previews show: the open novel's own, else examples. */
	const chapterNames = (placed: boolean): string[] => {
		try {
			const book = model.nav.book;
			if (book) {
				const { ordered, unplaced } = getBookChapters(project, book);
				const list = (placed ? ordered : unplaced).slice(0, 3).map((c) => numberedChapterTitle(project, book, c.name, settings.values.chapterNumberingStyle));
				if (list.length) return list;
			}
		} catch { /* the examples */ }
		return placed ? ["Chapter 1: The Storm", "Chapter 2: The Harbour Wakes"] : ["Chapter 9: The Return", "Chapter 10: Loose ends"];
	};
	/** The styles whose preview is built from the app's own classes, so a drag of their slider shows on it at once. */
	const customPreview = (style: TypeStyle): HTMLElement | null => {
		const frame = (name: string, where: string, ...kids: HTMLElement[]): HTMLElement => el("div", { class: `sf-preview sf-preview--${where}`, attrs: { role: "img", "aria-label": `Sample of the ${name} style` } }, ...kids);
		if (style.id === "placed" || style.id === "unplaced") {
			const rows = chapterNames(style.id === "placed").slice(0, 2).map((t, i) => el("div", { class: `sf-preview-row sf-preview-row--${style.id}${i === 1 ? " is-selected" : ""}`, text: t }));
			return frame(style.name, style.id === "placed" ? "card" : "panel", ...rows);
		}
		if (style.id === "barName") {
			const demo = el("div", { class: "sf-bar-demo" }, el("div", { class: "sf-bar-demo-rail" }), el("div", { class: "sf-bar-demo-fill" }), el("span", { class: "sf-bar-name-text sf-bar-demo-name", text: names().chapter }));
			return frame(style.name, "panel", demo);
		}
		return null;
	};
	/** The data label and the data share one preview: "Default PoV: Jane Harbour", with the project's own value where there is one. */
	const dataPreview = (): HTMLElement => {
		let value = "Jane Harbour";
		try { const book = model.nav.book; const fm = book ? readBookFrontmatter(project, book) : null; if (fm?.defaultPovPath) value = fm.defaultPovName ?? value; } catch { /* the example */ }
		return el("div", { class: "sf-preview sf-preview--panel sf-grid-preview--tall", attrs: { role: "img", "aria-label": "Sample of the data label and data styles" } }, el("span", { class: "sf-data-label", text: "Default PoV: " }), el("span", { class: "sf-data-value", text: value }));
	};
	/** Which family a style's weights come from: its own, and for Body bold Body's. */
	const familyOf = (style: TypeStyle): FontFamily => styleLook(style, settings.values).name;
	/** One type style as grid cells: its name, font (or the base font), weight, size and a preview. A style without one of them leaves that cell empty. */
	const typeStyle = (style: TypeStyle, shared?: { preview?: HTMLElement; omit?: boolean; extra?: HTMLElement[] }): HTMLElement[] => {
		const name = style.name;
		const baseName = style.base === "interface" ? "Interface font" : "Writing font";
		const fontKey = typeKey(style.id as never, "Font");
		const weightKey = typeKey(style.id as never, "Weight");
		const sizeKey = typeKey(style.id as never, "Size");
		const followsBody = style.id === "bodyBold"; // only a weight of its own: Body's font and size
		const base = style.base === "interface" ? settings.values.typeInterfaceFont : settings.values.typeWritingFont;
		const fontNow = settings.values[fontKey] as FontFamily | typeof FOLLOW;
		const family = familyOf(style);
		const { text, where } = previewText(style);
		const look = styleLook(style, settings.values);
		const sampleEl = shared?.preview ?? customPreview(style) ?? preview(name, text, where, fontOf(look));

		let fontCell: HTMLElement | null = null;
		if (!followsBody) {
			const fontSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} font` } }, el("option", { text: baseName, attrs: { value: FOLLOW } }), ...FONT_FAMILIES.map((f) => el("option", { text: f, attrs: { value: f } })));
			fontSelect.value = fontNow;
			fontSelect.disabled = off;
			fontSelect.addEventListener("change", () => {
				const picked = fontSelect.value as FontFamily | typeof FOLLOW;
				const chosen = resolvedFont(picked, style.base === "interface" ? settings.values.typeInterfaceFont : settings.values.typeWritingFont);
				void (async () => {
					await change(fontKey, picked as never);
					const kept = settings.values[weightKey] as number;
					if (nearestWeight(chosen, kept) !== kept) await change(weightKey, nearestWeight(chosen, kept) as never);
				})();
			});
			fontCell = fontSelect;
		}
		let weightCell: HTMLElement | null = null;
		let sizeCell: HTMLElement | null = null;
		if (!style.fixed) {
			const weightSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} weight` } }, ...FAMILY_INFO[family].weights.map((w) => el("option", { text: `${WEIGHT_NAMES[w] ?? w} (${w})`, attrs: { value: String(w) } })));
			weightSelect.value = String(nearestWeight(family, settings.values[weightKey] as number));
			weightSelect.disabled = off;
			weightSelect.addEventListener("change", () => void change(weightKey, Number(weightSelect.value) as never));
			weightCell = weightSelect;
			if (!followsBody) {
				const [lo, hi] = style.range;
				const [slider, hint] = sizeSlider({
					label: `${name} size (px)`, lo, hi, step: 1, now: settings.values[sizeKey] as number, text: (v) => `${v} px`,
					commit: (next) => void change(sizeKey, next as never),
					preview: (v) => { if (!shared && !["placed", "unplaced", "barName", "dataLabel", "data"].includes(style.id)) sampleEl.style.fontSize = `${v}px`; document.documentElement.style.setProperty(`--ts-${style.id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-size`, `${v}px`); },
				});
				sizeCell = el("div", { class: "sf-size-cell" }, slider); void hint;
			}
		}
		return gridRow(name, [line(fontCell, weightCell), sizeCell, ...(shared?.extra ?? [])], sampleEl, shared?.omit);
	};
	/** A size in rem, with its pixel equivalent against the one named base. */
	const remText = (rem: number): string => `${+rem.toFixed(4)} rem (${+(rem * APPEARANCE_BASE_PX).toFixed(1)} px)`;
	/** One of the Navigator's parts (now "storytelling mode"), on the same grid; its size is in rem. */
	const appearancePart = (part: AppearancePart, extra: HTMLElement[] = []): HTMLElement[] => {
		const name = PART_NAMES[part];
		const [lo, hi] = APPEARANCE_SIZE_RANGE[part];
		const fontNow = settings.values[appearanceKey(part, "Font")];
		const font = resolvedFont(fontNow, settings.values.typeInterfaceFont);
		const weightNow = settings.values[appearanceKey(part, "Weight")] as number;
		const sizeNow = settings.values[appearanceKey(part, "Size")] as number;
		const fontKey = appearanceKey(part, "Font");

		const fontSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} font` } }, el("option", { text: "Interface font", attrs: { value: FOLLOW } }), ...FONT_FAMILIES.map((f) => el("option", { text: f, attrs: { value: f } })));
		fontSelect.value = fontNow;
		fontSelect.disabled = off;
		fontSelect.addEventListener("change", () => {
			const picked = fontSelect.value as FontFamily | typeof FOLLOW;
			const chosen = resolvedFont(picked, settings.values.typeInterfaceFont);
			void (async () => {
				await change(fontKey, picked as never);
				// The weight goes with the author to the new font where it has it, else the nearest it does have.
				const weightKey = appearanceKey(part, "Weight");
				const kept = settings.values[weightKey] as number; // read now, not when the page was drawn: a weight just chosen may have landed since
				if (nearestWeight(chosen, kept) !== kept) await change(weightKey, nearestWeight(chosen, kept) as never);
			})();
		});
		const weightSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} weight` } }, ...FAMILY_INFO[font].weights.map((w) => el("option", { text: `${WEIGHT_NAMES[w] ?? w} (${w})`, attrs: { value: String(w) } })));
		weightSelect.value = String(nearestWeight(font, weightNow));
		weightSelect.disabled = off;
		weightSelect.addEventListener("change", () => void change(appearanceKey(part, "Weight"), Number(weightSelect.value) as never));

		const n = names();
		const text = part === "series" ? n.series : part === "novel" ? n.novel : part === "chapter" ? n.chapter : "";
		const sampleEl = el("div", { class: "sf-preview sf-preview--panel" });
		const inner = el("div", { class: part === "codex" ? "sf-preview-codex" : "sf-preview-accent", text });
		if (part === "codex") for (const entry of codexNames()) inner.append(el("div", { class: "sf-preview-codex-row", text: entry }));
		inner.setAttribute("style", sampleStyle(part, settings.values));
		sampleEl.append(inner);
		sampleEl.setAttribute("role", "img");
		sampleEl.setAttribute("aria-label", `Sample of the ${name.toLowerCase()}`);
		const [sizeSliderEl] = sizeSlider({
			label: `${name} size (rem)`, lo, hi, step: APPEARANCE_SIZE_STEP, shiftStep: APPEARANCE_SIZE_STEP_SHIFT, now: sizeNow, text: remText,
			commit: (next) => void change(appearanceKey(part, "Size"), next as never),
			preview: (v) => { inner.style.fontSize = px(v); document.documentElement.style.setProperty(`--ap-${part}-size`, px(v)); },
		});
		const rows = gridRow(name, [line(fontSelect, weightSelect), el("div", { class: "sf-size-cell" }, sizeSliderEl), ...extra], sampleEl);
		return rows;
	};
	/** One of the two base fonts (Brief 18): the Interface font or the Writing font, which every style that names none of its own follows. */
	const baseFont = (which: "Interface" | "Writing"): HTMLElement[] => {
		const key = which === "Interface" ? "typeInterfaceFont" : "typeWritingFont";
		const select = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${which.toLowerCase()} font` } }, ...FONT_FAMILIES.map((f) => el("option", { text: f, attrs: { value: f } })));
		select.value = settings.values[key];
		select.disabled = off;
		select.addEventListener("change", () => void change(key, select.value as never));
		return gridRow(`${which.toLowerCase()} font`, [line(select)], el("div", { class: "sf-muted sf-grid-hint", text: which === "Interface" ? "Every part of the app's own text that has no font of its own below." : "The chapter and note editors, the fields and the reading text." }));
	};
	const grid = (...groups: HTMLElement[][]): HTMLElement[] => [el("div", { class: "sf-grid" }, ...groups.flat())];
	const styles = (...ids: TypeStyleId[]): HTMLElement[][] => ids.map((id) => typeStyle(styleOf(id)));

	let page: Page = "General";
	let subPage: string = GENERAL_PAGES[0]; // the sub-page of the page shown (General or Appearance); the first when a page is chosen
	const body = el("div", { class: "sf-settings" });
	// Which control an event came from, for the synchronous part of its handler (change() reads it): a change, a click or Return in a box.
	for (const type of ["change", "click", "keydown"]) {
		body.addEventListener(type, (e) => {
			started = e.target as HTMLElement;
			setTimeout(() => (started = null), 0);
		}, true);
	}
	let heldBack = false; // a text box being typed in was left as it was: redraw once it loses focus
	let rebuilding = false;
	// Putting a focused box back in the page makes the browser forget what it held when focus began, so it would no longer announce a
	// change on Return or when focus leaves. A box put back therefore announces its own: if its text differs from what it had when
	// it was last focused or committed.
	const focusValue = new WeakMap<HTMLElement, string>();
	body.addEventListener("focusin", (e) => { if (!rebuilding && isTextBox(e.target)) focusValue.set(e.target, e.target.value); }, true);
	const armed = new WeakSet<HTMLElement>();
	const armChange = (box: HTMLInputElement | HTMLTextAreaElement): void => {
		if (armed.has(box)) return;
		armed.add(box);
		const fire = (): void => {
			if (box.value === focusValue.get(box)) return;
			focusValue.set(box, box.value);
			box.dispatchEvent(new Event("change", { bubbles: true }));
		};
		const onKey = (e: Event): void => { if ((e as KeyboardEvent).key === "Enter") fire(); };
		box.addEventListener("keydown", onKey);
		box.addEventListener("focusout", () => (box.removeEventListener("keydown", onKey), armed.delete(box), fire()), { once: true });
	};
	/** The controls the next redraw leaves alone. */
	const inUse = (): HTMLElement[] => {
		const kept = new Set<HTMLElement>([...pending].filter((c) => body.contains(c)));
		const a = document.activeElement;
		if (isTextBox(a) && body.contains(a) && committed.get(a) !== a.value) kept.add(a);
		return [...kept];
	};
	const redrawNow = (): void => {
		started = null;
		off = isOff();
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
		const pick = (m: Record<string, HTMLElement[]>): HTMLElement[] => m[subPage] ?? []; // the sub-page of General or Appearance
		const pages: Record<Page, HTMLElement[]> = {
			General: pick({
				general: [
					section("Interface", [
						select("autoFocus", "Opens in", [["true", "storytelling"], ["false", "library"]], (v) => v === "true"),
						check("hideSeriesPane", "Hide the series pane (for one standalone book)"),
					]),
				],
				story: [
					section("Story", [storyKind()]),
					section("Numbering", [
						select("seriesNumberingStyle", "Series numbering", numbering, (v) => v as NumberingStyle),
						select("chapterNumberingStyle", "Chapter numbering", numbering, (v) => v as NumberingStyle),
					]),
				],
				"this computer": [section("This computer, this project", [widthsSettings(model)])],
			}),
			Appearance: pick({
				interface: grid(baseFont("Interface"), ...styles("body", "bodyBold"), typeStyle(styleOf("smallHeading"), { extra: [smallHeadingColour()] }), ...styles("hint")),
				"library mode": grid(
					...styles("title"), typeStyle(styleOf("libraryHeader"), { extra: [libraryHeaderColour()] }),
					typeStyle(styleOf("placed"), { extra: [placedColour()] }), typeStyle(styleOf("unplaced"), { extra: [unplacedColour()] }),
					typeStyle(styleOf("dataLabel"), { preview: dataPreview(), extra: [dataLabelColour()] }), typeStyle(styleOf("data"), { omit: true, extra: [dataValueColour()] }),
					typeStyle(styleOf("barName"), { extra: [barColour(), railColour()] }),
				),
				"storytelling mode": grid(...(["series", "novel", "chapter"] as const).map((p) => appearancePart(p)), appearancePart("codex", [codexColour()])),
				writing: [...grid(baseFont("Writing"), ...styles("prose", "reading", "fields")), section("Text colours", textColours())],
			}),
			Writing: pick(Object.fromEntries(Object.entries(typingSection({ settings: settings.values, off, change, check, notify: (text) => model.notices.notify({ kind: "warning", text }) })).map(([k, v]) => [k, [section("Typing", v)]]))),
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
									model.notices.notify({ kind: "success", text: `Backed up ${result.fileCount} files to ${result.path}.`, actions: [{ label: "Reveal", onClick: () => void model.reveal(result.path), dismiss: false }] });
								}, "back up"),
						}),
					),
				]),
			],
		};
		const tabs = el("div", { class: "sf-settings-tabs", attrs: { role: "tablist", "aria-orientation": "vertical", "aria-label": "Settings sections" } });
		PAGES.forEach((p, i) => {
			const active = p === page;
			tabs.append(
				el("button", {
					class: `sf-settings-tab${active ? " is-active" : ""}`,
					dataset: { page: p },
					attrs: { type: "button", role: "tab", "aria-selected": String(active), "aria-controls": "sf-settings-page", tabindex: active ? "0" : "-1" },
					...(SETTINGS_ICONS[p] ? {} : { text: p }),
					on: {
						click: () => (p !== page && (subPage = SUB_PAGES[p]?.[0] ?? ""), (page = p), redraw()),
						keydown: (e) => {
							const next = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
							if (!next) return;
							e.preventDefault();
							page = PAGES[(i + next + PAGES.length) % PAGES.length];
							subPage = SUB_PAGES[page]?.[0] ?? "";
							redraw();
							body.querySelector<HTMLElement>(".sf-settings-tab.is-active")?.focus();
						},
					},
				}, ...(SETTINGS_ICONS[p] ? [navIcon(SETTINGS_ICONS[p]!, "32px"), el("span", { class: "sf-settings-tab-label", text: p })] : [])), // Kenny's icons, drawn as in the Navigate menu
			);
		});
		const subList = SUB_PAGES[page] ?? [];
		const subtabs = el("div", { class: "sf-settings-subtabs", attrs: { role: "tablist", "aria-label": page } });
		subList.forEach((p, i) => {
			const active = p === subPage;
			subtabs.append(
				el("button", {
					class: `sf-settings-subtab${active ? " is-active" : ""}`,
					dataset: { subpage: p },
					attrs: { type: "button", role: "tab", "aria-selected": String(active), "aria-controls": "sf-settings-page", tabindex: active ? "0" : "-1" },
					text: p,
					on: {
						click: () => ((subPage = p), redraw(), body.querySelector<HTMLElement>(".sf-settings-subtab.is-active")?.focus()),
						keydown: (e) => {
							const next = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
							if (!next) return;
							e.preventDefault();
							subPage = subList[(i + next + subList.length) % subList.length];
							redraw();
							body.querySelector<HTMLElement>(".sf-settings-subtab.is-active")?.focus();
						},
					},
				}),
			);
		});
		const pageKey = subList.length ? `${page}/${subPage}` : page;
		const panel = el("div", { class: "sf-settings-page sf-scroll", dataset: { key: pageKey }, attrs: { id: "sf-settings-page", role: "tabpanel", "aria-label": subList.length ? subPage : page } }, ...(off ? [el("p", { class: "sf-muted", text: running.readOnlyReason ?? settings.readOnlyReason })] : []), ...pages[page]);
		// The controls in use go back in place of their new twins (found by tag, type and name), with focus and caret.
		const keep = inUse().filter((c) => isControl(c));
		const focused = document.activeElement;
		const caret = isTextBox(focused) ? { from: focused.selectionStart, to: focused.selectionEnd } : null;
		const twins: [HTMLElement, HTMLElement][] = [];
		for (const old of keep) {
			const label = old.getAttribute("aria-label");
			const twin = label ? [...panel.querySelectorAll<HTMLElement>(old.tagName)].find((n) => n.getAttribute("aria-label") === label && (n as HTMLInputElement).type === (old as HTMLInputElement).type) : undefined;
			if (twin) twins.push([old, twin]);
		}
		rebuilding = true;
		for (const [old, twin] of twins) twin.replaceWith(old);
		const before = body.querySelector<HTMLElement>(".sf-settings-page");
		const scroll = before && before.dataset.key === pageKey ? before.scrollTop : 0;
		const slider = document.activeElement instanceof HTMLInputElement && document.activeElement.type === "range" && body.contains(document.activeElement) ? document.activeElement.getAttribute("aria-label") : null;
		body.replaceChildren(tabs, el("div", { class: "sf-settings-pane" }, ...(subList.length ? [subtabs] : []), panel));
		if (slider) panel.querySelector<HTMLElement>(`input[type=range][aria-label="${slider}"]`)?.focus({ preventScroll: true }); // a key on a slider redraws the page: focus stays on its slider
		panel.scrollTop = scroll;
		body.querySelectorAll("select").forEach((s) => {
			if (s.getAttribute("aria-label") === "Opens in" && !twins.some(([old]) => old === s)) s.value = String(settings.values.autoFocus);
		});
		if (twins.some(([old]) => old === focused)) {
			(focused as HTMLElement).focus({ preventScroll: true });
			if (caret && caret.from !== null && caret.to !== null) try { (focused as HTMLInputElement).setSelectionRange(caret.from, caret.to); } catch { /* a number box has no caret to put back */ }
		}
		panel.scrollTop = scroll; // focus above can move the page; the author's place is kept
		rebuilding = false;
		for (const [old] of twins) if (isTextBox(old)) armChange(old);
		heldBack = twins.some(([old]) => isTextBox(old) && old === focused);
	};
	// No headers inside Settings' pages (round five): the sub-page buttons name them. The section keeps its name for the screen reader.
	const section = (title: string, rows: HTMLElement[], label = title): HTMLElement => el("section", { class: "sf-settings-section", attrs: { "aria-label": label } }, ...rows);
	// A redraw never lands between the pointer going down on a control and coming up (Fix 8): the pressed tab would be replaced and the
	// click would land on nothing. It waits for the release, and runs just after the click.
	let pointerDown = false;
	let redrawWaiting = false;
	const redraw = (): void => {
		if (pointerDown) return void (redrawWaiting = true);
		redrawNow();
	};
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	const HOLD_LIMIT_MS = 1500; // an outside change is never held back longer than this, whatever happens to the pointer
	const release = (): void => {
		clearTimeout(holdTimer);
		if (!pointerDown) return;
		pointerDown = false;
		if (redrawWaiting) setTimeout(() => ((redrawWaiting = false), redraw()), 0);
	};
	body.addEventListener("pointerdown", () => ((pointerDown = true), clearTimeout(holdTimer), (holdTimer = setTimeout(release, HOLD_LIMIT_MS))), true);
	window.addEventListener("pointerup", release, true); // anywhere, including outside the window while the button is held
	window.addEventListener("pointercancel", release, true);
	window.addEventListener("blur", release);
	redrawNow();
	// Settings changed from outside (decision 96) redraw by the same rule: a text box being typed in is left as it is until it loses focus.
	const unsubscribe = model.subscribe("settings", redraw);
	body.addEventListener("focusout", () => {
		if (rebuilding || !heldBack) return;
		heldBack = false;
		setTimeout(redraw, 0);
	});
	openDialog({
		title: "Settings",
		key: "settings",
		body,
		buttons: [{ label: "Done", kind: "primary" }],
		focus: (panel) => panel.querySelector<HTMLElement>(".sf-settings-tab.is-active"),
		onClose: () => (unsubscribe(), clearTimeout(holdTimer), window.removeEventListener("pointerup", release, true), window.removeEventListener("pointercancel", release, true), window.removeEventListener("blur", release)),
	});
}
