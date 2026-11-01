import { describe, expect, it } from "vitest";
import { decide, guardedTyping } from "../../scripts/lib/typingGuard.mjs";
import { eventForChar, eventForScript, postScript } from "../../scripts/lib/postKeys.mjs";

const ok = (pid = 4242, role = "AXTextArea") => `pid=${pid};focus=${role}`;

describe("the typing guard's decision (decisions 72 and 90)", () => {
	it("allows a key only with the one test copy in front (its own process) and a text box focused", () => {
		expect(decide(ok(), 1, { pid: 4242 }).ok).toBe(true);
		expect(decide(ok(4242, "AXTextField") + "\n", 1, { pid: 4242 }).ok).toBe(true);
	});
	it("refuses when anything else is in front, and says what", () => {
		const r = decide("front=Finder (com.apple.finder)", 1, { pid: 4242 });
		expect(r.ok).toBe(false);
		expect(r.why).toContain("Finder");
	});
	it("lets a key for a control (Return on a Codex row) through only with the test copy in front, alone", () => {
		expect(decide(ok(4242, "AXGroup"), 1, { pid: 4242, anyFocus: true }).ok).toBe(true);
		expect(decide(ok(4242, "AXGroup"), 1, { pid: 4242 }).ok).toBe(false);
		expect(decide("front=Xcode (com.apple.dt.Xcode)", 1, { pid: 4242, anyFocus: true }).ok).toBe(false);
		expect(decide(ok(4242, "AXGroup"), 2, { pid: 4242, anyFocus: true }).ok).toBe(false);
	});
	it("refuses with no window showing, no focus, a non-text focus, an empty answer or any other number of copies", () => {
		for (const a of ["nowindow", "nofocus", ok(4242, "AXButton"), "", "nonsense"]) expect(decide(a, 1, { pid: 4242 }).ok, a).toBe(false);
		expect(decide("nowindow", 1, { pid: 4242 }).why).toContain("window is not showing");
		expect(decide(ok(), 0, { pid: 4242 }).ok).toBe(false);
		expect(decide(ok(), 2, { pid: 4242 }).ok).toBe(false);
	});
	it("refuses a storyForge that isn't the test copy's own process, one that has gone, and one that has begun to quit", () => {
		expect(decide(ok(999), 1, { pid: 4242 }).ok).toBe(false);
		expect(decide(ok(), 1, { pid: 4242, alive: false }).why).toContain("no longer running");
		expect(decide(ok(), 1, { pid: 4242, quitting: true }).why).toContain("begun to quit");
	});
});

