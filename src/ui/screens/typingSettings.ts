import { DEFAULT_ELISIONS, OLD_ENGLISH_GROUP } from "../../core/typing/defaults";
import { settingLabel } from "./settingNames";
import { moved, normaliseElision, normaliseName, normaliseShortcodeCode, normaliseShortcodeText, normaliseSpecialCharacter, withEntry, withoutEntry } from "../../core/typing/lists";
import type { ProjectSettings } from "../../app/settings";
import { button } from "../kit/button";
import { el } from "../kit/dom";

/** What the Typing group needs from the settings view. */
export interface TypingContext {
	settings: ProjectSettings;
	/** True in a read-only project: every control is off. */
	off: boolean;
	change: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => Promise<void>;
	/** A switch row, as the settings view draws them. */
	check: (key: "typingSmartPunctuation" | "typingNameAutocorrect" | "typingShortcodes" | "typingShortcodeNames" | "typingSpecialCharactersButton", label: string) => HTMLElement;
	notify: (text: string) => void;
}

interface ListOptions {
	key: "typingElisions" | "typingNameOptOuts" | "typingWordList" | "typingSpecialCharacters";
	label: string;
	hint: string;
	placeholder: string;
	normalise: (raw: string) => string | null;
	/** Shown for a typed entry that can't be used. */
	refusal: string;
	/** How two entries are told to be the same (names ignore case). */
	fold?: (s: string) => string;
	reorder?: boolean;
	/** The text shown for an entry, when it needs more than itself. */
	describe?: (entry: string) => string;
	extra?: HTMLElement[];
}

