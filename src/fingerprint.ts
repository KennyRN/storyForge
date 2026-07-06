import { stripForCounting } from "./wordCount";

export interface Fingerprint {
	opening: string;
	closing: string;
}

const MAX_WORDS = 40;

function splitParagraphs(text: string): string[] {
	return text
		.split(/\n\s*\n/)
		.map((p) => p.replace(/\s+/g, " ").trim())
		.filter((p) => p.length > 0);
}

/**
 * Bounded to roughly one sentence, or MAX_WORDS words if the first sentence
 * runs longer, so a rambling opening can't bloat the sidecar file.
 */
function capParagraph(paragraph: string): string {
	const sentenceMatch = paragraph.match(/^.*?[.!?](?=\s|$)/);
	const candidate = sentenceMatch ? sentenceMatch[0] : paragraph;
	const words = candidate.split(/\s+/).filter(Boolean);
	if (words.length <= MAX_WORDS) {
		return candidate.trim();
	}
	return words.slice(0, MAX_WORDS).join(" ") + "…";
}

/**
 * Opening is the dependable anchor (openings settle early in drafting);
 * closing just adds distinctiveness. Empty prose yields empty strings.
 */
export function extractFingerprint(raw: string): Fingerprint {
	const paragraphs = splitParagraphs(stripForCounting(raw));
	if (paragraphs.length === 0) {
		return { opening: "", closing: "" };
	}
	const opening = capParagraph(paragraphs[0]);
	const closing = capParagraph(paragraphs[paragraphs.length - 1]);
	return { opening, closing };
}

/**
 * Similarity in [0, 1] between a stored fingerprint and a candidate file's
 * actual fingerprint, used only to rank reconciliation candidates.
 */
export function fingerprintSimilarity(a: Fingerprint, b: Fingerprint): number {
	const openingScore = stringSimilarity(a.opening, b.opening);
	const closingScore = stringSimilarity(a.closing, b.closing);
	return openingScore * 0.7 + closingScore * 0.3;
}

/** Parses the plugin-maintained opening/closing fingerprint back out of a sidecar file's rendered body. */
export function parseStoredFingerprintFromContent(raw: string): Fingerprint {
	const openingMatch = raw.match(/## opening\n([\s\S]*?)(?:\n\n## closing|\n*$)/);
	const closingMatch = raw.match(/## closing\n([\s\S]*?)(?:\n*$)/);
	return {
		opening: openingMatch ? openingMatch[1].trim() : "",
		closing: closingMatch ? closingMatch[1].trim() : "",
	};
}

function stringSimilarity(a: string, b: string): number {
	if (a === b) return a.length === 0 ? 0 : 1;
	if (a.length === 0 || b.length === 0) return 0;
	const setA = new Set(a.toLowerCase().split(/\s+/));
	const setB = new Set(b.toLowerCase().split(/\s+/));
	let shared = 0;
	for (const word of setA) {
		if (setB.has(word)) shared++;
	}
	return shared / Math.max(setA.size, setB.size);
}
