import { readBookSynopsis } from "../../core/book";
import { commitDescription, commitSynopsis, rescueDescription, rescueSynopsis } from "../../core/fieldWriter";
import { readSeriesDescription } from "../../core/series";
import type { SectionRead } from "../../core/sectionBody";
import { bookFilePath, seriesFilePath } from "../../core/paths";
import { el } from "../kit/dom";
import type { AppModel } from "../model";
import { FieldBin, textField } from "./fieldCommitter";

/**
 * A small text editor for a section of a backstage note's body (a novel's synopsis, the series description).
 * It fills from disk once drawn; a heading that appears twice makes it read-only with a notice
 * asking the author to tidy the file (decision 42).
 */
function sectionField(model: AppModel, bin: FieldBin, options: { storedIn: string; label: string; what: string; read: () => Promise<SectionRead>; commit: (expected: string, next: string) => ReturnType<typeof commitSynopsis>; recover: (text: string) => ReturnType<typeof rescueSynopsis> }): HTMLElement {
	const project = model.running?.opened.project;
	const field = textField({
		label: options.label,
		readOnly: !project || !!model.running?.readOnlyReason,
		read: async () => {
			const r = await options.read();
			return r.status === "ok" ? r.text : "";
		},
		commit: options.commit,
		recover: options.recover,
		notify: (n) => model.notices.notify(n),
		placeholder: options.what,
		typing: () => model.typingOptions(),
		links: model.codexLinksFor(options.storedIn),
	}, bin);
	field.element.classList.add("sf-section-field");
	void options.read().then((r) => {
		if (r.status === "duplicate") {
			field.setReadOnly(true);
			field.element.dataset.duplicate = "true";
			field.element.title = "This heading appears more than once in the file";
			model.notices.notify({ kind: "warning", text: `${options.label} can't be edited here: its heading appears more than once in the file. Tidy the file in Obsidian.`, key: `duplicate-${options.label}`, sticky: true });
		} else field.show(r.text);
	});
	return field.element;
}

export function synopsisField(model: AppModel, bin: FieldBin, book: string, title: string): HTMLElement {
	const project = model.running!.opened.project;
	return sectionField(model, bin, {
		storedIn: bookFilePath(book),
		label: `Synopsis of ${title}`,
		what: "Synopsis",
		read: () => readBookSynopsis(project, book),
		commit: (expected, next) => commitSynopsis(project, book, expected, next),
		recover: (text) => rescueSynopsis(project, book, text),
	});
}

export function descriptionField(model: AppModel, bin: FieldBin): HTMLElement {
	const project = model.running!.opened.project;
	return sectionField(model, bin, {
		storedIn: seriesFilePath(),
		label: "Series description",
		what: "Description",
		read: () => readSeriesDescription(project),
		commit: (expected, next) => commitDescription(project, expected, next),
		recover: (text) => rescueDescription(project, text),
	});
}
