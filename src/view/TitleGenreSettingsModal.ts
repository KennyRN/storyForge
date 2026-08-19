import { App, Modal } from "obsidian";
import type { TitleForgeController } from "../titleforge/TitleForgeController";
import type { TitleForgeSettings } from "../titleforge/settings";
import { renderTitleHistoryList } from "./TitleHistoryModal";

/** Which of titleForge's persisted genre settings this modal instance reads/writes - `lastGenre` for
 * the series name + first book title fields (they share a genre), `lastNovelGenre` for the
 * standalone tab's novel title field (its own genre, independent of series genre). */
export type TitleGenreSettingKey = Extract<keyof TitleForgeSettings, "lastGenre" | "lastNovelGenre">;

export interface TitleGenreSettingsCallbacks {
	/** A genre was picked. */
	onGenreChanged: () => void;
	/** A past roll from history was picked. */
	onHistorySelect: (title: string) => void;
}

/**
 * Genre picker + recent-rolls history, opened from a title field's cog icon. One modal shape reused
 * everywhere a titleForge-backed field needs a genre + history picker - the series name field
 * (genreSettingKey "lastGenre", shared with the first book title), and the standalone tab's novel
 * title field (genreSettingKey "lastNovelGenre", its own). Same look and behaviour throughout; only
 * which genre setting and which history array differ. No heading of its own - both panes are
 * self-explanatory at a glance - and a fixed size, so it doesn't jump around as either pane's content
 * changes; each pane scrolls independently within it.
 *
 * Lists every genre the current generator declares, flat - titleForge's `GeneratorSpec.genres` has
 * no parent/subgenre structure (that's a different system, Codex types' `parentId`), so e.g.
 * title-composer's "Epic fantasy" is already a top-level entry, not nested under a "Fantasy" parent.
 * This renders whatever the generator provides; nothing is filtered down to a curated few.
 *
 * The picked genre is saved via the controller into whichever setting `genreSettingKey` names, so
 * it's the same genre titleForge's own workbench view (for "lastGenre") or the onboarding modal's
 * dice icons pick up on every future roll.
 */
export class TitleGenreSettingsModal extends Modal {
	constructor(
		app: App,
		private controller: TitleForgeController,
		private genreSettingKey: TitleGenreSettingKey,
		private history: string[],
		private historyHeading: string,
		private callbacks: TitleGenreSettingsCallbacks,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("sf-title-gen-settings-modal-el");
		contentEl.addClass("sf-title-gen-settings-modal");

		const spec = this.controller.getGeneratorById(this.controller.settings.lastGeneratorId) ?? this.controller.generators[0];
		if (spec) {
			const genreListEl = contentEl.createDiv({ cls: "sf-title-gen-genre-list" });
			for (const genre of spec.genres) {
				const item = genreListEl.createDiv({ cls: "sf-title-gen-genre-item", text: genre.label });
				item.toggleClass("is-active", genre.id === this.controller.settings[this.genreSettingKey]);
				item.addEventListener("click", () => void this.pickGenre(genre.id));
			}
		}

		contentEl.createEl("h3", { text: this.historyHeading });
		renderTitleHistoryList(contentEl, this.history, (title) => {
			this.callbacks.onHistorySelect(title);
			this.close();
		});
	}

	private async pickGenre(genreId: string): Promise<void> {
		this.controller.settings[this.genreSettingKey] = genreId;
		await this.controller.saveSettings();
		this.callbacks.onGenreChanged();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
