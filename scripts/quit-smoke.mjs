#!/usr/bin/env node
// The quit smoke test (docs/quit-paths.md): macOS only, outside `npm test`, run before every release.
//
// For each quit route it starts the BUILT app on a fixture copy, opens the project, types a marker into the
// editor, sends the route before the 2 s save could fire, and checks that the app ran the ordinary close, ended
// in time, that the marker reached the disk (in the chapter, or in a recovery file), and that the writing session
// was ended and recorded by the close. The Apple-event route
// is the run-loop proof: while macOS waits on "terminate later" it runs the main loop in a restricted mode, and
// the marker only lands if the window's script, its calls into Rust, Rust's file work and quit_ready all ran in it.
//
// It drives the window with System Events: the terminal running it needs Accessibility permission, and the
// screen must be unlocked. Usage: npm run test:quit [-- path/to/storyForge.app]
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedTyping } from "./lib/typingGuard.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const DATA_FOLDER = `Library/Application Support/${BUNDLE_ID}`;
const app = resolve(process.argv[2] ?? join(root, "src-tauri/target/universal-apple-darwin/release/bundle/macos/storyForge.app"));
const binary = join(app, "Contents/MacOS/storyforge");
const fixture = join(root, "test/fixtures/series");
const REAL_DATA = join(homedir(), DATA_FOLDER);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
const osa = (script, ...args) => run("osascript", ["-e", script, ...args]);
const children = new Set();
const fail = (msg) => {
	for (const c of children) c.kill("SIGKILL");
	console.error(`\nREFUSED/FAILED: ${msg}`);
	process.exit(1);
};

// ---- Refuse to run unless it is safe ----------------------------------------------------------------------
if (process.platform !== "darwin") fail("macOS only.");
if (!existsSync(binary)) fail(`no built app at ${app}. Run npm run app:build first.`);
if (run("pgrep", ["-ix", "storyforge"]).stdout.trim()) fail("storyForge is already running. The quit event targets the app by bundle ID, so it would quit that one. Quit it first.");
if (/CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(run("sh", ["-c", "ioreg -n Root -d1 -a"]).stdout.replace(/\s+/g, " ").replace(/> </g, "><"))) fail("the screen is locked: the window can't be driven.");
if (osa('tell application "System Events" to get name of first process').status !== 0) fail("System Events is not allowed to drive apps. Give this terminal Accessibility permission.");

const realBefore = existsSync(REAL_DATA) ? JSON.stringify(readdirSync(REAL_DATA).map((n) => [n, statSync(join(REAL_DATA, n)).mtimeMs])) : "";

// ---- Driving the window -----------------------------------------------------------------------------------
const findScript = `on run argv
	set role_ to item 1 of argv
	set prefix to item 2 of argv
	set act to item 3 of argv
	tell application "System Events" to tell process "storyforge"
		if (count of windows) is 0 then return "nowindow"
		set els to entire contents of window 1
		repeat with i from 1 to count of els
			set e to item i of els
			set r to "?"
			set n to ""
			try
				set r to (role of e) as string
				set n to (name of e) as string
			end try
			if r is role_ and n starts with prefix then
				if act is "click" then click e
				if act is "focus" then
					set frontmost to true
					set focused of e to true
				end if
				if act is "isfocused" then return "found " & ((focused of e) as string)
				if act is "value" then return "found " & ((value of e) as string)
				return "found " & n
			end if
		end repeat
	end tell
	return "none"
end run`;
const find = (role, prefix, act) => (osa(findScript, role, prefix, act).stdout || "").trim();
async function until(what, fn, ms = 20000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const v = fn();
		if (v) return v;
		await sleep(250);
	}
	fail(`timed out waiting for ${what}`);
}
/** The field's own content, read back through accessibility (null if it can't be found). */
const valueOf = (role, prefix) => {
	const out = find(role, prefix, "value");
	return out.startsWith("found ") ? out.slice(6) : null;
};
const isFocused = (role, prefix) => find(role, prefix, "isfocused") === "found true";
// Every keystroke goes through the typing guard (decision 72): nothing is typed unless the test copy is in front with a text box focused.
const typing = guardedTyping({ osa, fail });
const sendKeys = typing.sendKeysAtOnce;