describe("keys are posted to the test copy's own process (decision 90, item 1)", () => {
	it("maps what the scripts type to key codes, shift and command, and refuses what has no key", () => {
		expect(eventForChar("a")).toEqual({ code: 0, flags: 0 });
		expect(eventForChar("A")).toEqual({ code: 0, flags: 0x20000 });
		expect(eventForChar("~")).toEqual({ code: 50, flags: 0x20000 });
		expect(eventForChar(" ")).toEqual({ code: 49, flags: 0 });
		expect(eventForChar("'")).toEqual({ code: 39, flags: 0 });
		expect(() => eventForChar("ƿ")).toThrow(/no key that can be posted/);
		expect(eventForScript("key code 36")).toEqual({ code: 36, flags: 0 });
		expect(eventForScript("key code 125 using command down")).toEqual({ code: 125, flags: 0x100000 });
		expect(eventForScript('keystroke "z" using command down')).toEqual({ code: 6, flags: 0x100000 });
		expect(() => eventForScript('click button "x"')).toThrow(/can't post/);
	});
	it("the posted script targets one process and uses neither System Events nor the frontmost app", () => {
		const s = postScript(4242, { code: 125, flags: 0x100000 });
		expect(s).toContain("CGEventPostToPid(4242");
		expect(s).not.toMatch(/System Events|keystroke|frontmost|CGEventPost\(/);
		expect(() => postScript(0, { code: 1, flags: 0 })).toThrow();
	});
	it("every key the guard sends goes through post() to the test copy's pid, and none through osa", () => {
		const { guard, posts, osaCalls } = rig([ok(), ok(), ok()]);
		guard.sendKeys("ab");
		guard.key("key code 36");
		expect(posts).toEqual([{ pid: 4242, event: { code: 0, flags: 0 } }, { pid: 4242, event: { code: 11, flags: 0 } }, { pid: 4242, event: { code: 36, flags: 0 } }]);
		expect(osaCalls.every((s: string) => s.includes("first process whose frontmost"))).toBe(true); // osa is only ever asked the check
	});
	it("a key that can't be posted that way is reported, not worked round", () => {
		const { guard, posts, failures } = rig([ok()]);
		expect(() => guard.sendKeys("aƿ")).toThrow(/no key that can be posted/);
		expect(posts).toEqual([]); // the whole text is checked before any key is sent
		expect(failures[0]).toContain("reported, not worked round");
	});
});

describe("the check runs immediately before each key (decision 90, item 2)", () => {
	it("stops at the first key after something else comes to the front, though the burst began fine", () => {
		const { guard, posts } = rig([ok(), ok(), "front=Finder (com.apple.finder)", ok()]);
		expect(() => guard.sendKeys("abcd")).toThrow(/REFUSING TO TYPE/);
		expect(posts.length).toBe(2); // a and b; c was refused and d never tried
	});
	it("each key costs one check (not one per burst)", () => {
		const { guard, osaCalls } = rig(Array(5).fill(ok()));
		guard.sendKeys("hello");
		expect(osaCalls.length).toBe(5);
	});
});

describe("no key once the test copy is quitting, or before its window is showing and focused (decision 90, item 3)", () => {
	it("refuses every key after beginQuit(), and allows them again for a new test copy after reset()", () => {
		const { guard, posts } = rig(Array(4).fill(ok()));
		guard.key("key code 36");
		guard.beginQuit();
		expect(() => guard.key("key code 36")).toThrow(/begun to quit/);
		expect(() => guard.sendKeys("x")).toThrow(/begun to quit/);
		expect(posts.length).toBe(1);
		guard.reset();
		guard.key("key code 36");
		expect(posts.length).toBe(2);
	});
	it("refuses before the window is showing, before a text box has focus, and once the process has gone", () => {
		for (const [answer, alive, why] of [["nowindow", true, /window is not showing/], ["nofocus", true, /nothing in the test copy has focus/], [ok(4242, "AXButton"), true, /not a text box/], [ok(), false, /no longer running/]] as const) {
			const { guard, posts } = rig([answer], alive);
			expect(() => guard.key("key code 36")).toThrow(why);
			expect(posts).toEqual([]);
		}
	});
	it("a key for a control still needs a window and a focus, but not a text box", () => {
		const a = rig([ok(4242, "AXGroup")]);
		a.guard.keyOnControl("key code 36");
		expect(a.posts.length).toBe(1);
		const b = rig(["nofocus"]);
		expect(() => b.guard.keyOnControl("key code 36")).toThrow();
		expect(b.posts).toEqual([]);
	});
});

/** A guard with its answers scripted: osa answers the check in turn, post() records, nothing touches the Mac. */
function rig(answers: string[], alive = true) {
	const posts: { pid: number; event: unknown }[] = [];
	const osaCalls: string[] = [];
	const failures: string[] = [];
	let i = 0;
	const guard = guardedTyping({
		osa: (script: string) => {
			osaCalls.push(script);
			return { stdout: answers[Math.min(i++, answers.length - 1)] };
		},
		fail: (msg: string) => {
			failures.push(msg);
			throw new Error(msg);
		},
		pid: () => 4242,
		post: (pid: number, event: unknown) => (posts.push({ pid, event }), { ok: true, error: "" }),
		alive: () => alive,
		copiesOf: () => 1,
	});
	return { guard, posts, osaCalls, failures };
}
