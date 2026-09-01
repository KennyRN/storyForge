import "obsidian";

function paintedColor(doc: Document, value: string): string {
	const probe = doc.body.createSpan();
	probe.style.color = value;
	const painted = doc.defaultView?.getComputedStyle(probe).color ?? "";
	probe.remove();
	return painted;
}

/** True when `textColor` paints the same as the UI background (title would vanish). */
export function titleMatchesUiBackground(doc: Document, textColor: string): boolean {
	return paintedColor(doc, textColor) === paintedColor(doc, "var(--background-primary)");
}

/** Hard 1px offset shadow in `boxColor` when title text would match the UI background. */
export function resolveTitleShadow(doc: Document, textColor: string, boxColor: string): string {
	if (!titleMatchesUiBackground(doc, textColor)) return "none";
	return `1px 1px 0 ${boxColor}`;
}
