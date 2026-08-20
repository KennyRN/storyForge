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
 * These are the *defaults* — `storage.ts` seeds them out to
 * `_backstage/storyforge/titleforge/lexicons/*.json` on first load, and a vault copy
 * (hand-edited, no rebuild needed) takes priority over the bundled one here.
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
