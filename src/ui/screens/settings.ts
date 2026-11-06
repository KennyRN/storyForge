import { NUMBERING_STYLE_OPTIONS, type NumberingStyle } from "../../core/numberingStyle";
import type { AutomaticBackupFrequency } from "../../core/backup";
import { APPEARANCE_BASE_PX, APPEARANCE_PARTS, APPEARANCE_SIZE_RANGE, APPEARANCE_SIZE_STEP, APPEARANCE_SIZE_STEP_SHIFT, CODEX_COLOURS, DATA_COLOURS, EMPHASIS_COLOURS, HIGHLIGHT_COLOURS, SELECTION_COLOURS, SESSION_LIMITS, appearanceKey, typeKey, setSetting, type AppearancePart, type CodexColour, type DataColour, type EmphasisColour, type SelectionColour, type ProjectSettings, type StoryKind } from "../../app/settings";
import { FAMILY_INFO, FONT_FAMILIES, isFontFamily, nearestWeight, type FontFamily } from "../../core/fontFamilies";
import { sampleStyle, styleLook } from "../appearance";
import { DISPLAY_TEXT_STYLE_IDS, FOLLOW, SYSTEM_STYLE_IDS, WRITING_STYLES, styleOf, resolvedFont, type TypeStyle } from "../../core/typeStyles";
import { button } from "../kit/button";
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
	/** The data colour: the same swatches, five choices (Brief 15). */
	const dataColour = (): HTMLElement => {
		const group = el("div", { class: "sf-swatches", attrs: { role: "radiogroup", "aria-label": "Data colour" } });
		for (const choice of DATA_COLOURS) {
			const chosen = settings.values.dataColour === choice;
			const b = el("button", { class: `sf-swatch${chosen ? " is-chosen" : ""}`, dataset: { choice }, attrs: { type: "button", role: "radio", "aria-checked": String(chosen), "aria-label": DATA_COLOUR_NAMES[choice] } }, el("span", { class: `sf-swatch-dot sf-swatch-dot--${choice}` }), DATA_COLOUR_NAMES[choice]);
			b.disabled = off;
			b.addEventListener("click", () => void change("dataColour", choice));
			group.append(b);
		}
		return el("div", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Data colour" }), group, source("dataColour"));
	};
	/** One of the text colours (Brief 17): named swatches, one chosen (a radio group), like the data colour. */
	const swatchRow = <K extends "selectionColour" | "highlightColour" | "boldColour" | "italicColour" | "boldItalicColour">(key: K, label: string, choices: readonly string[], names: Record<string, string>, dot: (choice: string) => string): HTMLElement => {
		const group = el("div", { class: "sf-swatches", attrs: { role: "radiogroup", "aria-label": label } });
		for (const choice of choices) {
			const chosen = settings.values[key] === choice;
			const b = el("button", { class: `sf-swatch${chosen ? " is-chosen" : ""}`, dataset: { choice }, attrs: { type: "button", role: "radio", "aria-checked": String(chosen), "aria-label": names[choice] } }, el("span", { class: `sf-swatch-dot ${dot(choice)}` }), names[choice]);
			b.disabled = off;
			b.addEventListener("click", () => void change(key, choice as ProjectSettings[K]));
			group.append(b);
		}
		return el("div", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: label }), group, source(key));
	};
	/** The text colours group: a sample line (the dressing's own classes, so a choice shows as it will in the editor) above five rows. */
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
			sample,
			swatchRow("selectionColour", "Selection colour", SELECTION_COLOURS, SELECTION_COLOUR_NAMES, (c) => `sf-swatch-dot--sel-${c}`),
			swatchRow("highlightColour", "Highlight colour", HIGHLIGHT_COLOURS, DATA_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
			swatchRow("boldColour", "Bold colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
			swatchRow("italicColour", "Italic colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
			swatchRow("boldItalicColour", "Bold italic colour", EMPHASIS_COLOURS, EMPHASIS_COLOUR_NAMES, (c) => `sf-swatch-dot--${c}`),
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

	/** A size in rem, with its pixel equivalent against the one named base. */
	const remText = (rem: number): string => `${+rem.toFixed(4)} rem (${+(rem * APPEARANCE_BASE_PX).toFixed(1)} px)`;
	const appearancePart = (part: AppearancePart): HTMLElement => {
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

		const weights = FAMILY_INFO[font].weights;
		const weightSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} weight` } }, ...weights.map((w) => el("option", { text: `${WEIGHT_NAMES[w] ?? w} (${w})`, attrs: { value: String(w) } })));
		weightSelect.value = String(nearestWeight(font, weightNow));
		weightSelect.disabled = off;
		weightSelect.addEventListener("change", () => void change(appearanceKey(part, "Weight"), Number(weightSelect.value) as never));

		// The size: committed on Return or leaving the field; rounded to the nearest step at once; refused outside its range; Escape restores.
		const sizeInput = el("input", { class: "sf-field sf-setting-control", attrs: { type: "text", inputmode: "decimal", "aria-label": `${name} size (rem)` } });
		const sizeHint = el("span", { class: "sf-muted sf-setting-source", text: remText(sizeNow) });
		sizeInput.value = String(sizeNow);
		sizeInput.disabled = off;
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
				else (committed.set(soft, soft.value), redraw()); // refused: put back
			});
			rows.push(row("Softness", soft, appearanceKey(part, "Soft")));
		}
		const sample = el("div", { class: "sf-sample", attrs: { "aria-label": `Sample of the ${name.toLowerCase()}`, role: "img" }, text: PART_SAMPLES[part] });
		sample.setAttribute("style", sampleStyle(part, settings.values));
		return section(name, [...rows, sample], `Appearance: ${name}`);
	};

	/** One of the two base fonts (Brief 18): the Interface font or the Writing font, which every style that names none of its own follows. */
	const baseFont = (which: "Interface" | "Writing"): HTMLElement => {
		const key = which === "Interface" ? "typeInterfaceFont" : "typeWritingFont";
		const select = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${which} font` } }, ...FONT_FAMILIES.map((f) => el("option", { text: f, attrs: { value: f } })));
		select.value = settings.values[key];
		select.disabled = off;
		select.addEventListener("change", () => void change(key, select.value as never));
		return section(`${which} font`, [row("Font", select, key), el("p", { class: "sf-muted sf-setting-hint", text: which === "Interface" ? "Every part of the app's own text that has no font of its own below." : "The chapter and note editors, the fields and the reading text." })], `Appearance: ${which} font`);
	};
	/** One type style: its font (or the base font), weight and size in pixels, and a sample drawn as it will be. */
	const typeStyle = (style: TypeStyle): HTMLElement => {
		const name = style.name;
		const baseName = style.base === "interface" ? "Interface font" : "Writing font";
		const fontKey = typeKey(style.id as never, "Font");
		const weightKey = typeKey(style.id as never, "Weight");
		const sizeKey = typeKey(style.id as never, "Size");
		const softKey = typeKey(style.id as never, "Soft");
		const base = style.base === "interface" ? settings.values.typeInterfaceFont : settings.values.typeWritingFont;
		const fontNow = settings.values[fontKey] as FontFamily | typeof FOLLOW;
		const family = resolvedFont(fontNow, base);
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
		const rows: HTMLElement[] = [row("Font", fontSelect, fontKey)];
		if (!style.fixed) {
			const weightSelect = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": `${name} weight` } }, ...FAMILY_INFO[family].weights.map((w) => el("option", { text: `${WEIGHT_NAMES[w] ?? w} (${w})`, attrs: { value: String(w) } })));
			weightSelect.value = String(nearestWeight(family, settings.values[weightKey] as number));
			weightSelect.disabled = off;
			weightSelect.addEventListener("change", () => void change(weightKey, Number(weightSelect.value) as never));
			rows.push(row("Weight", weightSelect, weightKey));
			const [lo, hi] = style.range;
			const sizeNow = settings.values[sizeKey] as number;
			const sizeInput = el("input", { class: "sf-field sf-setting-control", attrs: { type: "text", inputmode: "numeric", "aria-label": `${name} size (px)` } });
			const sizeHint = el("span", { class: "sf-muted sf-setting-source", text: `${lo} to ${hi} px` });
			sizeInput.value = String(sizeNow);
			sizeInput.disabled = off;
			const reset = (): void => {
				sizeInput.value = String(sizeNow);
				sizeInput.removeAttribute("aria-invalid");
				sizeHint.removeAttribute("role");
				sizeHint.textContent = `${lo} to ${hi} px`;
			};
			const commitSize = (): void => {
				const typed = Number(sizeInput.value.trim());
				if (sizeInput.value.trim() === "" || !Number.isInteger(typed) || typed < lo || typed > hi) {
					sizeInput.value = String(sizeNow);
					sizeInput.setAttribute("aria-invalid", "true");
					sizeHint.setAttribute("role", "alert");
					sizeHint.textContent = `Between ${lo} and ${hi} px`;
					return;
				}
				reset();
				sizeInput.value = String(typed);
				if (typed !== sizeNow) void change(sizeKey, typed as never);
			};
			sizeInput.addEventListener("change", commitSize);
			sizeInput.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commitSize();
				} else if (e.key === "Escape") {
					e.stopPropagation(); // put the figure back without closing the dialog
					reset();
				} else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
					e.preventDefault();
					const from = Number(sizeInput.value);
					const next = Math.min(hi, Math.max(lo, (Number.isFinite(from) ? Math.round(from) : sizeNow) + (e.key === "ArrowUp" ? 1 : -1)));
					sizeInput.value = String(next);
					commitSize();
				}
			});
			rows.push(el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Size" }), sizeInput, sizeHint));
			if (family === "Fraunces") {
				const soft = el("input", { class: "sf-field sf-setting-control", attrs: { type: "number", min: "0", max: "100", step: "25", "aria-label": `${name} Softness (0 to 100)` } });
				soft.value = String(settings.values[softKey]);
				soft.disabled = off;
				soft.addEventListener("change", () => {
					const v = Number(soft.value);
					if (Number.isInteger(v) && v >= 0 && v <= 100) void change(softKey, v as never);
					else (committed.set(soft, soft.value), redraw());
				});
				rows.push(row("Softness", soft, softKey));
			}
		}
		const look = styleLook(style, settings.values);
		const sample = el("div", { class: "sf-sample", attrs: { "aria-label": `Sample of the ${name.toLowerCase()} style`, role: "img" }, text: style.sample });
		sample.setAttribute("style", `font-family: ${look.family}; font-weight: ${look.weight}; font-size: ${look.size}; font-variation-settings: ${look.variation};`);
		return section(name, [...rows, sample], `Appearance: ${name}`);
	};
	const group = (title: string, children: HTMLElement[]): HTMLElement => el("div", { class: "sf-settings-group", attrs: { role: "group", "aria-label": title } }, el("h2", { class: "sf-settings-group-title", text: title }), ...children);

	let page: Page = "General";
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
		const pages: Record<Page, HTMLElement[]> = {
			General: [
				section("Interface", [
					select("autoFocus", "Opens in", [["true", "storytelling"], ["false", "library"]], (v) => v === "true"),
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
			Appearance: [group("Interface: System", [baseFont("Interface"), ...SYSTEM_STYLE_IDS.map((id) => typeStyle(styleOf(id)))]), group("Interface: Display text", DISPLAY_TEXT_STYLE_IDS.map((id) => typeStyle(styleOf(id)))), group("Navigator", APPEARANCE_PARTS.map(appearancePart)), group("Writing", [baseFont("Writing"), ...WRITING_STYLES.map(typeStyle)]), section("Codex colour", [codexColour()]), section("Data colour", [dataColour()]), section("Text colours", textColours())],
			Writing: [section("Typing", typingSection({ settings: settings.values, off, change, check, notify: (text) => model.notices.notify({ kind: "warning", text }) }))],
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
		const panel = el("div", { class: "sf-settings-page sf-scroll", attrs: { id: "sf-settings-page", role: "tabpanel", "aria-label": page } }, ...(off ? [el("p", { class: "sf-muted", text: running.readOnlyReason ?? settings.readOnlyReason })] : []), ...pages[page]);
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
		const scroll = before && before.getAttribute("aria-label") === page ? before.scrollTop : 0;
		body.replaceChildren(tabs, panel);
		panel.scrollTop = scroll;
		body.querySelectorAll("select").forEach((s) => {
			if (s.getAttribute("aria-label") === "Opens in" && !twins.some(([old]) => old === s)) s.value = String(settings.values.autoFocus);
		});
		if (twins.some(([old]) => old === focused)) {
			(focused as HTMLElement).focus();
			if (caret && caret.from !== null && caret.to !== null) try { (focused as HTMLInputElement).setSelectionRange(caret.from, caret.to); } catch { /* a number box has no caret to put back */ }
		}
		rebuilding = false;
		for (const [old] of twins) if (isTextBox(old)) armChange(old);
		heldBack = twins.some(([old]) => isTextBox(old) && old === focused);
	};
	const section = (title: string, rows: HTMLElement[], label = title): HTMLElement => el("section", { class: "sf-settings-section", attrs: { "aria-label": label } }, el("h3", { class: "sf-summary-title", text: title }), ...rows);
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
