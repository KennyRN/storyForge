// The standing rule for every script that types into the real app (AGENTS.md, decisions 72 and 90): immediately before EACH key,
// the throwaway copy of storyForge must be the frontmost app, the only one running, with its window showing and one of its own text
// boxes focused; and the key is POSTED TO THAT PROCESS ALONE (postKeys.mjs), never to whatever is frontmost. If anything else is in
// front (a dialog, another app, Kenny's windows), nothing is sent: the script stops and says what was in front. No key is sent once
// the test copy has begun to quit. A key that can't be posted that way is reported, never worked round.
import { spawnSync } from "node:child_process";
import { eventForChar, eventForScript, postToPid } from "./postKeys.mjs";

export const BUNDLE_ID = "io.github.kennyrn.storyforge";
const SETTLE_MS = 250;
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
				set d to ""
				try
					set d to (value of attribute "AXTitle" of f) as string
				end try
				if d is "" then
					try
						set d to (value of attribute "AXDescription" of f) as string
					end try
				end if
				return "pid=" & (unix id of fp) & ";focus=" & ((value of attribute "AXRole" of f) as string) & ";name=" & d
			on error
				return "nofocus"
			end try
		end tell
	end tell
end run`;

/**
 * Turns the check's answer into a decision. Pure, so it is unit-tested; the AppleScript above is proved in the built app.
 * `copies`: how many storyForge processes are running. `options.anyFocus`: for a key meant for something that isn't a text box
 * (Return on a focused Codex row); the app must still be in front, alone. `options.pid`: the test copy's own process id, which the
 * frontmost storyForge must be. `options.alive`: that process still exists. `options.quitting`: the test copy has begun to quit.
 */
export function decide(answer, copies, options = {}) {
	const { anyFocus = false, pid = null, alive = true, quitting = false } = typeof options === "boolean" ? { anyFocus: options } : options;
	const a = (answer || "").trim();
	if (quitting) return { ok: false, why: "the test copy has begun to quit; no key is sent to it now" };
	if (!alive) return { ok: false, why: "the test copy is no longer running" };
	if (copies !== 1) return { ok: false, why: `${copies} copies of storyForge are running; only the throwaway copy may be (never type beside Kenny's own)` };
	if (a.startsWith("front=")) return { ok: false, why: `${a.slice(6)} is in front, not the test copy of storyForge` };
	if (a === "nowindow") return { ok: false, why: "the test copy's window is not showing" };
	if (a === "nofocus") return { ok: false, why: "nothing in the test copy has focus" };
	const m = /^pid=(\d+);focus=([^;]+)(?:;name=(.*))?$/s.exec(a);
	if (m) {
		if (pid !== null && Number(m[1]) !== pid) return { ok: false, why: `the frontmost storyForge (process ${m[1]}) is not the test copy (process ${pid})` };
		return anyFocus || TEXT_ROLES.includes(m[2]) ? { ok: true, why: "" } : { ok: false, why: `focus is on ${m[2]}${m[3] ? ` ("${m[3]}")` : ""}, not a text box` };
	}
	return { ok: false, why: `the frontmost check gave no answer (${a || "empty"})` };
}

/**
 * `osa` is the script's own osascript runner, `fail` its own exit, `pid` gives the test copy's process id (its own child),
 * `post` (default: a real post) sends one key event to that process. Returns the typing helpers the script uses in place of its own.
 *
 * Decision 90: every key is posted to the test copy's own process, never to the frontmost app, and the check runs immediately before
 * EACH key, not only before a burst. No key is sent once `beginQuit()` has been called, once the process is gone, before its window is
 * showing, or unless a text box has focus (a control, for `keyOnControl`).
 */
export function guardedTyping({ osa, fail, pid, post = postToPid, alive = isAlive, copiesOf = copies }) {
	const sleep = (ms) => spawnSync("sleep", [String(ms / 1000)]);
	let quitting = false;
	let lastKeyAt = 0;
	const ready = (anyFocus = false) => {
		const p = pid();
		return decide(osa(CHECK, BUNDLE_ID).stdout, copiesOf(), { anyFocus, pid: p, alive: Number.isInteger(p) && alive(p), quitting });
	};
	/** The check, immediately before one key; the first key after a pause also waits a moment (a key straight after an accessibility query was being dropped). */
	const assertReady = (what = "typing", anyFocus = false) => {
		let r = ready(anyFocus);
		// The test copy's own focus can be between two things for a moment right after a key (the editor re-focusing itself). Only that is
		// waited out, with nothing sent meanwhile; anything else (another app in front, a quit, a gone process) refuses at once.
		for (let tries = 0; !r.ok && /^(focus is on|nothing in the test copy has focus)/.test(r.why) && tries < 8; tries++) {
			sleep(100);
			r = ready(anyFocus);
		}
		if (!r.ok) fail(`REFUSING TO TYPE (${what}): ${r.why}. Nothing was typed. Dismiss or close whatever is in front, then run again.`);
		if (Date.now() - lastKeyAt > 1000) sleep(SETTLE_MS);
	};
	const sendOne = (event, what, anyFocus) => {
		assertReady(what, anyFocus);
		const r = post(pid(), event);
		lastKeyAt = Date.now();
		if (!r.ok) fail(`a key could not be posted to the test copy (${what}): ${r.error}`);
	};
	const eventsFor = (text) => {
		try {
			return [...text].map(eventForChar);
		} catch (e) {
			return fail(`${e.message}. It is reported, not worked round.`);
		}
	};
	const eventFor = (script) => {
		try {
			return eventForScript(script);
		} catch (e) {
			return fail(`${e.message}. It is reported, not worked round.`);
		}
	};
	const type = (text) => {
		const events = eventsFor(text);
		[...text].forEach((ch, i) => sendOne(events[i], `keystroke ${JSON.stringify(ch)}`, false));
	};
	return {
		ready,
		assertReady,
		/** The scripts call this just before they quit the test copy: from then on no key is sent. */
		beginQuit() {
			quitting = true;
		},
		/** A new test copy is about to start. */
		reset() {
			quitting = false;
			lastKeyAt = 0;
		},
		sendKeysAtOnce: type,
		/** One key at a time, each checked immediately before it is posted to the test copy's process. */
		sendKeys: type,
		/** A key code or a keystroke with modifiers, e.g. key("key code 36") or key('keystroke "z" using command down'). */
		key(script) {
			sendOne(eventFor(script), script, false);
		},
		/** A key for a control that is not a text box (Return on a focused Codex row): still only to the test copy, in front, alone. */
		keyOnControl(script) {
			sendOne(eventFor(script), script, true);
		},
		/**
		 * Brings the test copy to the front, by its process id (never by name): refused whenever the guard would refuse a key for any
		 * reason other than the test copy not being in front yet (more than one storyForge, the process gone, or it has begun to quit).
		 */
		bringToFront() {
			const p = pid();
			if (quitting) fail("REFUSING TO CHANGE THE FRONT WINDOW: the test copy has begun to quit.");
			if (!Number.isInteger(p) || !alive(p)) fail("REFUSING TO CHANGE THE FRONT WINDOW: the test copy is no longer running.");
			if (copiesOf() !== 1) fail(`REFUSING TO CHANGE THE FRONT WINDOW: ${copiesOf()} copies of storyForge are running; only the throwaway copy may be.`);
			osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${p}) to true`);
		},
		sleep,
	};
}

function copies() {
	return spawnSync("pgrep", ["-ix", "storyforge"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).length;
}
function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
