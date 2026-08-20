import type { SeriesStrategy } from "./engine/types.js";

/**
 * titleForge's own settings shape. Persisted by `storage.ts` to its own vault
 * file — deliberately not folded into storyForge's `data.json` — so an
 * extraction only has to repoint the storage path, not restructure the shape.
 */
export interface TitleForgeSettings {
	lastGeneratorId: string;
	lastGenre: string;
	lastFamily: string;
	lastPlatform: string;
	seriesMode: boolean;
	seriesStrategy: SeriesStrategy;
	seriesVolumes: number;
}

export const DEFAULT_TITLEFORGE_SETTINGS: TitleForgeSettings = {
	lastGeneratorId: "title-composer",
	lastGenre: "all",
	lastFamily: "all",
	lastPlatform: "all",
	seriesMode: false,
	seriesStrategy: "echo",
	seriesVolumes: 3,
};
