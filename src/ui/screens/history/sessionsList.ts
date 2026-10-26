import { classify, lengthMinutes, paceWpm, type SessionSettings } from "../../../core/sessionFigures";
import type { SessionRecord } from "../../../core/sessions";
import { formatWordCount } from "../../../core/wordCount";
import { el } from "../../kit/dom";
import { netLabel } from "./heatmap";

/** `09:30` from a stored `2026-10-25T09:30:00+00:00`: the wall clock the Mac had, as stored. */
export const clockOf = (iso: string): string => iso.slice(11, 16);

export function lengthLabel(minutes: number): string {
	const m = Math.round(minutes);
	if (m < 60) return `${m} min`;
	return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function paceLabel(wpm: number | null): string {
	if (wpm === null || wpm <= 0) return "no pace";
	const n = Math.max(1, Math.round(wpm));
	return `${formatWordCount(n)} ${n === 1 ? "word" : "words"} a minute`;
}

/** The labels a session carries, in words (never colour alone). */
export function tagsOf(r: SessionRecord, s: SessionSettings): string[] {
	const k = classify(r, s);
	return [...(k.editing ? ["editing"] : []), ...(k.unreliable ? ["unreliable"] : []), ...(r.recovered ? ["recovered"] : [])];
}

/** One day's sessions that are long enough to list. */
export function sessionsList(records: readonly SessionRecord[], s: SessionSettings, nameOf: (r: SessionRecord) => string[]): HTMLElement {
	const listed = records.filter((r) => classify(r, s).listed);
	const list = el("ul", { class: "sf-session-list", attrs: { "aria-label": "Writing sessions" } });
	if (listed.length === 0) list.append(el("li", { class: "sf-muted", text: "No sessions of that length this day." }));
	for (const r of listed) {
		const tags = tagsOf(r, s);
		const words = r.net < 0 ? netLabel(r.net) : `${formatWordCount(r.net)}`;
		list.append(
			el(
				"li",
				{ class: "sf-session" },
				el("span", { class: "sf-session-when", text: `${clockOf(r.start)}–${clockOf(r.end)}, ${lengthLabel(lengthMinutes(r))}` }),
				el("span", { class: "sf-session-words", text: `${words} words, ${paceLabel(paceWpm(r))}` }),
				el("span", { class: "sf-muted sf-session-chapters", text: nameOf(r).join(", ") }),
				...tags.map((t) => el("span", { class: "sf-session-tag", text: t })),
			),
		);
	}
	return list;
}
