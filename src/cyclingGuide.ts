import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { setIcon } from "obsidian";
import { countWordsInLine } from "./wordCount";
import { ICON_CYCLE_ALT } from "./icons";

const cyclingGuideLineDeco = Decoration.line({ attributes: { class: "sf-cycling-guide-line" } });

/** The small badge rendered at the bottom-right corner of a cycling-guide divider line. */
class CycleBadgeWidget extends WidgetType {
	eq(other: CycleBadgeWidget): boolean {
		return other instanceof CycleBadgeWidget;
	}

	toDOM(): HTMLElement {
		const badge = document.createElement("span");
		badge.className = "sf-cycling-guide-badge";
		const icon = badge.createSpan({ cls: "sf-cycling-guide-badge-icon" });
		setIcon(icon, ICON_CYCLE_ALT);
		return badge;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

const cyclingGuideBadgeDeco = Decoration.widget({ widget: new CycleBadgeWidget(), side: 1 });

/** Marks every line where the document's running word count (from the top of the file) crosses a new multiple of 500. */
function buildCyclingGuideDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	let cumulative = 0;
	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const before = cumulative;
		cumulative += countWordsInLine(line.text);
		if (Math.floor(cumulative / 500) > Math.floor(before / 500)) {
			builder.add(line.from, line.from, cyclingGuideLineDeco);
			builder.add(line.to, line.to, cyclingGuideBadgeDeco);
		}
	}
	return builder.finish();
}

/** CM6 extension for the "Cycling guide": a floating divider line after every 500-word mark, added/removed via a Compartment in main.ts. */
export const cyclingGuideViewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildCyclingGuideDecorations(view);
		}
		update(update: ViewUpdate): void {
			if (update.docChanged) {
				this.decorations = buildCyclingGuideDecorations(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations },
);
