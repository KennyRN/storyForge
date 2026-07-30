/** ISO date (YYYY-MM-DD) in England local time, per the spec's "local time, England" rule. */
export function todayISOInEngland(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

/** Add (or subtract) whole calendar days to an ISO date using UTC date arithmetic. */
export function addDaysISO(dateISO: string, days: number): string {
	const date = new Date(`${dateISO}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** ISO date (YYYY-MM-DD) of the Monday on or before `todayISO`, treating the date as a plain calendar date (UTC arithmetic, no timezone shift). */
export function mostRecentMondayISO(todayISO: string): string {
	const date = new Date(`${todayISO}T00:00:00Z`);
	const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
	const offsetFromMonday = (day + 6) % 7;
	date.setUTCDate(date.getUTCDate() - offsetFromMonday);
	return date.toISOString().slice(0, 10);
}

export interface DayNet {
	date: string;
	net: number;
}

export interface WeekNet {
	weekStart: string;
	net: number;
}

/** Inclusive range of daily nets (missing days → 0). */
export function dailyNetsForRange(
	dailyNets: Record<string, number>,
	fromISO: string,
	toISO: string,
): DayNet[] {
	const out: DayNet[] = [];
	if (fromISO > toISO) return out;
	for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) {
		out.push({ date: d, net: dailyNets[d] ?? 0 });
	}
	return out;
}

/** Collapse day nets into Monday-start weeks (sum of days in each week). */
export function weeklyNetsFromDaily(dayNets: DayNet[]): WeekNet[] {
	const byWeek = new Map<string, number>();
	const order: string[] = [];
	for (const { date, net } of dayNets) {
		const weekStart = mostRecentMondayISO(date);
		if (!byWeek.has(weekStart)) {
			byWeek.set(weekStart, 0);
			order.push(weekStart);
		}
		byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + net);
	}
	return order.map((weekStart) => ({ weekStart, net: byWeek.get(weekStart) ?? 0 }));
}

/** Sum daily nets from this week's Monday through `todayISO` inclusive. */
export function sumNetsThisWeek(dailyNets: Record<string, number>, todayISO: string): number {
	const monday = mostRecentMondayISO(todayISO);
	return dailyNetsForRange(dailyNets, monday, todayISO).reduce((sum, d) => sum + d.net, 0);
}
