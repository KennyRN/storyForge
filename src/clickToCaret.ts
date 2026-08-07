/**
 * Click-to-caret source-offset mapping (continuous-mode hand-off brief §2.6 — flagged there as the
 * piece most likely to be under-built). Rendered markdown and source markdown differ in length and
 * shape: `**bold**` renders as `bold`, a wikilink shows its display text rather than its target, a
 * heading or list item has no visible marker. Clicking rendered text must land the caret on the
 * exact word the writer clicked, not "roughly in that paragraph".
 *
 * This module maps a character offset into a block's *rendered* plain text back to the
 * corresponding offset in that block's *source* text. It is a deliberately narrow re-implementation
 * of just enough of Obsidian's inline markdown stripping to keep that mapping honest for the cases
 * that matter here — emphasis, inline code, links/wikilinks, and leading block markers (headings,
 * list bullets, blockquotes) — not a full markdown parser.
 */

export interface RenderedMapping {
	/** The block's rendered plain text, as a reader would see it (no markdown syntax). */
	renderedText: string;
	/** renderedText[i] came from source[sourceOffsets[i]] — same length as renderedText. */
	sourceOffsets: number[];
}

/** Leading block-level markers with no rendered representation at all: heading hashes, list
 * bullets (ordered or unordered), and blockquote markers. Only matched at the very start of a
 * block's source text. */
const LEADING_MARKER_RE = /^(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/;

/**
 * Finds the closing position of a single-character emphasis marker (`*` or `_`), skipping past any
 * nested two-character spans (`**`, `__`, `~~`) and inline code so a bold span nested inside an
 * italic span (`*italic **bold** end*`) doesn't make the italic's own closing marker look like it's
 * one of the bold pair's asterisks. Returns -1 if there's no unnested closing marker.
 */
function findSingleMarkerClose(source: string, marker: string, start: number): number {
	let j = start;
	while (j < source.length) {
		const two = source.slice(j, j + 2);
		if (two === "**" || two === "__" || two === "~~") {
			const close = source.indexOf(two, j + 2);
			if (close !== -1) {
				j = close + 2;
				continue;
			}
		}
		if (source[j] === "`") {
			const close = source.indexOf("`", j + 1);
			if (close !== -1) {
				j = close + 1;
				continue;
			}
		}
		if (source[j] === marker && source[j + 1] !== marker) return j;
		j++;
	}
	return -1;
}

/**
 * Builds the rendered-to-source mapping for one block's source markdown (a paragraph, list item,
 * heading line, etc. — whatever the caller has already segmented as one block). Recurses into
 * emphasis/strikethrough spans so nested formatting (e.g. bold inside italic) still maps correctly.
 */
export function buildRenderedMapping(source: string): RenderedMapping {
	const renderedChars: string[] = [];
	const sourceOffsets: number[] = [];
	const emit = (ch: string, sourceIndex: number): void => {
		renderedChars.push(ch);
		sourceOffsets.push(sourceIndex);
	};

	let i = 0;
	const leadingMatch = LEADING_MARKER_RE.exec(source);
	if (leadingMatch) i = leadingMatch[0].length;

	const n = source.length;
	while (i < n) {
		// Wikilink: [[target]] or [[target|display]] — renders as the display text (or the target
		// when there's no pipe), never the target path itself once a display name is given.
		if (source.startsWith("[[", i)) {
			const end = source.indexOf("]]", i + 2);
			if (end !== -1) {
				const inner = source.slice(i + 2, end);
				const pipeIndex = inner.indexOf("|");
				const displayStart = i + 2 + (pipeIndex === -1 ? 0 : pipeIndex + 1);
				const display = pipeIndex === -1 ? inner : inner.slice(pipeIndex + 1);
				for (let k = 0; k < display.length; k++) emit(display[k], displayStart + k);
				i = end + 2;
				continue;
			}
		}
		// Markdown link: [text](url) — renders as just the link text.
		if (source[i] === "[") {
			const closeBracket = source.indexOf("]", i + 1);
			if (closeBracket !== -1 && source[closeBracket + 1] === "(") {
				const closeParen = source.indexOf(")", closeBracket + 2);
				if (closeParen !== -1) {
					const textStart = i + 1;
					const text = source.slice(textStart, closeBracket);
					for (let k = 0; k < text.length; k++) emit(text[k], textStart + k);
					i = closeParen + 1;
					continue;
				}
			}
		}
		// Bold/strikethrough (two-character markers): **bold**, __bold__, ~~strike~~.
		const twoCharMarker = source.slice(i, i + 2);
		if ((twoCharMarker === "**" || twoCharMarker === "__" || twoCharMarker === "~~") && source[i + 2] !== undefined) {
			const end = source.indexOf(twoCharMarker, i + 2);
			if (end !== -1 && end > i + 2) {
				const innerStart = i + 2;
				const inner = buildRenderedMapping(source.slice(innerStart, end));
				for (let k = 0; k < inner.renderedText.length; k++) emit(inner.renderedText[k], innerStart + inner.sourceOffsets[k]);
				i = end + 2;
				continue;
			}
		}
		// Italic (single-character markers): *italic*, _italic_ — guarded against list bullets
		// ("* " at a line start) and mid-word underscores by requiring no space right after the marker.
		if ((source[i] === "*" || source[i] === "_") && source[i + 1] !== " " && source[i + 1] !== undefined) {
			const marker = source[i];
			const end = findSingleMarkerClose(source, marker, i + 1);
			if (end !== -1 && end > i + 1) {
				const innerStart = i + 1;
				const inner = buildRenderedMapping(source.slice(innerStart, end));
				for (let k = 0; k < inner.renderedText.length; k++) emit(inner.renderedText[k], innerStart + inner.sourceOffsets[k]);
				i = end + 1;
				continue;
			}
		}
		// Inline code: `code` — contents are rendered verbatim, so no recursion needed.
		if (source[i] === "`") {
			const end = source.indexOf("`", i + 1);
			if (end !== -1) {
				for (let k = i + 1; k < end; k++) emit(source[k], k);
				i = end + 1;
				continue;
			}
		}
		emit(source[i], i);
		i++;
	}

	return { renderedText: renderedChars.join(""), sourceOffsets };
}

export interface SourceBlock {
	/** The block's own source text, blank-line separators stripped. */
	text: string;
	/** This block's start offset within the whole chapter's source text. */
	start: number;
}

/**
 * Splits a chapter's source text into the same block units Obsidian's own renderer produces one
 * top-level rendered element per — paragraphs, headings, and runs of consecutive list/blockquote
 * lines (no blank line between them counts as one block, matching how a `<ul>` holds every `<li>`
 * of a list as a single top-level element). Used to line up a click on a *rendered* top-level
 * element with the exact source text it came from.
 */
export function splitIntoBlocks(source: string): SourceBlock[] {
	const blocks: SourceBlock[] = [];
	const separatorRe = /\n[ \t]*\n+/g;
	let lastEnd = 0;
	let match: RegExpExecArray | null;
	while ((match = separatorRe.exec(source))) {
		const text = source.slice(lastEnd, match.index);
		if (text.trim().length > 0) blocks.push({ text, start: lastEnd });
		lastEnd = match.index + match[0].length;
	}
	const tail = source.slice(lastEnd);
	if (tail.trim().length > 0) blocks.push({ text: tail, start: lastEnd });
	return blocks;
}

/** True for a line that opens a new list item — used to split a list block's source text back
 * into one chunk per `<li>`, since a list's `<li>`s are siblings of one rendered top-level element
 * rather than block-level elements in their own right. */
const LIST_ITEM_LINE_RE = /^[ \t]*([-*+]\s+|\d+[.)]\s+)/;

