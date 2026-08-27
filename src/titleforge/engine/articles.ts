import { normaliseLexicon } from "./lexicon.js";
import type { GeneratorSpec } from "./types.js";

/**
 * Static article-agreement lint.
 *
 * A slot is either *bare* (no entry's gloss starts with "the ") or *articled*
 * (every entry's gloss does). A template may write literal `the {slot}` only
 * for a bare slot — `the` plus an already-articled entry doubles up ("the the
 * Weald"). This reads the templates rather than sampling output, so it also
 * catches `The Hidden {place}`, where the article is separated from the slot
 * by an adjective rather than sitting right next to it.
 *
 * Heuristic, not a full parser: it looks ahead a bounded number of literal
 * words after "the" and stops at the first slot or the first function word
 * ("of", "and", ...), on the theory that a real adjective run is short and a
 * function word always marks the boundary of the noun phrase "the" governs.
 */

type ArticleClass = "bare" | "articled" | "mixed" | "empty";

const STOP_WORDS = new Set([
	"the",
	"a",
	"an",
	"and",
	"as",
	"at",
	"but",
	"by",
	"for",
	"from",
	"if",
	"in",
	"into",
	"nor",
	"of",
	"on",
	"onto",
	"or",
	"over",
	"per",
	"so",
	"than",
	"that",
	"to",
	"up",
	"upon",
	"vs",
	"via",
	"with",
	"yet",
	"near",
	"who",
	"which",
	"whose",
]);

const MAX_LOOKAHEAD = 3;

function classifySlot(entries: { gloss: string }[]): ArticleClass {
	if (entries.length === 0) return "empty";
	const articledCount = entries.filter((e) => /^the\s/i.test(e.gloss.trim())).length;
	if (articledCount === 0) return "bare";
	if (articledCount === entries.length) return "articled";
	return "mixed";
}

interface Token {
	text: string;
	isSlot: boolean;
	slot?: string;
}

/** Same token grammar as `template.ts`, but split down to literal words too. */
function tokenize(template: string): Token[] {
	const tokens: Token[] = [];
	const re =
		/\{([a-zA-Z_]\w*)(?::[a-zA-Z_][\w-]*)?(?:#\d+)?\^?(?:\|[a-z]+)*\}|\{\{|\}\}|[^\s{}]+/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(template)) !== null) {
		if (match[1]) tokens.push({ text: match[0], isSlot: true, slot: match[1] });
		else if (match[0] === "{{" || match[0] === "}}") continue;
		else tokens.push({ text: match[0], isSlot: false });
	}
	return tokens;
}

function stripPunctuation(word: string): string {
	return word.replace(/^[.,!?:;"'()]+/, "").replace(/[.,!?:;"'()]+$/, "");
}

/** Returns one human-readable problem string per violation found. Empty array = clean. */
export function checkArticleAgreement(spec: GeneratorSpec): string[] {
	const problems: string[] = [];
	const lexemes = normaliseLexicon(spec.lexicon);
	const classes = new Map<string, ArticleClass>();
	for (const [slot, entries] of Object.entries(lexemes)) classes.set(slot, classifySlot(entries));

	for (const pattern of spec.patterns) {
		for (const template of pattern.templates) {
			const tokens = tokenize(template);
			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i];
				if (token.isSlot) continue;
				if (stripPunctuation(token.text).toLowerCase() !== "the") continue;

				let j = i + 1;
				let steps = 0;
				while (j < tokens.length && steps < MAX_LOOKAHEAD) {
					const next = tokens[j];
					if (next.isSlot) {
						const cls = classes.get(next.slot!) ?? "empty";
						if (cls === "articled" || cls === "mixed") {
							problems.push(
								`${spec.id}/${pattern.id}: "the {${next.slot}}" — slot "${next.slot}" is ${cls} ` +
									`(some or all entries already start with "the"); template: "${template}"`,
							);
						}
						break;
					}
					const word = stripPunctuation(next.text).toLowerCase();
					if (STOP_WORDS.has(word)) break;
					j++;
					steps++;
				}
			}
		}
	}
	return problems;
}
