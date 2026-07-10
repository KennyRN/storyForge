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