/**
 * Splits a list block's source text into one chunk per list item (a line matching
 * `LIST_ITEM_LINE_RE`, plus any following lines up until the next item line — a simple model that
 * doesn't handle multi-paragraph list items, which is an acceptable gap here). Offsets are
 * relative to the start of `blockText` — add the block's own `start` to get whole-chapter offsets.
 */
export function splitListBlockIntoItems(blockText: string): SourceBlock[] {
	const lines = blockText.split("\n");
	const items: SourceBlock[] = [];
	let cursor = 0;
	let currentStart: number | null = null;
	let currentLines: string[] = [];

	const flush = (): void => {
		if (currentStart !== null) items.push({ text: currentLines.join("\n"), start: currentStart });
		currentStart = null;
		currentLines = [];
	};

	for (const line of lines) {
		if (LIST_ITEM_LINE_RE.test(line)) {
			flush();
			currentStart = cursor;
			currentLines = [line];
		} else if (currentStart !== null) {
			currentLines.push(line);
		}
		cursor += line.length + 1; // account for the '\n' split() consumed
	}
	flush();
	return items;
}

/**
 * The load-bearing operation itself: given a block's source text and a character offset into its
 * *rendered* plain text (from wherever the click landed), returns the matching offset into the
 * block's *source* text. Clamps to the nearest valid source position at either end rather than
 * throwing, since a click can legitimately land at the very start or end of a block.
 */
export function renderedOffsetToSourceOffset(source: string, renderedOffset: number): number {
	const { renderedText, sourceOffsets } = buildRenderedMapping(source);
	if (sourceOffsets.length === 0) return source.length;
	if (renderedOffset <= 0) return sourceOffsets[0];
	if (renderedOffset >= renderedText.length) return sourceOffsets[sourceOffsets.length - 1] + 1;
	return sourceOffsets[renderedOffset];
}
