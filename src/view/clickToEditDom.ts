import { renderedOffsetToSourceOffset, splitIntoBlocks, splitListBlockIntoItems } from "../clickToCaret";

/**
 * Maps a mouse click inside a chapter's rendered body back to the exact source offset it landed on
 * (continuous-mode hand-off brief §2.6). DOM-dependent, so unlike clickToCaret.ts (which this
 * builds on and which carries the unit tests) this can only really be exercised live in Obsidian.
 *
 * Works by positional alignment: MarkdownRenderer renders one top-level DOM element per source
 * block — paragraph, heading, list, blockquote — in source order (see clickToCaret.ts's
 * splitIntoBlocks), so the Nth rendered child of `bodyEl` corresponds to the Nth source block. A
 * clicked `<li>` is aligned the same way against that list block's own per-item split, since a
 * whole list is one top-level rendered element (a `<ul>`/`<ol>`) holding every item as a sibling,
 * not a block-level element of its own.
 *
 * Returns null when the click can't be resolved (no text under the point, click landed outside
 * `bodyEl`, or the rendered structure and the source split disagree on block count) — callers
 * should treat that as "don't edit" rather than guess.
 */
export function resolveClickedSourceOffset(bodyEl: HTMLElement, source: string, clickX: number, clickY: number): number | null {
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
	if (blockIndex < 0 || blockIndex >= blocks.length) return null;
	const block = blocks[blockIndex];

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

	const renderedOffset = renderedOffsetWithinElement(scopeEl, range);
	return scopeStart + renderedOffsetToSourceOffset(scopeText, renderedOffset);
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
