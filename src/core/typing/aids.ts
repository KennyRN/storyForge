/**
 * All the typing aids that act on a character just typed, in one place so the editor and the tests apply them the
 * same way (docs/typing-aids.md §2). One keystroke gives at most a few changes, undone together as one step; a name
 * correction that would overlap a smart-punctuation change is dropped, so the two never fight over the same text.
 */
import { nameCorrection, type NameIndex } from "./names";
import { smartPunctuationChanges, type AidChange } from "./smartPunctuation";

export interface AidOptions {
	smartPunctuation: boolean;
	/** The lower-case words that begin with an apostrophe. */
	elisions: ReadonlySet<string>;
	nameAutocorrect: boolean;
	names: NameIndex;
}

export function aidChanges(before: string, runStart: number, options: AidOptions): AidChange[] {
	const changes = options.smartPunctuation ? smartPunctuationChanges(before, runStart, { elisions: options.elisions }) : [];
	if (options.nameAutocorrect) {
		const name = nameCorrection(before, runStart, options.names, { smartPunctuation: options.smartPunctuation });
		if (name && !changes.some((c) => c.from < name.to && name.from < c.to)) changes.push(name);
	}
	return changes.sort((a, b) => a.from - b.from);
}
