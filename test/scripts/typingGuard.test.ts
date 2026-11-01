import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decide, guardedTyping } from "../../scripts/lib/typingGuard.mjs";
import { eventForChar, eventForScript, postScript } from "../../scripts/lib/postKeys.mjs";

const ok = (pid = 4242, role = "AXTextArea", name = "") => `pid=${pid};focus=${role};name=${name}`;

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
	it("says what the focus is on when it is not a text box", () => {
		expect(decide(ok(4242, "AXButton", "Chapters"), 1, { pid: 4242 }).why).toBe('focus is on AXButton ("Chapters"), not a text box');
		expect(decide("pid=4242;focus=AXButton", 1, { pid: 4242 }).why).toBe("focus is on AXButton, not a text box"); // an older answer without a name still reads
	});
	it("refuses a storyForge that isn't the test copy's own process, one that has gone, and one that has begun to quit", () => {
		expect(decide(ok(999), 1, { pid: 4242 }).ok).toBe(false);
		expect(decide(ok(), 1, { pid: 4242, alive: false }).why).toContain("no longer running");
		expect(decide(ok(), 1, { pid: 4242, quitting: true }).why).toContain("begun to quit");
	});
});

describe("keys are posted to the test copy's own process (decision 90, item 1)", () => {
	it("types every printable character by an event that carries the character, never by a guessed key position (the British layout's Shift+' is @)", () => {
		expect(eventForChar("a")).toEqual({ code: 0, flags: 0, unicode: "a" });
		expect(eventForChar("A")).toEqual({ code: 0, flags: 0, unicode: "A" });
		for (const ch of ['"', "'", "~", "`", "%", "[", "ƿ", "Ó", "—"]) expect(eventForChar(ch), ch).toEqual({ code: 0, flags: 0, unicode: ch }); // no shift flag, no key code that a layout could read differently
		expect(eventForChar("b")).toEqual({ code: 11, flags: 0, unicode: "b" }); // a letter keeps its own key
		expect(eventForChar(" ")).toEqual({ code: 49, flags: 0, unicode: " " });
		expect(eventForChar("\n")).toEqual({ code: 36, flags: 0 });
		expect(() => eventForChar("\u0007")).toThrow(/control character/);
	});
	it("a shortcut is a key plus modifiers: only letters and digits, whose key codes are the same on every layout; anything else is reported", () => {
		expect(eventForScript("key code 36")).toEqual({ code: 36, flags: 0 });
		expect(eventForScript("key code 125 using command down")).toEqual({ code: 125, flags: 0x100000 });
		expect(eventForScript('keystroke "z" using command down')).toEqual({ code: 6, flags: 0x100000 });
		expect(eventForScript('keystroke "a" using command down')).toEqual({ code: 0, flags: 0x100000 });
		expect(() => eventForScript('keystroke "!" using command down')).toThrow(/only a letter or digit/);
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
		expect(posts).toEqual([{ pid: 4242, event: { code: 0, flags: 0, unicode: "a" } }, { pid: 4242, event: { code: 11, flags: 0, unicode: "b" } }, { pid: 4242, event: { code: 36, flags: 0 } }]);
		expect(osaCalls.every((s: string) => s.includes("first process whose frontmost"))).toBe(true); // osa is only ever asked the check
	});
	it("a character with no US key is typed by an event that carries it, posted to the same process", () => {
		const s = postScript(4242, { code: 0, flags: 0, unicode: "ƿ" });
		expect(s).toContain("CGEventKeyboardSetUnicodeString(e, 1, [447])"); // U+01BF
		expect(s).toContain("CGEventPostToPid(4242");
		expect(s).not.toMatch(/System Events|keystroke|frontmost/);
		const { guard, posts } = rig(Array(3).fill(ok()));
		guard.sendKeys("aƿ");
		expect(posts.map((p) => p.pid)).toEqual([4242, 4242]);
		expect(posts[1].event).toEqual({ code: 0, flags: 0, unicode: "ƿ" });
	});
	it("a key description that can't be posted is reported and nothing is sent", () => {
		const { guard, posts, failures } = rig([ok()]);
		expect(() => guard.key('click button "x"')).toThrow(/can't post/);
		expect(posts).toEqual([]);
		expect(failures[0]).toContain("reported, not worked round");
	});
});

describe("the check runs immediately before each key (decision 90, item 2)", () => {
	it("stops at the first key after something else comes to the front, though the burst began fine", () => {
		const { guard, posts } = rig([ok(), ok(), "front=Finder (com.apple.finder)", ok()]);
		expect(() => guard.sendKeys("abcd")).toThrow(/REFUSING TO TYPE/);
		expect(posts.length).toBe(2); // a and b; c was refused and d never tried
	});
	it("waits out the test copy's own focus being between two things for a moment (sending nothing), but not anything else", () => {
		const settle = rig([ok(4242, "AXButton"), ok(4242, "AXButton"), ok()]);
		settle.guard.key("key code 36");
		expect(settle.posts.length).toBe(1);
		expect(settle.osaCalls.length).toBe(3);
		const other = rig(["front=Finder (com.apple.finder)", ok()]);
		expect(() => other.guard.key("key code 36")).toThrow(/Finder/);
		expect(other.osaCalls.length).toBe(1); // no retry for another app in front
		expect(other.posts).toEqual([]);
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

describe("changing the front window goes through the guard, by process id (decision 91)", () => {
	it("brings the test copy to the front by its process id, never by name", () => {
		const { guard, osaCalls } = rig([ok()]);
		guard.bringToFront();
		expect(osaCalls.length).toBe(1);
		expect(osaCalls[0]).toContain("first process whose unix id is 4242");
		expect(osaCalls[0]).not.toContain('"storyforge"');
	});
	it("is refused whenever the guard would refuse a key (except that the test copy isn't in front yet): quitting, gone, or more than one copy", () => {
		const q = rig([ok()]);
		q.guard.beginQuit();
		expect(() => q.guard.bringToFront()).toThrow(/begun to quit/);
		expect(() => rig([ok()], false).guard.bringToFront()).toThrow(/no longer running/);
		expect(() => rig([ok()], true, 2).guard.bringToFront()).toThrow(/2 copies/);
		expect(q.osaCalls).toEqual([]);
	});
	it("no script changes the front window or sends a key any other way", () => {
		const dir = new URL("../../scripts/", import.meta.url);
		for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
			const text = readFileSync(new URL(f, dir), "utf8");
			expect(text, `${f}: set frontmost`).not.toMatch(/set frontmost to true/);
			expect(text, `${f}: System Events keystroke`).not.toMatch(/\bkeystroke \(|System Events" to key|to key code/);
		}
		const guard = readFileSync(new URL("lib/typingGuard.mjs", dir), "utf8");
		expect(guard.match(/set frontmost of/g)?.length).toBe(1); // the one place, with its by-pid target and its refusals
	});
});

/** A guard with its answers scripted: osa answers the check in turn, post() records, nothing touches the Mac. */
function rig(answers: string[], alive = true, copies = 1) {
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
		copiesOf: () => copies,
	});
	return { guard, posts, osaCalls, failures };
}