// ---- One route --------------------------------------------------------------------------------------------
const results = [];
let notTypedRetries = 0;
class EarlySave extends Error {}
let earlySaveRetries = 0;
/** Runs a route, retrying (up to three runs) when something else took the focus and the typed text was saved early. */
async function routeWithRetries(name, send, options = {}) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			return await route(name, send, options);
		} catch (e) {
			if (!(e instanceof EarlySave)) throw e;
			earlySaveRetries++;
			console.log(`  (${name}: attempt ${attempt}: the text was saved before the quit, because another app took the focus; retrying)`);
		}
	}
	results.push({ name, note: "", ok: false, took: 0, problems: ["NOT RUN: the typed text was saved before the quit in 3 runs in a row (another app keeps taking the focus: this is not a pass)"] });
}
async function route(name, send, { expectJoin = false, target = "chapter" } = {}) {
	name = target === "plot" ? `${name}, typing in a plot note` : name;
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-quit-")));
	const home = join(dir, "home");
	const project = join(dir, "proj");
	cpSync(fixture, project, { recursive: true });
	const data = join(home, DATA_FOLDER);
	mkdirSync(data, { recursive: true });
	writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
	const newMarker = () => `QUITSMOKE${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
	let marker = newMarker();
	let notTyped = false;

	let stderr = "";
	const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: ["ignore", "ignore", "pipe"] });
	children.add(child);
	child.stderr.on("data", (d) => (stderr += d));
	let exited = null;
	child.on("exit", (code, signal) => (exited = { code, signal, at: Date.now() }));

	try {
		await until("the window", () => find("AXButton", "Open Project", "none").startsWith("found"));
		// The temporary HOME really redirects the app's data folder: the start screen lists OUR fixture copy.
		await until("the temporary recent project (HOME redirect)", () => find("AXButton", `proj ${dir}`, "none").startsWith("found"), 8000);
		find("AXButton", `proj ${dir}`, "click");
		await until("an editor", () => find("AXTextArea", "Text", "focus").startsWith("found"));
		await sleep(400);
		if (target === "plot") {
			// To the library side, the novel tab, and into a chapter card's plot note: it has focus, nothing has been committed.
			const clickAny = (name) => ["AXButton", "AXCheckBox", "AXToggle", "AXRadioButton", "AXTab"].some((role) => find(role, name, "click").startsWith("found"));
			await until("the novel name", () => clickAny("Open the novel on the library side"));
			await until("the novel tab", () => clickAny("novel"), 8000);
			await until("a plot note", () => find("AXTextArea", "Plot note for", "focus").startsWith("found"));
		}
		// Type, then prove the text is in the field before the quit is sent: a run where the keystrokes never landed is
		// "not typed" and is retried with a new marker, never counted as a pass. Text that landed and is missing after
		// the quit is a real loss (checked below).
		const fieldRole = "AXTextArea";
		const fieldName = target === "plot" ? "Plot note for" : "Text";
		let typed = false;
		for (let attempt = 1; attempt <= 4 && !typed; attempt++) {
			find(fieldRole, fieldName, "focus");
			await until("the field to have focus", () => isFocused(fieldRole, fieldName), 8000);
			await sleep(400);
			marker = newMarker();
			sendKeys(marker);
			for (let look = 0; look < 6 && !typed; look++) {
				await sleep(look === 0 ? 100 : 200);
				typed = (valueOf(fieldRole, fieldName) ?? "").includes(marker);
			}
			if (!typed) {
				notTypedRetries++;
				console.log(`  (${name}: attempt ${attempt}: the typed text never reached the field; retrying)`);
			}
		}
		if (!typed) {
			notTyped = true;
			results.push({ name, note: "", ok: false, took: 0, problems: ["NOT TYPED: the keystrokes never reached the field in 4 attempts (the test could not run; this is not a pass)"] });
			return;
		}
		const onDiskEarly = grepTree(project, marker);
		// A field that has lost focus has committed (that is what it should do), so a marker already on disk means the
		// window lost focus to another app before the quit: this run proves nothing. It is retried, never counted as a pass.
		if (onDiskEarly.length) throw new EarlySave();
		const sent = Date.now();
		await send(child);
		await until(`the app to end after "${name}" (stderr so far: ${JSON.stringify(stderr)})`, () => exited, 20000);
		const took = exited.at - sent;
		const closes = (stderr.match(/close requested/g) ?? []).length;
		const joins = (stderr.match(/already under way/g) ?? []).length;
		const all = grepTree(project, marker);
		// Only the prose itself counts: the chapter or Codex note, or a recovery file. (A sidecar may mention it too.)
		const saved = all.filter((f) => /\/(_story-library|Codex|notes)\/.*\.md$/.test(f.slice(project.length)) || f.slice(project.length).startsWith("/_sf-backup/recovery/"));
		const problems = [];
		if (closes !== 1) problems.push(`expected one "close requested", saw ${closes}`);
		if (!/finished saving; quitting/.test(stderr)) problems.push("the window never said it finished saving");
		if (/made no progress for/.test(stderr)) problems.push("the watchdog fired");
		if (took > 8000) problems.push(`took ${took} ms (limit 8000)`);
		if (!saved.length) problems.push("LOST: the text was in the field before the quit and reached neither the chapter, the novel file nor a recovery file");
		// Ending the session is a step in the close: its file must be there, naming the chapter that was written in.
		const sessionsDir = join(project, "_backstage/storyforge/sessions");
		const sessionFiles = existsSync(sessionsDir) ? readdirSync(sessionsDir) : [];
		if (target === "plot") {
			if (!saved.some((f) => f.endsWith("/_story-library/novel-aaa.md"))) problems.push("the plot note was not committed to novel-aaa.md by the close");
		} else if (sessionFiles.length !== 1) problems.push(`expected one session file, found ${sessionFiles.length}`);
		else if (!/path: aaa\/ch-a1\.md/.test(readFileSync(join(sessionsDir, sessionFiles[0]), "utf8"))) problems.push("the session file doesn't name the chapter that was written in");
		else if (/recovered: true/.test(readFileSync(join(sessionsDir, sessionFiles[0]), "utf8"))) problems.push("the session was recovered rather than ended by the close");
		// A second request must never start a second close (closes === 1 above). Whether it was seen mid-close
		// depends on timing, so "joined" is reported, not required.
		const note = expectJoin ? (joins ? "second request joined" : "second request arrived after the close") : "";
		results.push({ name, note, ok: problems.length === 0, took, where: saved[0]?.replace(project, ""), problems });
	} finally {
		if (!exited) child.kill("SIGKILL");
		await sleep(300);
		rmSync(dir, { recursive: true, force: true });
	}
}

function grepTree(dir, needle) {
	const hits = [];
	const walk = (d) => {
		for (const n of readdirSync(d)) {
			const p = join(d, n);
			const s = statSync(p);
			if (s.isDirectory()) walk(p);
			else if (s.size < 5_000_000 && readFileSync(p, "latin1").includes(needle)) hits.push(p);
		}
	};
	walk(dir);
	return hits;
}

const appleQuit = () => osa(`tell application id "${BUNDLE_ID}" to quit`);
// Every route twice: once with text typed in the chapter editor, once with text typed in a plot note (a field that
// writes to the project and has focus when the quit arrives).
for (const target of ["chapter", "plot"]) {
	await routeWithRetries("Apple-event quit (the Dock's Quit, Log Out and Shut Down use this route)", () => appleQuit(), { target });
	await routeWithRetries("SIGTERM", (c) => c.kill("SIGTERM"), { target });
	await routeWithRetries("SIGHUP", (c) => c.kill("SIGHUP"), { target });
	await routeWithRetries("SIGINT", (c) => c.kill("SIGINT"), { target });
	await routeWithRetries("a quit while a close is under way joins it", async (c) => {
		c.kill("SIGTERM");
		await sleep(50);
		appleQuit();
	}, { expectJoin: true, target });
}

// ---- Report -----------------------------------------------------------------------------------------------
const realAfter = existsSync(REAL_DATA) ? JSON.stringify(readdirSync(REAL_DATA).map((n) => [n, statSync(join(REAL_DATA, n)).mtimeMs])) : "";
console.log("");
console.log(`"not typed" retries (keystrokes that never reached the field): ${notTypedRetries}; "saved early" retries (another app took the focus): ${earlySaveRetries}`);
for (const r of results) {
	console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${r.took} ms${r.where ? `, text saved in ${r.where}` : ""}${r.note ? `; ${r.note}` : ""})`);
	for (const p of r.problems) console.log(`        - ${p}`);
}
if (realBefore !== realAfter) console.log("\nFAIL  the real app data folder changed: the temporary HOME did not isolate the run");
process.exit(results.every((r) => r.ok) && realBefore === realAfter ? 0 : 1);
