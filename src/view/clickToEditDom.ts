import {
	renderedOffsetToSourceOffset,
	resolveBlockByContent,
	splitIntoBlocks,
	splitListBlockIntoItems,
	type SourceBlock,
} from "../clickToCaret";

/**
 * The result of resolving a click to a block (and, within a list, a specific item) — everything
 * needed either to ship the block-level caret position outright, or to attempt the optional,
 * harder character-level refinement within it. DOM-dependent, so unlike clickToCaret.ts (which
 * this builds on and which carries the unit tests) this can only really be exercised live in
 * Obsidian.
 */
export interface ClickedBlockResult {
	block: SourceBlock;
	/** The element the character-level refinement (if attempted) should walk — the whole block's
	 * top-level element, or a specific `<li>` within it for a list. */
	scopeEl: Element;
	/** `scopeEl`'s own source text — `block.text` for most blocks, one item's text within a list. */
	scopeText: string;
	/** `scopeText`'s start offset in the whole chapter's source text. */
	scopeStart: number;
	/** The DOM range the click resolved to — only needed for character-level refinement. */
	range: Range;
}

/**
 * Resolves a mouse click inside a chapter's rendered body to the source block it landed in (and,
 * within a list, the specific item), matching the clicked top-level element's own `textContent`
 * against the chapter's source blocks rather than assuming "the Nth rendered child is the Nth
 * source block" (§6.8) — a heading directly followed by a paragraph with no blank line, a fenced
 * code block spanning a blank line, or user-added YAML frontmatter can all desync a naive index
 * match; see clickToCaret.ts's `splitIntoBlocks`/`resolveBlockByContent` for the specifics.
 *
 * Returns null when the click can't be resolved at all (no text under the point, click landed
 * outside `bodyEl`, or there are no source blocks) — callers should treat that as "don't edit"
 * rather than guess blindly.
 */
export function resolveClickedBlock(bodyEl: HTMLElement, source: string, clickX: number, clickY: number): ClickedBlockResult | null {
	const doc = bodyEl.ownerDocument;
	const caretRangeFromPoint = (doc as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null })
		.caretRangeFromPoint;
	if (!caretRangeFromPoint) return null;
	const range = caretRangeFromPoint.call(doc, clickX, clickY);
	if (!range) return null;

	const startNode = range.startContainer;
	const startEl = startNode.nodeType === Node.ELEMENT_NODE ? (startNode as Element) : startNode.parentElement;
	if (!startEl || !bodyEl.contains(startEl)) return null;

	// The direct child of bodyEl containing the click — the rendered top-level block.
	let topEl: Element | null = startEl;
	while (topEl && topEl.parentElement !== bodyEl) topEl = topEl.parentElement;
	if (!topEl) return null;

	const blockIndex = Array.from(bodyEl.children).indexOf(topEl);
	const blocks = splitIntoBlocks(source);
	const block = resolveBlockByContent(blocks, topEl.textContent ?? "", blockIndex);
	if (!block) return null;

	let scopeEl: Element = topEl;
	let scopeText = block.text;
	let scopeStart = block.start;

	if (topEl.tagName === "UL" || topEl.tagName === "OL") {
		const liEl = startEl.closest("li");
		if (liEl && liEl.parentElement === topEl) {
			const liIndex = Array.from(topEl.children).indexOf(liEl);
			const items = splitListBlockIntoItems(block.text);
			if (liIndex >= 0 && liIndex < items.length) {
				scopeEl = liEl;
				scopeText = items[liIndex].text;
				scopeStart = block.start + items[liIndex].start;
			}
		}
	}

	return { block, scopeEl, scopeText, scopeStart, range };
}

/**
 * A convenience wrapper around `resolveClickedBlock` for callers that only need the offset, not
 * the clicked element itself — the live continuous-mode path (`ContinuousReadThrough.ts`) calls
 * `resolveClickedBlock` directly instead, since it also needs `scopeEl`'s on-screen position for
 * the grafted editor's entry-scroll correction (inline-editor research brief §7).
 *
 * Resolves to the *block* the reader clicked and lands the caret at its start (hand-off brief
 * §2.6/§3.6). "Which paragraph" is robust and fully unit-tested underneath (clickToCaret.ts);
 * "which character within it" is the fragile half — `caretRangeFromPoint`'s two-legged browser
 * support, a `TreeWalker` over rendered text nodes, markdown-marker stripping for every inline
 * case — and is deliberately not attempted here. A writer who taps a paragraph to edit it will
 * usually move the cursor regardless, so this is honest about what it promises: tap a paragraph,
 * edit that paragraph. See `refineToCharacterOffset` for the deferred other half, kept available
 * but unused for now.
 */
export function resolveClickedSourceOffset(bodyEl: HTMLElement, source: string, clickX: number, clickY: number): number | null {
	const result = resolveClickedBlock(bodyEl, source, clickX, clickY);
	return result?.scopeStart ?? null;
}

/**
 * The deferred, character-level half (§3.6) — not called from the shipped path above. Refines a
 * resolved block/item down to the exact character the click landed on, by walking `scopeEl`'s
 * rendered text nodes and mapping the position back through `clickToCaret.ts`'s marker-stripping.
 * Kept as a separate, independently callable function precisely so it can be switched on (or back
 * off) without touching `resolveClickedSourceOffset` or its callers.
 */
export function refineToCharacterOffset(result: ClickedBlockResult): number {
	const renderedOffset = renderedOffsetWithinElement(result.scopeEl, result.range);
	return result.scopeStart + renderedOffsetToSourceOffset(result.scopeText, renderedOffset);
}

/** Counts how many rendered characters precede `range`'s start position within `scopeEl`. */
function renderedOffsetWithinElement(scopeEl: Element, range: Range): number {
	const walker = scopeEl.ownerDocument.createTreeWalker(scopeEl, NodeFilter.SHOW_TEXT);
	let offset = 0;
	let node: Node | null;
	while ((node = walker.nextNode())) {
		if (node === range.startContainer) return offset + range.startOffset;
		offset += node.textContent?.length ?? 0;
	}
	// The click landed on an element boundary rather than inside a text node — fall back to the
	// end of the scope's rendered text rather than refusing to edit at all.
	return offset;
}

/** True when `target` is (or is inside) a rendered link — internal wikilink or external — so the
 * click should navigate rather than start editing (hand-off brief §2.8). Obsidian's own rendered
 * output already wires these up for navigation; this check exists purely so *our* click-to-edit
 * handler steps out of the way rather than double-handling the click. */
export function isLinkClick(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest("a") !== null;
}
