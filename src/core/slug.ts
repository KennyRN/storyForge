/** Readable, stable slug from a book folder name, e.g. "Book One" -> "book-one". */
export function slugify(name: string): string {
	const base = name
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return base.length > 0 ? base : "book";
}

/** Mints a slug id for `name`, de-duplicating against already-minted ids. */
export function mintId(name: string, existingIds: Iterable<string>): string {
	const taken = new Set(existingIds);
	const base = slugify(name);
	if (!taken.has(base)) return base;
	let suffix = 2;
	while (taken.has(`${base}-${suffix}`)) suffix++;
	return `${base}-${suffix}`;
}
