// Keys for the built-app scripts, posted to the test copy's own process (decision 90), never to "whatever is frontmost".
// System Events' `keystroke` and `key code` go to the frontmost app: if Finder is in front for an instant (the test copy is
// launching, quitting or closing a window), the keys act on the Desktop's icons (arrows select, Space opens Quick Look, ⌘↓ or
// Return opens). CGEventPostToPid delivers an event to one process only, so the worst a stray key can do is nothing.
//
// Pure functions (unit-tested) turn the scripts' key descriptions into events; one function posts them.
import { spawnSync } from "node:child_process";

/** US ANSI key codes. A character with no entry here can't be posted (it is reported, never worked round). */
const CODE = {
	a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
	1: 18, 2: 19, 3: 20, 4: 21, 6: 22, 5: 23, "=": 24, 9: 25, 7: 26, "-": 27, 8: 28, 0: 29, "]": 30, o: 31, u: 32, "[": 33, i: 34, p: 35,
	l: 37, j: 38, "'": 39, k: 40, ";": 41, "\\": 42, ",": 43, "/": 44, n: 45, m: 46, ".": 47, "`": 50,
	return: 36, tab: 48, space: 49, delete: 51, escape: 53, left: 123, right: 124, down: 125, up: 126,
};
/** Characters typed with Shift, and the unshifted key they sit on. */
const SHIFTED = { "~": "`", "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", _: "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/" };
export const FLAG = { shift: 0x20000, control: 0x40000, option: 0x80000, command: 0x100000 };

/** The events for one typed character: { code, flags }. Throws for a character that has no key on a US keyboard. */
export function eventForChar(ch) {
	if (ch === " ") return { code: CODE.space, flags: 0 };
	if (ch === "\n") return { code: CODE.return, flags: 0 };
	if (ch === "\t") return { code: CODE.tab, flags: 0 };
	if (ch in CODE && ch.length === 1) return { code: CODE[ch], flags: 0 };
	if (/^[A-Z]$/.test(ch)) return { code: CODE[ch.toLowerCase()], flags: FLAG.shift };
	if (ch in SHIFTED) return { code: CODE[SHIFTED[ch]], flags: FLAG.shift };
	throw new Error(`the character ${JSON.stringify(ch)} has no key that can be posted to the test copy`);
}

/** Turns a scripts' key description (the form they passed System Events) into one event: `key code 36`, `key code 125 using command down`, `keystroke "a" using command down`. */
export function eventForScript(script) {
	const using = /\busing (.+?) down\s*$/.exec(script)?.[1] ?? "";
	let flags = 0;
	for (const m of using.split(/,| and /).map((s) => s.trim()).filter(Boolean)) {
		if (!(m in FLAG)) throw new Error(`unknown modifier "${m}" in ${script}`);
		flags |= FLAG[m];
	}
	const code = /^key code (\d+)/.exec(script.trim());
	if (code) return { code: Number(code[1]), flags };
	const ks = /^keystroke "(.)"/.exec(script.trim());
	if (ks) {
		const e = eventForChar(ks[1]);
		return { code: e.code, flags: flags | e.flags };
	}
	throw new Error(`can't post this key to the test copy: ${script}`);
}

/** The JXA (JavaScript for Automation) that posts one key, down then up, to a single process. Contains no System Events and no frontmost app. */
export function postScript(pid, event) {
	if (!Number.isInteger(pid) || pid <= 1) throw new Error(`not a process to post keys to: ${pid}`);
	return `ObjC.import('CoreGraphics');
for (const down of [true, false]) {
	const e = $.CGEventCreateKeyboardEvent(null, ${event.code}, down);
	$.CGEventSetFlags(e, ${event.flags});
	$.CGEventPostToPid(${pid}, e);
	$.usleep(8000);
}`;
}

/** Posts one key to the process. Returns { ok, error }. */
export function postToPid(pid, event) {
	const r = spawnSync("osascript", ["-l", "JavaScript", "-e", postScript(pid, event)], { encoding: "utf8" });
	return { ok: r.status === 0, error: (r.stderr || "").trim() };
}
