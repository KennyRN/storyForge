import { describe, expect, it } from "vitest";
import { PAUSE_AFTER_MS, readoutState, sessionLengthLabel } from "../sessionReadout";

const MIN = 60_000;

describe("the session readout", () => {
	it("formats the length in hours and minutes only", () => {
		expect(sessionLengthLabel(0)).toBe("0m");
		expect(sessionLengthLabel(59_999)).toBe("0m");
		expect(sessionLengthLabel(25 * MIN)).toBe("25m");
		expect(sessionLengthLabel(59 * MIN + 59_000)).toBe("59m");
		expect(sessionLengthLabel(60 * MIN)).toBe("1h 00m");
		expect(sessionLengthLabel(65 * MIN)).toBe("1h 05m");
		expect(sessionLengthLabel(10 * 60 * MIN + 7 * MIN)).toBe("10h 07m");
		expect(sessionLengthLabel(-5)).toBe("0m");
	});

	it("is `0m`, the standard clock and no words between sessions", () => {
		expect(readoutState(null, 1_000_000)).toEqual({ length: "0m", paused: false, net: null });
	});

	it("pauses a minute after the last edit, and the next edit un-pauses it", () => {
		const start = 1_000_000;
		let live = { startMs: start, lastEditMs: start + 10 * MIN, net: 120 };
		expect(readoutState(live, live.lastEditMs + PAUSE_AFTER_MS - 1).paused).toBe(false);
		expect(readoutState(live, live.lastEditMs + PAUSE_AFTER_MS).paused).toBe(true);
		live = { ...live, lastEditMs: live.lastEditMs + 90_000 };
		expect(readoutState(live, live.lastEditMs + 1_000).paused).toBe(false);
	});

	it("holds the length at first edit to last edit while paused, as it will be recorded", () => {
		const live = { startMs: 0, lastEditMs: 25 * MIN, net: 300 };
		expect(readoutState(live, 25 * MIN).length).toBe("25m");
		expect(readoutState(live, 25 * MIN + 2 * MIN).length).toBe("25m");
		expect(readoutState(live, 25 * MIN + 2 * MIN).net).toBe(300);
	});
});
