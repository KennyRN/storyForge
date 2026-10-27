import { DEFAULT_ELISIONS } from "../defaults";
import { smartPunctuationChanges, type AidChange } from "../smartPunctuation";

export interface Simulated {
	/** The document after everything was typed and every aid applied. */
	doc: string;
	/** Every step the aid took, in order, with the text it replaced (to undo it). */
	steps: { changes: AidChange[]; replaced: string[]; docBefore: string; docAfter: string }[];
	/** What was typed, character by character, with no aid at all. */
	typed: string;
}

/**
 * Types `input` one character at a time after `initial` (text that was already there), applying the smart
 * punctuation aid after each, as the editor does. A newline ends the run, as Return does in the editor.
 */
export function typeWith(input: string, options: { initial?: string; elisions?: readonly string[] } = {}): Simulated {
	const elisions = new Set((options.elisions ?? DEFAULT_ELISIONS).map((e) => e.toLowerCase()));
	let doc = options.initial ?? "";
	let runStart = doc.length;
	const steps: Simulated["steps"] = [];
	for (const ch of input) {
		if (ch === "\n") {
			doc += ch;
			runStart = doc.length;
			continue;
		}
		doc += ch;
		const changes = smartPunctuationChanges(doc, runStart, { elisions });
		if (changes.length === 0) continue;
		const docBefore = doc;
		let next = doc;
		for (const c of [...changes].sort((a, b) => b.from - a.from)) next = next.slice(0, c.from) + c.insert + next.slice(c.to);
		steps.push({ changes, replaced: changes.map((c) => doc.slice(c.from, c.to)), docBefore, docAfter: next });
		doc = next;
	}
	return { doc, steps, typed: (options.initial ?? "") + input };
}

/** Undoes every aid step, newest first, and returns the document as it would be with nothing converted. */
export function undoAll(sim: Simulated): string {
	let doc = sim.doc;
	for (const step of [...sim.steps].reverse()) doc = revert(doc, step);
	return doc;
}

/**
 * Reverts one step. At that moment the document is the step's result plus whatever was typed after it (appended, so
 * offsets don't move), because newer steps have already been reverted.
 */
function revert(doc: string, step: Simulated["steps"][number]): string {
	const ordered = step.changes.map((c, i) => ({ c, replaced: step.replaced[i] })).sort((a, b) => a.c.from - b.c.from);
	// Where each replacement sits in the step's result, then replace from the end so earlier offsets don't move.
	let delta = 0;
	const placed = ordered.map(({ c, replaced }) => {
		const at = c.from + delta;
		delta += c.insert.length - replaced.length;
		return { at, length: c.insert.length, replaced };
	});
	let out = doc;
	for (const { at, length, replaced } of placed.reverse()) out = out.slice(0, at) + replaced + out.slice(at + length);
	return out;
}
