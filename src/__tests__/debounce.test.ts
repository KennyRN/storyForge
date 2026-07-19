import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../debounce";

describe("debounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// debounce.ts calls window.setTimeout/clearTimeout; the vitest "node"
		// environment has no window global, so point it at globalThis (which
		// vi.useFakeTimers() has already patched).
		vi.stubGlobal("window", globalThis);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("fires after the delay", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 50);
		debounced();
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("cancel() before the delay elapses prevents the call", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 50);
		debounced();
		debounced.cancel();
		vi.advanceTimersByTime(100);
		expect(fn).not.toHaveBeenCalled();
	});

	it("invoking again after cancel() still fires exactly once", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 50);
		debounced();
		debounced.cancel();
		debounced();
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
