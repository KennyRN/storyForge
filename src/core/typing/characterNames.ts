/**
 * What a special character is called out loud (docs/typing-aids.md §7, decision 46 ruling 9): the starting set has
 * proper names (ash, ethel, eth, thorn, wynn, yogh); any other character is announced as itself with its code point.
 */
const NAMES: Record<string, string> = {
	æ: "ash",
	Æ: "capital ash",
	œ: "ethel",
	Œ: "capital ethel",
	ð: "eth",
	Ð: "capital eth",
	þ: "thorn",
	Þ: "capital thorn",
	ƿ: "wynn",
	Ƿ: "capital wynn",
	ȝ: "yogh",
	Ȝ: "capital yogh",
};

/** `U+00E6` for `æ`: every code point of the character, in hexadecimal. */
export function codePoints(character: string): string {
	return [...character].map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
}

export function spokenName(character: string): string {
	return NAMES[character] ?? `${character}, ${codePoints(character)}`;
}
