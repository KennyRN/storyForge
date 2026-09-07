/**
 * Partition prose into narration vs quoted spans for a declared book quote style.
 * First-person narrator binding uses narration spans only.
 *
 * Span pairing never crosses paragraph boundaries (blank line resets).
 * Single-quote mode defaults ambiguous trailing apostrophes to possessive.
 */

export type DialogueQuoteStyle = "double" | "single";

export type SpanKind = "narration" | "quoted";

export interface QuoteSpan {
	kind: SpanKind;
	/** Inclusive start offset in the source string. */
	start: number;
	/** Exclusive end offset in the source string. */
	end: number;
}

const DBL_OPEN = "\u201C"; // “
const DBL_CLOSE = "\u201D"; // ”
const SGL_OPEN = "\u2018"; // ‘
const SGL_CLOSE = "\u2019"; // ’
const STRAIGHT_DBL = '"';
const STRAIGHT_SGL = "'";

const FIRST_PERSON_RE = /\b(I|me|my|mine|myself)\b/gi;

/** Normalise stored / unknown values to a supported quote style. */
export function normalizeDialogueQuoteStyle(raw: unknown): DialogueQuoteStyle {
	return raw === "single" ? "single" : "double";
}

function isLetter(ch: string | undefined): boolean {
	return !!ch && /[A-Za-z]/.test(ch);
}

function isDialogueEndPunct(ch: string | undefined): boolean {
	return ch === "." || ch === "!" || ch === "?" || ch === "," || ch === ";" || ch === ":";
}

/**
 * True when an apostrophe at `i` is more likely a possessive/contraction than a quote close.
 * House style is `James'` (not `James's`); letter-before alone is not a close signal.
 */
function isLikelyPossessiveOrContraction(text: string, i: number): boolean {
	const prev = text[i - 1];
	if (!isLetter(prev)) return false;
	const next = text[i + 1];
	// End of paragraph / string while a quote is open is handled by the caller.
	if (next === undefined) return false;
	// Letter before + more content → possessive / contraction (safe default).
	return true;
}

/** Opening straight/curly single quote for dialogue (not a mid-word apostrophe). */
function isLikelySingleOpen(text: string, i: number): boolean {
	const ch = text[i];
	if (ch === SGL_OPEN) return true;
	if (ch !== STRAIGHT_SGL) return false;
	const prev = text[i - 1];
	const next = text[i + 1];
	if (isLetter(prev)) return false; // contraction / possessive
	if (!isLetter(next) && next !== undefined) return false;
	return prev === undefined || /\s|[([{"“‘-]/.test(prev);
}

interface ParaSlice {
	start: number;
	text: string;
}

/** Split on blank lines; each slice keeps its absolute start offset. */
function paragraphSlices(text: string): ParaSlice[] {
	const slices: ParaSlice[] = [];
	let start = 0;
	const re = /\n[ \t]*\n+/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		slices.push({ start, text: text.slice(start, m.index) });
		start = m.index + m[0].length;
	}
	slices.push({ start, text: text.slice(start) });
	return slices;
}

function flush(
	spans: QuoteSpan[],
	kind: SpanKind,
	absStart: number,
	from: number,
	to: number,
): void {
	if (to <= from) return;
	const last = spans[spans.length - 1];
	if (last && last.kind === kind && last.end === absStart + from) {
		last.end = absStart + to;
		return;
	}
	spans.push({ kind, start: absStart + from, end: absStart + to });
}

function partitionParagraph(text: string, absStart: number, style: DialogueQuoteStyle): QuoteSpan[] {
	const spans: QuoteSpan[] = [];
	let cursor = 0;
	let inQuote = false;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];

		if (style === "double") {
			if (ch === DBL_OPEN || (ch === STRAIGHT_DBL && !inQuote)) {
				flush(spans, "narration", absStart, cursor, i);
				inQuote = true;
				cursor = i + 1;
				i++;
				continue;
			}
			if (ch === DBL_CLOSE || (ch === STRAIGHT_DBL && inQuote)) {
				flush(spans, "quoted", absStart, cursor, i);
				inQuote = false;
				cursor = i + 1;
				i++;
				continue;
			}
			i++;
			continue;
		}

		// Single-quote style
		if (!inQuote) {
			if (isLikelySingleOpen(text, i)) {
				flush(spans, "narration", absStart, cursor, i);
				inQuote = true;
				cursor = i + 1;
				i++;
				continue;
			}
			i++;
			continue;
		}

		// In quote — look for close. Curly close is preferred; straight/curly ’ are ambiguous.
		if (ch === SGL_CLOSE || ch === STRAIGHT_SGL) {
			const prev = text[i - 1];
			if (isDialogueEndPunct(prev)) {
				flush(spans, "quoted", absStart, cursor, i);
				inQuote = false;
				cursor = i + 1;
				i++;
				continue;
			}
			if (i === text.length - 1) {
				// Outstanding open at paragraph end → close.
				flush(spans, "quoted", absStart, cursor, i);
				inQuote = false;
				cursor = i + 1;
				i++;
				continue;
			}
			if (isLikelyPossessiveOrContraction(text, i)) {
				i++;
				continue;
			}
			// Outstanding open and not possessive → close.
			flush(spans, "quoted", absStart, cursor, i);
			inQuote = false;
			cursor = i + 1;
			i++;
			continue;
		}
		i++;
	}

	flush(spans, inQuote ? "quoted" : "narration", absStart, cursor, text.length);
	return spans;
}

/** Partition `text` into narration and quoted spans for the given book quote style. */
export function partitionQuoteSpans(text: string, style: DialogueQuoteStyle): QuoteSpan[] {
	const out: QuoteSpan[] = [];
	for (const para of paragraphSlices(text)) {
		if (para.text.length === 0) continue;
		out.push(...partitionParagraph(para.text, para.start, style));
	}
	if (out.length === 0 && text.length === 0) {
		return [{ kind: "narration", start: 0, end: 0 }];
	}
	return out;
}

export function spanKindAt(spans: QuoteSpan[], offset: number): SpanKind {
	for (const s of spans) {
		if (offset >= s.start && offset < s.end) return s.kind;
	}
	// Gaps (the quote glyphs themselves) count as neither; treat as non-narration for binding.
	return "quoted";
}

export function isNarrationOffset(spans: QuoteSpan[], offset: number): boolean {
	return spanKindAt(spans, offset) === "narration";
}

/**
 * True when a first-person form (I / me / my / mine / myself) occurs in a narration span.
 * Forms inside quoted spans are ignored (left to the dialogue path).
 */
export function hasFirstPersonInNarration(text: string, style: DialogueQuoteStyle): boolean {
	const spans = partitionQuoteSpans(text, style);
	FIRST_PERSON_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = FIRST_PERSON_RE.exec(text)) !== null) {
		if (isNarrationOffset(spans, m.index)) return true;
	}
	return false;
}
