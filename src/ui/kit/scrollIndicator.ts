/**
 * Scrollbars are hidden at rest, everywhere (Brief 11, decision 62). While something scrolls, a thin bar shows where you
 * are and how much there is, and fades a moment after scrolling stops. One document-level listener serves every scroller
 * (a `scroll` event doesn't bubble, but it can be caught on the way down), and the bar is drawn in the page body, so no
 * scroller's own contents or clipping change. The bar never takes a click: the text beneath it does.
 */

const FADE_AFTER_MS = 1000;
const MIN_THUMB = 24;
const INSET = 2;

export function installScrollIndicator(doc: Document = document): () => void {
	const bars = new WeakMap<Element, { bar: HTMLElement; timer: number | undefined }>();

	const place = (scroller: Element, bar: HTMLElement): boolean => {
		const { scrollHeight, clientHeight, scrollTop } = scroller;
		if (scrollHeight <= clientHeight + 1) return false;
		const box = scroller.getBoundingClientRect();
		const track = box.height - INSET * 2;
		const thumb = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * track);
		const top = (scrollTop / (scrollHeight - clientHeight)) * (track - thumb);
		bar.style.height = `${thumb}px`;
		bar.style.left = `${box.right - 5 - INSET}px`;
		bar.style.top = `${box.top + INSET + top}px`;
		return true;
	};

	const onScroll = (e: Event): void => {
		const scroller = e.target;
		if (!(scroller instanceof Element)) return; // the document itself never scrolls here
		let entry = bars.get(scroller);
		if (!entry) {
			const bar = doc.createElement("div");
			bar.className = "sf-scrollbar";
			bar.setAttribute("aria-hidden", "true");
			doc.body.append(bar);
			entry = { bar, timer: undefined };
			bars.set(scroller, entry);
		}
		const { bar } = entry;
		if (!place(scroller, bar)) {
			bar.classList.remove("is-showing");
			return;
		}
		bar.classList.add("is-showing");
		window.clearTimeout(entry.timer);
		entry.timer = window.setTimeout(() => bar.classList.remove("is-showing"), FADE_AFTER_MS);
	};

	doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
	return () => doc.removeEventListener("scroll", onScroll, { capture: true });
}
