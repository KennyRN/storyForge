import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounced } from "../overviews/refresh";

describe("debounced refresh", () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it("collapses a burst into one trailing call", () => {
		const fn = vi.fn();
		const d = debounced(fn, 250);
		d();
		vi.advanceTimersByTime(200);
		d();
		vi.advanceTimersByTime(200);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(60);
		expect(fn).toHaveBeenCalledTimes(1);
	});
	it("can be cancelled", () => {
		const fn = vi.fn();
		const d = debounced(fn, 250);
		d();
		d.cancel();
		vi.advanceTimersByTime(500);
		expect(fn).not.toHaveBeenCalled();
	});
});
