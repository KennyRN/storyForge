/**
 * titleForge engine — barrel export.
 *
 * Everything reachable from here is Obsidian-free (no `obsidian` import, no
 * import of storyForge's own `src/*.ts`). If this subplugin is ever pulled out
 * into its own Obsidian plugin, this folder is the part that ships unchanged —
 * see `src/titleforge/README.md`.
 */

export * from "./types.js";
export { createRng, pick, randomSeed, weightedPick } from "./rng.js";
export type { Rng } from "./rng.js";
export { normaliseLexicon, withTags } from "./lexicon.js";
export { renderTemplate, slotsIn, validateTemplate } from "./template.js";
export { titleCase, countWords } from "./titlecase.js";
export { checkArticleAgreement } from "./articles.js";
export {
	eligiblePatterns,
	generateOne,
	generateMany,
	generateSeries,
	validateSpec,
} from "./generate.js";
export {
	parseEntries,
	serialiseEntries,
	toEntry,
	titlesFrom,
	replay,
	replayMatches,
} from "./history.js";
export type { ParseEntriesResult } from "./history.js";
export {
	register,
	unregister,
	getGenerator,
	listGenerators,
	listByTradition,
} from "./registry.js";
