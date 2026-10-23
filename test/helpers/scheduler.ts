import type { Scheduler } from "../../src/core/proseWriter";

/** A manual clock for the prose writer's save delay. */
export class ManualScheduler implements Scheduler {
	private timers = new Map<number, { at: number; fn: () => void }>();
	private next = 1;
	now = 0;
	setTimeout(fn: () => void, ms: number): unknown {
		const id = this.next++;
		this.timers.set(id, { at: this.now + ms, fn });
		return id;
	}
	clearTimeout(handle: unknown): void {
		this.timers.delete(handle as number);
	}
	get pending(): number {
		return this.timers.size;
	}
	/** Moves the clock forward, firing every timer that falls due (in order). Timer callbacks start async work; await `settle()` after. */
	advance(ms: number): void {
		const target = this.now + ms;
		for (;;) {
			const due = [...this.timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
			if (!due) break;
			this.timers.delete(due[0]);
			this.now = Math.max(this.now, due[1].at);
			due[1].fn();
		}
		this.now = target;
	}
}

/** Lets queued promise work finish. */
export const settle = () => new Promise<void>((r) => setTimeout(r, 20));
