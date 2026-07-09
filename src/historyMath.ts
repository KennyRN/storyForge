/** ISO date (YYYY-MM-DD) in England local time, per the spec's "local time, England" rule. */
export function todayISOInEngland(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

/**
 * "Words today" is derived, never stored: today's total minus the most
 * recent prior day's total. If there is no prior day, today's total stands.
 */
export function wordsToday(totals: Record<string, number>, todayISO: string): number {
	const today = totals[todayISO] ?? 0;
	const priorDates = Object.keys(totals)
		.filter((date) => date < todayISO)
		.sort();
	if (priorDates.length === 0) return today;
	const mostRecentPrior = priorDates[priorDates.length - 1];
	return today - totals[mostRecentPrior];
}

/** The most recently recorded total (today's if present, otherwise the latest prior day's), or 0 if there is none. */
export function latestTotal(totals: Record<string, number>): number {
	const dates = Object.keys(totals).sort();
	if (dates.length === 0) return 0;
	return totals[dates[dates.length - 1]];
}

/** ISO date (YYYY-MM-DD) of the Monday on or before `todayISO`, treating the date as a plain calendar date (UTC arithmetic, no timezone shift). */
export function mostRecentMondayISO(todayISO: string): string {
	const date = new Date(`${todayISO}T00:00:00Z`);
	const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
	const offsetFromMonday = (day + 6) % 7;
	date.setUTCDate(date.getUTCDate() - offsetFromMonday);
	return date.toISOString().slice(0, 10);
}

/**
 * "Words this week" is derived, never stored: today's total minus the most
 * recent total recorded before this week's Monday. If there is no such prior
 * record, today's total stands (the whole history falls within this week).
 */
export function wordsThisWeek(totals: Record<string, number>, todayISO: string): number {
	const today = totals[todayISO] ?? 0;
	const monday = mostRecentMondayISO(todayISO);
	const priorDates = Object.keys(totals)
		.filter((date) => date < monday)
		.sort();
	if (priorDates.length === 0) return today;
	const mostRecentPrior = priorDates[priorDates.length - 1];
	return today - totals[mostRecentPrior];
}
