import { AbstractInputSuggest, App, setIcon } from "obsidian";
import { codexTypeIcon } from "../codex";
import type { CastMember } from "../recommend/types";

/** Typeahead + dropdown picker for Dossier “Search Codex entity”. */
export class DossierEntitySuggest extends AbstractInputSuggest<CastMember> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private getCast: () => CastMember[],
		private onChoose: (entity: CastMember) => void,
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): CastMember[] {
		const q = query.trim().toLowerCase();
		const cast = [...this.getCast()].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		);
		if (!q) return cast;
		return cast.filter(
			(c) =>
				c.name.toLowerCase().includes(q) ||
				c.aliases.some((a) => a.toLowerCase().includes(q)),
		);
	}

	renderSuggestion(value: CastMember, el: HTMLElement): void {
		el.addClass("sf-recommend-dossier-suggest-item");
		const iconId = codexTypeIcon(value.type);
		if (iconId) setIcon(el.createSpan({ cls: "sf-icon" }), iconId);
		el.createSpan({ text: value.name });
	}

	selectSuggestion(value: CastMember, _evt: MouseEvent | KeyboardEvent): void {
		this.setValue(value.name);
		this.close();
		this.onChoose(value);
	}
}
