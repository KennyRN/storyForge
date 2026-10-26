#!/usr/bin/env node
// The quit smoke test (docs/quit-paths.md): macOS only, outside `npm test`, run before every release.
//
// For each quit route it starts the BUILT app on a fixture copy, opens the project, types a marker into the
// editor, sends the route before the 2 s save could fire, and checks that the app ran the ordinary close, ended
// in time, and that the marker reached the disk (in the chapter, or in a recovery file). The Apple-event route
// is the run-loop proof: while macOS waits on "terminate later" it runs the main loop in a restricted mode, and
// the marker only lands if the window's script, its calls into Rust, Rust's file work and quit_ready all ran in it.
//
// It drives the window with System Events: the terminal running it needs Accessibility permission, and the
// screen must be unlocked. Usage: npm run test:quit [-- path/to/storyForge.app]
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const fail = (msg) => {
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
const sendKeys = (text) => osa('on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run', text);

// ---- One route --------------------------------------------------------------------------------------------
const results = [];
async function route(name, send, { expectJoin = false } = {}) {
	const dir = mkdtempSync(join(tmpdir(), "sf-quit-"));
	const home = join(dir, "home");
	const project = join(dir, "proj");
	cpSync(fixture, project, { recursive: true });
	const data = join(home, DATA_FOLDER);
	mkdirSync(data, { recursive: true });
	writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
	const marker = `QUITSMOKE${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

	let stderr = "";
	const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: ["ignore", "ignore", "pipe"] });
	child.stderr.on("data", (d) => (stderr += d));
	let exited = null;
	child.on("exit", (code, signal) => (exited = { code, signal, at: Date.now() }));

	try {
		await until("the window", () => find("AXButton", "Open Project", "none").startsWith("found"));
		// The temporary HOME really redirects the app's data folder: the start screen lists OUR fixture copy.
		await until("the temporary recent project (HOME redirect)", () => find("AXButton", `${"proj"} ${project}`, "none").startsWith("found"), 8000);
		find("AXButton", `proj ${project}`, "click");
		await until("an editor", () => find("AXTextArea", "Text", "focus").startsWith("found"));
		await sleep(400);
		sendKeys(marker);
		await sleep(150);
		const onDiskEarly = grepTree(project, marker);
		if (onDiskEarly.length) fail(`${name}: the marker was already saved before the quit, so this run proves nothing`);
		const sent = Date.now();
		await send(child);
		await until("the app to end", () => exited, 20000);
		const took = exited.at - sent;
		const closes = (stderr.match(/close requested/g) ?? []).length;
		const joins = (stderr.match(/already under way/g) ?? []).length;
		const saved = grepTree(project, marker);
		const problems = [];
		if (closes !== 1) problems.push(`expected one "close requested", saw ${closes}`);
		if (!/finished saving; quitting/.test(stderr)) problems.push("the window never said it finished saving");
		if (/did not answer in time/.test(stderr)) problems.push("the watchdog fired");
		if (took > 8000) problems.push(`took ${took} ms (limit 8000)`);
		if (!saved.length) problems.push("the typed text reached neither the chapter nor a recovery file");
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
await route("Apple-event quit (the Dock's Quit, Log Out and Shut Down use this route)", () => appleQuit());
await route("SIGTERM", (c) => c.kill("SIGTERM"));
await route("SIGHUP", (c) => c.kill("SIGHUP"));
await route("SIGINT", (c) => c.kill("SIGINT"));
await route("a quit while a close is under way joins it", async (c) => {
	c.kill("SIGTERM");
	await sleep(50);
	appleQuit();
}, { expectJoin: true });

// ---- Report -----------------------------------------------------------------------------------------------
const realAfter = existsSync(REAL_DATA) ? JSON.stringify(readdirSync(REAL_DATA).map((n) => [n, statSync(join(REAL_DATA, n)).mtimeMs])) : "";
console.log("");
for (const r of results) {
	console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${r.took} ms${r.where ? `, text saved in ${r.where}` : ""}${r.note ? `; ${r.note}` : ""})`);
	for (const p of r.problems) console.log(`        - ${p}`);
}
if (realBefore !== realAfter) console.log("\nFAIL  the real app data folder changed: the temporary HOME did not isolate the run");
process.exit(results.every((r) => r.ok) && realBefore === realAfter ? 0 : 1);