/** The Typing group: five switches, and the lists the aids use (docs/typing-aids.md §8). */
export function typingSection(ctx: TypingContext): Record<string, HTMLElement[]> {
	const { settings, off } = ctx;

	const listEditor = (o: ListOptions): HTMLElement => {
		const items = settings[o.key];
		const list = el("ul", { class: "sf-chip-list", attrs: { "aria-label": settingLabel(o.label) } });
		items.forEach((item, i) => {
			const chip = el("li", { class: "sf-chip" }, el("span", { class: "sf-chip-text", text: o.describe ? o.describe(item) : item }));
			if (o.reorder && !off) {
				chip.append(
					el("button", { class: "sf-chip-button", text: "‹", attrs: { type: "button", "aria-label": `Move ${item} earlier`, ...(i === 0 ? { disabled: "" } : {}) }, on: { click: () => void ctx.change(o.key, moved(items, i, -1)) } }),
					el("button", { class: "sf-chip-button", text: "›", attrs: { type: "button", "aria-label": `Move ${item} later`, ...(i === items.length - 1 ? { disabled: "" } : {}) }, on: { click: () => void ctx.change(o.key, moved(items, i, 1)) } }),
				);
			}
			if (!off) chip.append(el("button", { class: "sf-chip-button", text: "×", attrs: { type: "button", "aria-label": `Remove ${item}` }, on: { click: () => void ctx.change(o.key, withoutEntry(items, item)) } }));
			list.append(chip);
		});
		if (items.length === 0) list.append(el("li", { class: "sf-muted", text: "None" }));
		const input = el("input", { class: "sf-field", attrs: { type: "text", "aria-label": `Add to ${settingLabel(o.label)}`, placeholder: o.placeholder } });
		input.disabled = off;
		const add = (): void => {
			const entry = o.normalise(input.value);
			if (entry === null) return void (input.value.trim() === "" ? undefined : ctx.notify(o.refusal));
			input.value = "";
			void ctx.change(o.key, withEntry(items, entry, o.fold) as never);
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				add();
			}
		});
		const adder = el("div", { class: "sf-list-add" }, input, button({ label: "Add", disabled: off, onClick: add }), ...(o.extra ?? []));
		return el("div", { class: "sf-list-setting" }, el("span", { class: "sf-setting-label", text: settingLabel(o.label) }), el("span", { class: "sf-muted sf-setting-hint", text: o.hint }), list, adder);
	};

	/** The shortcodes: each a code and its full text. */
	const shortcodes = (): HTMLElement => {
		const map = settings.typingShortcodeList;
		const list = el("ul", { class: "sf-chip-list sf-chip-list--stacked", attrs: { "aria-label": settingLabel("Shortcodes") } });
		for (const [code, text] of Object.entries(map)) {
			const chip = el("li", { class: "sf-chip" }, el("span", { class: "sf-chip-text", text: `~${code}  →  ${text}` }));
			if (!off) {
				chip.append(
					el("button", {
						class: "sf-chip-button",
						text: "×",
						attrs: { type: "button", "aria-label": `Remove ~${code}` },
						on: { click: () => void ctx.change("typingShortcodeList", Object.fromEntries(Object.entries(map).filter(([c]) => c !== code))) },
					}),
				);
			}
			list.append(chip);
		}
		if (Object.keys(map).length === 0) list.append(el("li", { class: "sf-muted", text: "None" }));
		const code = el("input", { class: "sf-field", attrs: { type: "text", "aria-label": "Shortcode letters", placeholder: "~th" } });
		const full = el("input", { class: "sf-field", attrs: { type: "text", "aria-label": "Shortcode full text", placeholder: "the Right Honourable" } });
		code.disabled = off;
		full.disabled = off;
		const add = (): void => {
			const c = normaliseShortcodeCode(code.value);
			const t = normaliseShortcodeText(full.value);
			if (c === null) return void ctx.notify("A shortcode is the letters after ~ (no digits, spaces or punctuation).");
			if (t === null) return void ctx.notify("A shortcode needs its full text, on one line.");
			if (Object.keys(map).some((k) => k.toLowerCase() === c.toLowerCase() && k !== c)) return void ctx.notify(`There is already a shortcode like ~${c}, apart from capitals.`);
			code.value = "";
			full.value = "";
			void ctx.change("typingShortcodeList", { ...map, [c]: t });
		};
		full.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				add();
			}
		});
		return el(
			"div",
			{ class: "sf-list-setting" },
			el("span", { class: "sf-setting-label", text: settingLabel("Shortcodes") }),
			el("span", { class: "sf-muted sf-setting-hint", text: "Type ~ and the letters, then Tab, to put in the full text." }),
			list,
			el("div", { class: "sf-list-add" }, code, full, button({ label: "Add", disabled: off, onClick: add })),
		);
	};

	// Sub-pages of Writing (round five): the typing behaviours, the names, the shortcodes and the special characters.
	return {
		"typing behaviours": [
			el("p", { class: "sf-muted sf-setting-hint", text: "The Mac's own smart quotes, dashes, text replacements and autocorrection are off in the editor, so only these aids change what you type." }),
			ctx.check("typingSmartPunctuation", "Curly quotes, dashes and ellipses as you type"),
			listEditor({ key: "typingElisions", label: "Words that begin with an apostrophe", hint: "’tis, ’twas, ’em: the opening quote becomes an apostrophe.", placeholder: "tis", normalise: normaliseElision, refusal: "An elision is letters only, such as tis or twas.", fold: (s) => s, extra: [button({ label: "Restore the starting list", disabled: off, onClick: () => void ctx.change("typingElisions", [...DEFAULT_ELISIONS]) })] }),
		],
		names: [
			ctx.check("typingNameAutocorrect", "Correct Codex names as you type them"),
			listEditor({ key: "typingWordList", label: "Names without a Codex note", hint: "Corrected the same way as Codex names.", placeholder: "Ælfric", normalise: normaliseName, refusal: "A name is one line, without [ ] # ^ |.", fold: (s) => s.toLowerCase() }),
			listEditor({ key: "typingNameOptOuts", label: "Names that are also ordinary words", hint: "Never put in place of an all-lower-case word: “the red blossom fell” stays as typed.", placeholder: "Red Blossom", normalise: normaliseName, refusal: "A name is one line, without [ ] # ^ |.", fold: (s) => s.toLowerCase() }),
		],
		shortcodes: [
			ctx.check("typingShortcodes", "Shortcodes (~ then Tab)"),
			ctx.check("typingShortcodeNames", "Offer Codex names after ~"),
			shortcodes(),
		],
		"special characters": [
			ctx.check("typingSpecialCharactersButton", "Special-characters button in the context panel"),
			listEditor({
				key: "typingSpecialCharacters",
				label: "Special characters",
				hint: "In the palette, in this order.",
				placeholder: "ð",
				normalise: normaliseSpecialCharacter,
				refusal: "A special character is a single visible character.",
				reorder: true,
				extra: [button({ label: "Add the Old English group", disabled: off, onClick: () => void ctx.change("typingSpecialCharacters", OLD_ENGLISH_GROUP.reduce((acc, c) => withEntry(acc, c), [...settings.typingSpecialCharacters])) })],
			}),
		],
	};
}
