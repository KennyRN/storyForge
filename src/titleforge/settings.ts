import type { SeriesStrategy } from "./engine/types.js";

/**
 * titleForge's own settings shape. Persisted by `storage.ts` to its own vault
 * file — deliberately not folded into storyForge's `data.json` — so an
 * extraction only has to repoint the storage path, not restructure the shape.
 */
export interface TitleForgeSettings {
	lastGeneratorId: string;
	lastGenre: string;
	/** Genre for the onboarding modal's standalone-novel-tab title field - separate from `lastGenre`
	 * (which the series name and first book title fields share) since a standalone novel's genre has
	 * nothing to do with whatever series genre was last picked. See SeriesOnboardingModal. */
	lastNovelGenre: string;
	lastFamily: string;
	lastPlatform: string;
	seriesMode: boolean;
	seriesStrategy: SeriesStrategy;
	seriesVolumes: number;
}

export const DEFAULT_TITLEFORGE_SETTINGS: TitleForgeSettings = {
	lastGeneratorId: "title-composer",
	lastGenre: "all",
	lastNovelGenre: "all",
	lastFamily: "all",
	lastPlatform: "all",
	seriesMode: false,
	seriesStrategy: "echo",
	seriesVolumes: 3,
};
