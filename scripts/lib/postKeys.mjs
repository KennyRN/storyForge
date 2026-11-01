// Keys for the built-app scripts, posted to the test copy's own process (decision 90), never to "whatever is frontmost".
// System Events' `keystroke` and `key code` go to the frontmost app: if Finder is in front for an instant (the test copy is
// launching, quitting or closing a window), the keys act on the Desktop's icons (arrows select, Space opens Quick Look, ⌘↓ or
// Return opens). CGEventPostToPid delivers an event to one process only, so the worst a stray key can do is nothing.
//
// Pure functions (unit-tested) turn the scripts' key descriptions into events; a small C helper (postkey.c, built on demand) posts them,
// because a character's own text can be set on a key event only through a C pointer, which the scripting bridges cannot pass.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Key codes of the keys the scripts press by name or in a shortcut (letters, digits, Return, Tab, Escape, arrows). Punctuation is typed by character, not by key. */
const CODE = {
	a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
	1: 18, 2: 19, 3: 20, 4: 21, 6: 22, 5: 23, "=": 24, 9: 25, 7: 26, "-": 27, 8: 28, 0: 29, "]": 30, o: 31, u: 32, "[": 33, i: 34, p: 35,
	l: 37, j: 38, "'": 39, k: 40, ";": 41, "\\": 42, ",": 43, "/": 44, n: 45, m: 46, ".": 47, "`": 50,
	return: 36, tab: 48, space: 49, delete: 51, escape: 53, left: 123, right: 124, down: 125, up: 126,
};
export const FLAG = { shift: 0x20000, control: 0x40000, option: 0x80000, command: 0x100000 };

/**
 * The event for one typed character: { code, flags, unicode }. Every printable character is typed by a key event that CARRIES the character
 * itself (CGEventKeyboardSetUnicodeString), never by guessing which physical key makes it: key codes are positions on a keyboard, and the
 * Mac's layout decides what they type (on the British layout Shift+' is "@" and Shift+2 is a double quote, and the backtick key is
 * elsewhere), so a table of US key codes typed the wrong characters. A letter keeps its own key code (the letter keys are the same on every
 * QWERTY layout), so it still looks like a key press. The event is posted to the test copy's process alone (decision 91).
 * Return and Tab are keys, not characters. Only a control character, which has no business being typed, throws.
 */
export function eventForChar(ch) {
	if (ch === "\n") return { code: CODE.return, flags: 0 };
	if (ch === "\t") return { code: CODE.tab, flags: 0 };
	if (ch === " ") return { code: CODE.space, flags: 0, unicode: " " };
	if ([...ch].length === 1 && ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f) {
		const letter = ch.toLowerCase();
		return { code: /^[a-z]$/i.test(ch) ? CODE[letter] : 0, flags: 0, unicode: ch };
	}
	throw new Error(`the character ${JSON.stringify(ch)} can't be typed (a control character)`);
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
		// A shortcut is a key plus modifiers (⌘Z): only letters and digits, whose key codes are the same on every layout.
		if (!/^[a-z0-9]$/i.test(ks[1])) throw new Error(`can't post this shortcut to the test copy (only a letter or digit with modifiers): ${script}`);
		return { code: CODE[ks[1].toLowerCase()], flags };
	}
	throw new Error(`can't post this key to the test copy: ${script}`);
}

/** The helper's source, and where its compiled copy lives (a temporary folder, named by the source's hash, so it is rebuilt when the source changes). */
const SOURCE = fileURLToPath(new URL("./postkey.c", import.meta.url));
export function helperPath() {
	const hash = createHash("sha1").update(readFileSync(SOURCE)).digest("hex").slice(0, 12);
	const dir = join(tmpdir(), "storyforge-postkey");
	const bin = join(dir, `postkey-${hash}`);
	if (!existsSync(bin)) {
		mkdirSync(dir, { recursive: true });
		const r = spawnSync("clang", [SOURCE, "-o", bin, "-framework", "ApplicationServices"], { encoding: "utf8" });
		if (r.status !== 0) throw new Error(`the key-posting helper could not be built: ${(r.stderr || "").trim()}`);
	}
	return bin;
}

/** The helper's arguments to post one key to a single process. No System Events and no frontmost app anywhere in them. */
export function postArgs(pid, event) {
	if (!Number.isInteger(pid) || pid <= 1) throw new Error(`not a process to post keys to: ${pid}`);
	return [String(pid), String(event.code), String(event.flags), ...(event.unicode ? [event.unicode] : [])];
}

/** Posts one key to the process. Returns { ok, error }. */
export function postToPid(pid, event) {
	try {
		const r = spawnSync(helperPath(), postArgs(pid, event), { encoding: "utf8" });
		return { ok: r.status === 0, error: r.status === 0 ? "" : `the helper exited ${r.status} ${(r.stderr || "").trim()}` };
	} catch (e) {
		return { ok: false, error: e.message };
	}
}

/** What an event carries, made but not posted (for the tests). */
export function dryRun(event) {
	return spawnSync(helperPath(), ["--dry", "0", String(event.code), String(event.flags), ...(event.unicode ? [event.unicode] : [])], { encoding: "utf8" }).stdout.trim();
}
