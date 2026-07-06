/**
 * Generic "series : books :: book : chapters" ordering logic. Membership is
 * always defined by the real filesystem entries (`members`); `order` only
 * sets sequence. An order entry with no matching member is an orphan; a
 * member absent from `order` is unplaced, appended at the bottom.
 */

export interface OrderResult<T> {
	ordered: T[];
	unplaced: T[];
	orphans: string[];
}

export function resolveOrder<T>(members: T[], order: string[], keyOf: (item: T) => string): OrderResult<T> {
	const byKey = new Map<string, T>();
	for (const member of members) {
		byKey.set(keyOf(member), member);
	}

	const ordered: T[] = [];
	const orphans: string[] = [];
	const seen = new Set<string>();

	for (const key of order) {
		const member = byKey.get(key);
		if (member) {
			ordered.push(member);
			seen.add(key);
		} else {
			orphans.push(key);
		}
	}

	const unplaced = members.filter((member) => !seen.has(keyOf(member)));

	return { ordered, unplaced, orphans };
}
