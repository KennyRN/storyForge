import { describe, expect, it } from "vitest";
import { MAX_VISIBLE, NoticeCenter, type Timers } from "../kit/notices";
import { nextEnabledIndex, type MenuItem } from "../kit/menu";

function fakeTimers(): Timers & { advance(ms: number): void; pending(): number } {
	let now = 0;
	let id = 0;
	const tasks = new Map<number, { at: number; fn: () => void }>();
	return {
		setTimeout(fn, ms) {
			tasks.set(++id, { at: now + ms, fn });
			return id;
		},
		clearTimeout(h) {
			tasks.delete(h as number);
		},
		advance(ms) {
			now += ms;
			for (const [k, t] of [...tasks]) if (t.at <= now) {
				tasks.delete(k);
				t.fn();
			}
		},
		pending: () => tasks.size,
	};
}

describe("NoticeCenter", () => {
	it("a transient notice fades after four seconds; a sticky one stays until dismissed", () => {
		const t = fakeTimers();
		const c = new NoticeCenter(t);
		c.notify({ text: "Chapter created" });
		const sticky = c.notify({ text: "Conflict", sticky: true });
		t.advance(3999);
		expect(c.all()).toHaveLength(2);
		t.advance(1);
		expect(c.all().map((n) => n.text)).toEqual(["Conflict"]);
		t.advance(60_000);
		expect(c.all()).toHaveLength(1);
		c.dismiss(sticky);
		expect(c.all()).toHaveLength(0);
	});

	it("hovering holds a transient notice; leaving restarts the timer", () => {
		const t = fakeTimers();
		const c = new NoticeCenter(t);
		const id = c.notify({ text: "hello" });
		c.hold(id);
		t.advance(10_000);
		expect(c.all()).toHaveLength(1);
		c.release(id);
		t.advance(4000);
		expect(c.all()).toHaveLength(0);
	});

	it("a notice with the same key replaces the earlier one", () => {
		const c = new NoticeCenter(fakeTimers());
		c.notify({ text: "first", key: "k", sticky: true });
		c.notify({ text: "second", key: "k", sticky: true });
		expect(c.all().map((n) => n.text)).toEqual(["second"]);
	});

	it("a pinned notice cannot be dismissed until it is unpinned", () => {
		const c = new NoticeCenter(fakeTimers());
		const id = c.notify({ text: "Could not save", key: "chapter-3", sticky: true, pinned: true });
		c.dismiss(id);
		expect(c.all()).toHaveLength(1);
		c.unpin("chapter-3");
		c.dismiss(id);
		expect(c.all()).toHaveLength(0);
	});

	it("at most five show; transient ones are dropped first, older stickies fold into a count", () => {
		const c = new NoticeCenter(fakeTimers());
		for (let i = 0; i < 7; i++) c.notify({ text: `sticky ${i}`, sticky: true });
		let v = c.view();
		expect(v.shown).toHaveLength(MAX_VISIBLE);
		expect(v.hiddenSticky).toBe(2);
		expect(v.shown[v.shown.length - 1].text).toBe("sticky 6");

		const d = new NoticeCenter(fakeTimers());
		for (let i = 0; i < 4; i++) d.notify({ text: `sticky ${i}`, sticky: true });
		for (let i = 0; i < 3; i++) d.notify({ text: `soon ${i}` });
		v = d.view();
		expect(v.shown.filter((n) => !n.sticky)).toHaveLength(1);
		expect(v.hiddenSticky).toBe(0);
	});

	it("notifies subscribers on every change", () => {
		const c = new NoticeCenter(fakeTimers());
		let n = 0;
		const off = c.subscribe(() => n++);
		const id = c.notify({ text: "a", sticky: true });
		c.dismiss(id);
		off();
		c.notify({ text: "b" });
		expect(n).toBe(2);
	});
});

describe("menu navigation", () => {
	const items: MenuItem[] = [{ label: "a" }, { separator: true }, { label: "b", disabled: true }, { label: "c" }];
	it("skips separators and disabled items, wrapping", () => {
		expect(nextEnabledIndex(items, -1, 1)).toBe(0);
		expect(nextEnabledIndex(items, 0, 1)).toBe(3);
		expect(nextEnabledIndex(items, 3, 1)).toBe(0);
		expect(nextEnabledIndex(items, 0, -1)).toBe(3);
	});
	it("returns -1 when nothing can be chosen", () => {
		expect(nextEnabledIndex([{ separator: true }, { label: "x", disabled: true }], -1, 1)).toBe(-1);
	});
});
