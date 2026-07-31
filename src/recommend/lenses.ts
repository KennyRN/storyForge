/**
 * Lens registry — each lens is `(sentence, tokens) => match | null`.
 * Internals are winkNLP-backed; the signature keeps the engine swappable.
 */

import type { LexiconSet } from "./lexicons";
import { defaultLexicons, toWordSet } from "./lexicons";
import type { LensId } from "./types";

export interface TokenInfo {
	text: string;
	lower: string;
	pos: string;
	negated: boolean;
	index: number;
}

export interface LensMatch {
	lens: LensId;
	trait: string | null;
	negated: boolean;
}

export type LensFn = (sentence: string, tokens: TokenInfo[]) => LensMatch | null;

export interface LensDef {
	id: LensId;
	label: string;
	match: LensFn;
}

function anyWord(tokens: TokenInfo[], set: Set<string>): TokenInfo | undefined {
	return tokens.find((t) => set.has(t.lower));
}

function hasQuote(sentence: string): boolean {
	return /["“”'‘’]/.test(sentence);
}

function matchDescription(lex: LexiconSet): LensFn {
	const traits = toWordSet(lex.traitNouns);
	const attire = toWordSet(lex.attireNouns);
	const wearing = toWordSet(lex.wearingVerbs);
	const linking = toWordSet(lex.linkingVerbs);

	return (_sentence, tokens) => {
		// Attributive path: ADJ+ before a trait noun ("her luminous eyes")
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			if (!traits.has(t.lower) || t.pos !== "NOUN") continue;
			// Look back for adjectives
			const adjs: TokenInfo[] = [];
			for (let j = i - 1; j >= 0; j--) {
				const prev = tokens[j];
				if (prev.pos === "ADJ") adjs.unshift(prev);
				else if (prev.pos === "DET" || prev.pos === "PRON" || prev.pos === "PART") continue;
				else break;
			}
			if (adjs.length > 0) {
				return {
					lens: "description",
					trait: t.lower,
					negated: adjs.some((a) => a.negated) || t.negated,
				};
			}
		}

		// Predicate path: trait noun + linking verb + complement.
		// Prefer POS adjectives (free-form worlds); also accept NOUN/PROPN
		// complements so colour words wink tags as nouns ("eyes were amber") still fire.
		const link = tokens.find((t) => linking.has(t.lower) && (t.pos === "AUX" || t.pos === "VERB"));
		if (link) {
			const traitTok = tokens.find(
				(t) => t.index < link.index && t.pos === "NOUN" && traits.has(t.lower),
			);
			const adj = tokens.find((t) => t.index > link.index && t.pos === "ADJ");
			if (adj) {
				return {
					lens: "description",
					trait: traitTok?.lower ?? adj.lower,
					negated: adj.negated,
				};
			}
			if (traitTok) {
				const complement = tokens.find(
					(t) =>
						t.index > link.index &&
						(t.pos === "NOUN" || t.pos === "PROPN" || t.pos === "ADJ"),
				);
				if (complement) {
					return {
						lens: "description",
						trait: traitTok.lower,
						negated: complement.negated,
					};
				}
			}
		}

		// Attire: wearing verb + attire noun
		const wear = anyWord(tokens, wearing);
		if (wear) {
			const item = anyWord(tokens, attire);
			if (item) {
				return { lens: "description", trait: item.lower, negated: item.negated || wear.negated };
			}
		}

		return null;
	};
}

function matchWhereabouts(lex: LexiconSet): LensFn {
	const motion = toWordSet(lex.motionVerbs);
	const prep = toWordSet(lex.placePrepositions);

	return (sentence, tokens) => {
		const hasMotion = tokens.some((t) => motion.has(t.lower));
		if (!hasMotion) return null;
		// Place phrase: preposition + capitalised place (PROPN or capitalised word)
		for (let i = 0; i < tokens.length - 1; i++) {
			if (!prep.has(tokens[i].lower)) continue;
			const next = tokens[i + 1];
			const capitalised = /^[A-Z]/.test(next.text);
			if (next.pos === "PROPN" || capitalised) {
				return {
					lens: "whereabouts",
					trait: next.text,
					negated: tokens[i].negated || next.negated,
				};
			}
		}
		void sentence;
		return null;
	};
}

function matchRelationships(lex: LexiconSet): LensFn {
	const kinship = toWordSet(lex.kinshipNouns);
	const phrases = [...lex.relationPhrases].sort((a, b) => b.length - a.length);

	return (sentence, tokens) => {
		const lower = sentence.toLowerCase();
		for (const phrase of phrases) {
			if (lower.includes(phrase)) {
				return { lens: "relationships", trait: phrase, negated: false };
			}
		}
		const kin = anyWord(tokens, kinship);
		if (kin && (kin.pos === "NOUN" || kin.pos === "PROPN")) {
			return { lens: "relationships", trait: kin.lower, negated: kin.negated };
		}
		return null;
	};
}

function matchDialogue(lex: LexiconSet): LensFn {
	const speech = toWordSet(lex.speechVerbs);
	return (sentence, tokens) => {
		if (!hasQuote(sentence)) return null;
		const verb = anyWord(tokens, speech);
		if (!verb) return null;
		return { lens: "dialogue", trait: verb.lower, negated: verb.negated };
	};
}

function matchEmotion(lex: LexiconSet): LensFn {
	const emotions = toWordSet(lex.emotionTerms);
	return (_sentence, tokens) => {
		const hit = anyWord(tokens, emotions);
		if (!hit) return null;
		return { lens: "emotion", trait: hit.lower, negated: hit.negated };
	};
}

/** Build the default five-lens registry from a lexicon set. */
export function buildLensRegistry(lexicons: LexiconSet = defaultLexicons()): LensDef[] {
	return [
		{ id: "description", label: "Description", match: matchDescription(lexicons) },
		{ id: "whereabouts", label: "Whereabouts", match: matchWhereabouts(lexicons) },
		{ id: "relationships", label: "Relationships", match: matchRelationships(lexicons) },
		{ id: "dialogue", label: "Dialogue", match: matchDialogue(lexicons) },
		{ id: "emotion", label: "Emotion", match: matchEmotion(lexicons) },
	];
}

/** Run all lenses; return every match (a sentence may hit multiple). */
export function applyLenses(sentence: string, tokens: TokenInfo[], lenses: LensDef[]): LensMatch[] {
	const out: LensMatch[] = [];
	for (const lens of lenses) {
		const m = lens.match(sentence, tokens);
		if (m) out.push(m);
	}
	return out;
}
