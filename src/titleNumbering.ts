/**
 * Replaces every literal "#" in each title with a sequential number, where
 * the counter only advances for titles that contain at least one "#" —
 * titles without one are passed through unchanged and do not consume a
 * number. Purely a display-layer transform; never mutates stored titles.
 */
export function applyHashNumbering(titles: string[]): string[] {
	let counter = 0;
	return titles.map((title) => {
		if (!title.includes("#")) return title;
		counter += 1;
		return title.split("#").join(String(counter));
	});
}

export interface SplitTitle {
	title: string;
	subtitle: string | null;
}

/**
 * Splits a title on the first "//" into a title and subtitle, e.g.
 * "My Book // A Subtitle" -> { title: "My Book", subtitle: "A Subtitle" }.
 * A second "//" is just part of the subtitle text — only the first split
 * counts. Purely a display-layer transform; the raw stored title (with its
 * "//") is unchanged.
 */
export function splitTitleSubtitle(raw: string): SplitTitle {
	const idx = raw.indexOf("//");
	if (idx === -1) return { title: raw, subtitle: null };
	const title = raw.slice(0, idx).trim();
	const subtitle = raw.slice(idx + 2).trim();
	return { title, subtitle: subtitle || null };
}

/**
 * Formats a title for a single-line context (e.g. a tab header) that can't
 * wrap to a second line: "Title: Subtitle" if there's a subtitle, else just
 * the title. Contexts that already support two lines (the panel's own row
 * rendering) should keep using `splitTitleSubtitle` directly instead.
 */
export function formatSingleLine(raw: string): string {
	const { title, subtitle } = splitTitleSubtitle(raw);
	return subtitle ? (title ? `${title}: ${subtitle}` : subtitle) : title;
}
