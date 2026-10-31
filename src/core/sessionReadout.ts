/** A minute with no edit turns the readout's clock to the paused one (decision 68). A visual reminder only: nothing is recorded differently. */
export const PAUSE_AFTER_MS = 60_000;

/** The session's length so far in hours and minutes only: `0m`, `25m`, `1h 05m`. Minutes round down. */
export function sessionLengthLabel(ms: number): string {
	const minutes = Math.max(0, Math.floor(ms / 60_000));
	const h = Math.floor(minutes / 60);
	return h > 0 ? `${h}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

/** What the readout row shows for the session in progress, or between sessions (`live` null). The length is first edit to last, which is what will be recorded, so it holds still while paused. */
export function readoutState(live: { startMs: number; lastEditMs: number; net: number } | null, now: number): { length: string; paused: boolean; net: number | null } {
	if (!live) return { length: sessionLengthLabel(0), paused: false, net: null };
	return { length: sessionLengthLabel(live.lastEditMs - live.startMs), paused: now - live.lastEditMs >= PAUSE_AFTER_MS, net: live.net };
}
