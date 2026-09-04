import type { SeriesStrategy } from "./engine/types.js";

/**
 * TitleForgeModal's tabs. "series", "webFiction" and "novels" each pick from their own list of
 * generators (see TAB_TRADITIONS in view/TitleForgePanel.ts); "kept" pools every kept title
 * across all of them instead.
 */
export type TitleForgeTab = "series" | "webFiction" | "novels" | "kept";

/**
 * Which fixed set of tabs/generators titleForge is showing for this open — see SCOPE_TABS in
 * view/TitleForgePanel.ts. "all" is titleForge's original, still-default behaviour (every tab,
 * every tradition) used by the ribbon icon, the command, and TitleForgeSettingsModal's "Open
 * titleForge" button — none of those know what kind of title is wanted. "series" and "novels" are
 * the two fixed, narrower views used when titleForge is opened from a specific naming context
 * (SeriesTitleModal.ts's and NovelTitleModal.ts's dice icons, respectively), each restricted to
 * the tabs/traditions and kept-titles pool relevant to that context.
 */
export type TitleForgeScope = "all" | "series" | "novels";

/** `TitleForgeController.openModal()`'s params — shared type so Controller/Modal/Panel agree on
 * the same shape. `scope` defaults to "all" when omitted; `onUse`, when supplied, is the "this
 * title is wanted back" callback for a per-row "use this title" action — see TitleForgePanel.ts's
 * `renderTitleRow`. Omitted entirely (the ribbon icon, the command, TitleForgeSettingsModal's
 * "Open titleForge" button), titleForge behaves exactly as it always has. */
export interface TitleForgeOpenOptions {
	scope?: TitleForgeScope;
	onUse?: (title: string) => void;
}

/**
 * titleForge's own settings shape. Persisted by `storage.ts` to its own vault
 * file — deliberately not folded into storyForge's `data.json` — so an
 * extraction only has to repoint the storage path, not restructure the shape.
 *
 * No `lastGeneratorId` here (a settings file from before this shape has one, now unread, same as
 * the old `lastTab` field below) — "Any" is always what's automatically selected wherever a
 * Tradition picker is shown, so there's nothing to remember about the last one picked.
 */
export interface TitleForgeSettings {
	lastGenre: string;
	lastFamily: string;
	lastPlatform: string;
	seriesMode: boolean;
	seriesStrategy: SeriesStrategy;
	seriesVolumes: number;
	/** Last-active tab, remembered separately per scope — so switching between a Series-triggered
	 * open and a Novel-triggered open doesn't jump the tab unexpectedly. Replaces a single flat
	 * `lastTab` field; a settings file saved by an older build has no `lastTabByScope` at all, and
	 * `storage.ts`'s `loadSettings()` already merges onto `DEFAULT_TITLEFORGE_SETTINGS`, so it falls
	 * back to the full default map below with no explicit migration needed (its old, now-unread
	 * `lastTab` value is simply ignored). */
	lastTabByScope: Record<TitleForgeScope, TitleForgeTab>;
	/** How many titles (or, in series mode, how many whole series) one click of Generate produces. */
	lastQuantity: number;
}

export const DEFAULT_TITLEFORGE_SETTINGS: TitleForgeSettings = {
	lastGenre: "all",
	lastFamily: "all",
	lastPlatform: "all",
	seriesMode: false,
	seriesStrategy: "echo",
	seriesVolumes: 3,
	lastTabByScope: {
		// The "all" scope lands on "novels" (its widest, most familiar tab) rather than the
		// narrower "series" umbrella view; the "series" and "novels" scopes each land on their
		// own namesake tab, the one that matches the context titleForge was opened from.
		all: "novels",
		series: "series",
		novels: "novels",
	},
	lastQuantity: 5,
};
