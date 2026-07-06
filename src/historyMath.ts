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
