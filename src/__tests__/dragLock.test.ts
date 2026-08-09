import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginDrag, endDrag, isDragInProgress } from "../view/dragLock";

// dragLock's `depth`/`lastBeginAt` are module-level state, shared across every test in this file
// (and every other test file that imports it) — reset to a clean slate before each test.
beforeEach(() => {
	while (isDragInProgress()) endDrag();
});

describe("dragLock", () => {
	it("is not in progress before any drag begins", () => {
		expect(isDragInProgress()).toBe(false);
	});

	it("reports in-progress between beginDrag and a matching endDrag", () => {
		beginDrag();
		expect(isDragInProgress()).toBe(true);
		endDrag();
		expect(isDragInProgress()).toBe(false);
	});

	it("is nesting-safe: only clears once every beginDrag has a matching endDrag", () => {
		beginDrag();
		beginDrag();
		endDrag();
		expect(isDragInProgress()).toBe(true);
		endDrag();
		expect(isDragInProgress()).toBe(false);
	});

	it("never goes negative on an unmatched endDrag", () => {
		endDrag();
		endDrag();
		expect(isDragInProgress()).toBe(false);
		beginDrag();
		expect(isDragInProgress()).toBe(true);
		endDrag();
		expect(isDragInProgress()).toBe(false);
	});

	describe("stale-lock auto-recovery", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it("stays locked well before the stale window elapses", () => {
			beginDrag();
			vi.advanceTimersByTime(10_000);
			expect(isDragInProgress()).toBe(true);
			endDrag();
		});

		it("self-clears a leaked lock once the stale window elapses", () => {
			beginDrag(); // simulates a beginDrag() whose matching endDrag() never fired (a leak)
			vi.advanceTimersByTime(15_001);
			expect(isDragInProgress()).toBe(false);
		});
	});
});
