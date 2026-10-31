// The standing rule for every script that types into the real app (AGENTS.md, decision 72): before each burst of
// keystrokes, the throwaway copy of storyForge must be the frontmost app, with one of its own text boxes focused.
// If anything else is in front (a dialog, another app, Kenny's windows), nothing is typed: the script stops and says
// what was in front. Keystrokes go to whatever is frontmost, so typing without this check can land in someone's file.
import { spawnSync } from "node:child_process";

export const BUNDLE_ID = "io.github.kennyrn.storyforge";
const TEXT_ROLES = ["AXTextArea", "AXTextField"];

const CHECK = `on run argv
	tell application "System Events"
		set fp to first process whose frontmost is true
		set bid to ""
		try
			set bid to bundle identifier of fp
		end try
		if bid is not (item 1 of argv) then return "front=" & (name of fp) & " (" & bid & ")"
		tell fp
			if (count of windows) is 0 then return "nowindow"
			try
				set f to value of attribute "AXFocusedUIElement"
				return "focus=" & ((value of attribute "AXRole" of f) as string)
			on error
				return "nofocus"
			end try
		end tell
	end tell
end run`;

/** Turns the check's answer into a decision. Pure, so it is unit-tested; the AppleScript above is proved in the built app. */
/** `anyFocus`: for a key meant for something that isn't a text box (Return on a focused Codex row); the app must still be in front, alone. */
export function decide(answer, copies, anyFocus = false) {
	const a = (answer || "").trim();
	if (copies !== 1) return { ok: false, why: `${copies} copies of storyForge are running; only the throwaway copy may be (never type beside Kenny's own)` };
	if (a.startsWith("front=")) return { ok: false, why: `${a.slice(6)} is in front, not the test copy of storyForge` };
	if (a === "nowindow") return { ok: false, why: "the test copy has no window in front" };
	if (a === "nofocus") return { ok: false, why: "nothing in the test copy has focus" };
	if (a.startsWith("focus=")) {
		const role = a.slice(6);
		return anyFocus || TEXT_ROLES.includes(role) ? { ok: true, why: "" } : { ok: false, why: `focus is on ${role}, not a text box` };
	}
	return { ok: false, why: `the frontmost check gave no answer (${a || "empty"})` };
}

/**
 * `osa` is the script's own osascript runner, `fail` its own exit. Returns the typing helpers the script uses in place
 * of its own: every one checks first, and none types if the check fails.
 */
export function guardedTyping({ osa, fail }) {
	const copies = () => spawnSync("pgrep", ["-ix", "storyforge"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).length;
	const ready = (anyFocus = false) => decide(osa(CHECK, BUNDLE_ID).stdout, copies(), anyFocus);
	const assertReady = (what = "typing", anyFocus = false) => {
		const r = ready(anyFocus);
		if (!r.ok) fail(`REFUSING TO TYPE (${what}): ${r.why}. Nothing was typed. Dismiss or close whatever is in front, then run again.`);
	};
	const sleep = (ms) => spawnSync("sleep", [String(ms / 1000)]);
	return {
		ready,
		assertReady,
		/** The whole string in one call (the quit script's way), after one check. */
		sendKeysAtOnce(text) {
			assertReady("keystrokes");
			return osa('on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run', text);
		},
		/** One key at a time, 40 ms apart, in chunks of eight with a check before each (a dialog can appear mid-word). */
		sendKeys(text) {
			for (let i = 0; i < text.length; i += 8) {
				assertReady("keystrokes");
				osa('on run argv\nset t to item 1 of argv\ntell application "System Events"\nrepeat with i from 1 to count of t\nkeystroke (character i of t)\ndelay 0.04\nend repeat\nend tell\nend run', text.slice(i, i + 8));
			}
		},
		/** A key code or a keystroke with modifiers, e.g. key("key code 36") or key('keystroke "z" using command down'). */
		key(script) {
			assertReady(script);
			return osa(`tell application "System Events" to ${script}`);
		},
		/** A key for a control that is not a text box (Return on a focused Codex row): still only if the test copy is in front, alone. */
		keyOnControl(script) {
			assertReady(script, true);
			return osa(`tell application "System Events" to ${script}`);
		},
		sleep,
	};
}
