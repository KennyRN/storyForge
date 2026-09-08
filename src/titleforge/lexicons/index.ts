import type { GeneratorSpec } from "../engine/types.js";
import { chineseWebLexicon } from "./chineseWeb.js";
import { indonesianWebLexicon } from "./indonesianWeb.js";
import { japaneseLnLexicon } from "./japaneseLn.js";
import { koreanWebLexicon } from "./koreanWeb.js";
import { nonWesternLiteraryLexicon } from "./nonWesternLiterary.js";
import { thaiWebLexicon } from "./thaiWeb.js";
import { titleComposerLexicon } from "./titleComposer.js";
import { vietnameseWebLexicon } from "./vietnameseWeb.js";
import { westernSerialLexicon } from "./westernSerial.js";

/**
 * The nine bundled generators, in the order they should list in the picker.
 *
 * These are compiled-in and read-only: `storage.ts` never writes them to the
 * vault and never loads them from it. A user extends `title-composer` (only)
 * by adding words to `_backstage/titleforge/user enhanced lexicon.md`, which
 * `storage.loadAllGenerators()` merges on top — additive only, see
 * `engine/userLexicon.ts`.
 */
export const ALL_TITLEFORGE_LEXICONS: GeneratorSpec[] = [
	titleComposerLexicon,
	westernSerialLexicon,
	japaneseLnLexicon,
	koreanWebLexicon,
	chineseWebLexicon,
	vietnameseWebLexicon,
	indonesianWebLexicon,
	thaiWebLexicon,
	nonWesternLiteraryLexicon,
];

export {
	titleComposerLexicon,
	westernSerialLexicon,
	japaneseLnLexicon,
	koreanWebLexicon,
	chineseWebLexicon,
	vietnameseWebLexicon,
	indonesianWebLexicon,
	thaiWebLexicon,
	nonWesternLiteraryLexicon,
};
