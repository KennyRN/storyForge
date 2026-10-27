import { readBookSynopsis } from "../../core/book";
import { commitDescription, commitSynopsis } from "../../core/fieldWriter";
import { readSeriesDescription } from "../../core/series";
import type { SectionRead } from "../../core/sectionBody";
import { el } from "../kit/dom";
import type { AppModel } from "../model";
import { textField } from "./fieldCommitter";

/**
 * A text area for a section of a backstage note's body (a novel's synopsis, the series description).
 * It fills from disk once drawn; a heading that appears twice makes it read-only with a notice
 * asking the author to tidy the file (decision 42).
 */
function sectionField(model: AppModel, options: { label: string; what: string; read: () => Promise<SectionRead>; commit: (expected: string, next: string) => ReturnType<typeof commitSynopsis> }): HTMLElement {
	const project = model.running?.opened.project;
	const field = textField({
		label: options.label,
		readOnly: !project || !!model.running?.readOnlyReason,
		read: async () => {
			const r = await options.read();
			return r.status === "ok" ? r.text : "";
		},
		commit: options.commit,
		notify: (n) => model.notices.notify(n),
	});
	field.element.classList.add("sf-section-field");
	field.element.placeholder = options.what;
	void options.read().then((r) => {
		if (r.status === "duplicate") {
			field.element.readOnly = true;
			field.element.dataset.duplicate = "true";
			field.element.title = "This heading appears more than once in the file";
			model.notices.notify({ text: `${options.label} can't be edited here: its heading appears more than once in the file. Tidy the file in Obsidian.`, key: `duplicate-${options.label}`, sticky: true });
		} else field.show(r.text);
	});
	return field.element;
}

export function synopsisField(model: AppModel, book: string, title: string): HTMLElement {
	const project = model.running!.opened.project;
	return sectionField(model, {
		label: `Synopsis of ${title}`,
		what: "Synopsis",
		read: () => readBookSynopsis(project, book),
		commit: (expected, next) => commitSynopsis(project, book, expected, next),
	});
}

export function descriptionField(model: AppModel): HTMLElement {
	const project = model.running!.opened.project;
	return sectionField(model, {
		label: "Series description",
		what: "Description",
		read: () => readSeriesDescription(project),
		commit: (expected, next) => commitDescription(project, expected, next),
	});
}
