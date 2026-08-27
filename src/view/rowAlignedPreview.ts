/**
 * Positions preview slots in the interface modal's right-hand preview column so each
 * slot shares the same viewport Y (and height) as its source row on the left.
 */

const painters = new WeakMap<HTMLElement, (slot: HTMLElement) => void>();

let activeRefresh: (() => void) | null = null;

export function refreshAlignedPreview(): void {
	activeRefresh?.();
}

export function markAlignedPreview(source: HTMLElement, paint: (slot: HTMLElement) => void): void {
	source.addClass("sf-align-preview-source");
	painters.set(source, paint);
}

function scrollParents(el: HTMLElement): HTMLElement[] {
	const parents: HTMLElement[] = [];
	let node: HTMLElement | null = el;
	while (node) {
		const { overflowY } = getComputedStyle(node);
		if (overflowY === "auto" || overflowY === "scroll") parents.push(node);
		node = node.parentElement;
	}
	return parents;
}

/** Bind every `.sf-align-preview-source` under `sourcesRoot` into `previewEl`. Returns a disposer. */
export function mountAlignedPreviewColumn(previewEl: HTMLElement, sourcesRoot: HTMLElement): () => void {
	previewEl.empty();
	previewEl.addClass("sf-row-preview-host");
	const sources = Array.from(sourcesRoot.querySelectorAll<HTMLElement>(".sf-align-preview-source"));
	const slots = sources.map((source) => {
		const slot = previewEl.createDiv({ cls: "sf-row-preview-slot" });
		const paint = painters.get(source);
		paint?.(slot);
		return { source, slot, paint };
	});

	const layout = () => {
		const pane = previewEl.getBoundingClientRect();
		for (const { source, slot } of slots) {
			const row = source.getBoundingClientRect();
			slot.style.top = `${row.top - pane.top}px`;
			slot.style.height = `${Math.max(row.height, 0)}px`;
			const fullyAbove = row.bottom < pane.top;
			const fullyBelow = row.top > pane.bottom;
			slot.toggleClass("sf-settings-hidden", fullyAbove || fullyBelow);
		}
	};

	const refresh = () => {
		for (const { slot, paint } of slots) paint?.(slot);
		layout();
	};

	activeRefresh = refresh;
	const parents = new Set<HTMLElement>([sourcesRoot]);
	for (const source of sources) {
		for (const parent of scrollParents(source)) parents.add(parent);
	}
	for (const parent of parents) parent.addEventListener("scroll", layout, { passive: true });
	window.addEventListener("resize", layout);
	const observer = new ResizeObserver(layout);
	observer.observe(previewEl);
	observer.observe(sourcesRoot);
	for (const source of sources) observer.observe(source);
	requestAnimationFrame(() => requestAnimationFrame(layout));

	return () => {
		if (activeRefresh === refresh) activeRefresh = null;
		for (const parent of parents) parent.removeEventListener("scroll", layout);
		window.removeEventListener("resize", layout);
		observer.disconnect();
		previewEl.empty();
		previewEl.removeClass("sf-row-preview-host");
	};
}
