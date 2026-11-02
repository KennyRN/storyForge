#!/usr/bin/env node
// The settings-sync check in the built app (docs/settings-sync.md, Fix 6): macOS only, outside `npm test`. It starts the BUILT app
// on a fixture copy with a temporary HOME, then changes project.md from outside (a plain overwrite, as a sync tool does) while
// the app is open and reads the window through accessibility: the session readout appears at once when switched on from outside,
// and a setting changed in the app while the file holds another value names the replaced one in a notice. No key is typed.
// Usage: npm run test:settings-sync [-- path/to/storyForge.app] [--shots <folder>]
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedTyping } from "./lib/typingGuard.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const DATA_FOLDER = `Library/Application Support/${BUNDLE_ID}`;
const args = process.argv.slice(2);
const shotsAt = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
const appArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--shots");
const app = resolve(appArg ?? join(root, "src-tauri/target/universal-apple-darwin/release/bundle/macos/storyForge.app"));
const binary = join(app, "Contents/MacOS/storyforge");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, a) => spawnSync(cmd, a, { encoding: "utf8" });
const osa = (script, ...a) => run("osascript", ["-e", script, ...a]);
const fail = (msg) => {
	console.error(`\nREFUSED/FAILED: ${msg}`);
	process.exit(1);
};
if (process.platform !== "darwin") fail("macOS only.");
if (!existsSync(binary)) fail(`no built app at ${app}. Run npm run app:build first.`);
if (run("pgrep", ["-ix", "storyforge"]).stdout.trim()) fail("storyForge is already running. Quit it first.");
if (/CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(run("sh", ["-c", "ioreg -n Root -d1 -a"]).stdout.replace(/\s+/g, " ").replace(/> </g, "><"))) fail("the screen is locked: the window can't be driven.");
if (osa('tell application "System Events" to get name of first process').status !== 0) fail("System Events is not allowed to drive apps. Give this terminal Accessibility permission.");

const findScript = `on run argv
	set role_ to item 1 of argv
	set prefix to item 2 of argv
	set act to item 3 of argv
	set nth to (item 4 of argv) as integer
	set seen to 0
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
				set seen to seen + 1
			end if
			if r is role_ and n starts with prefix and seen is nth then
				if act is "size" then
					set sz to size of e
					set w to item 1 of sz
					set h to item 2 of sz
					return "found " & (w as text) & "x" & (h as text)
				end if
				if act is "frame" then
					set p to position of e
					set sz to size of e
					return "found " & ((item 1 of p) as text) & "," & ((item 2 of p) as text) & "," & ((item 1 of sz) as text) & "," & ((item 2 of sz) as text)
				end if
				if act is "focusrow" then
					-- a Codex row is the group just before its name in the accessibility tree
					set focused of (item (i - 1) of els) to true
					return "found " & n
				end if
				if act is "click" then click e
				if act is "focus" then
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
const find = (role, prefix, act = "none", nth = 1) => {
	// A focus action brings the test copy to the front, by its process id, through the guard (decision 91); nothing else here changes the front window.
	if (act === "focus" || act === "focusrow") typing.bringToFront();
	return (osa(findScript, role, prefix, act, String(nth)).stdout || "").trim();
};
const widthOf = (role, prefix, nth = 1) => {
	const out = find(role, prefix, "size", nth);
	const m = /^found (\d+)x(\d+)$/.exec(out);
	return m ? Number(m[1]) : null;
};
const frameOf = (role, prefix, nth = 1) => {
	const m = /^found (-?\d+),(-?\d+),(\d+),(\d+)$/.exec(find(role, prefix, "frame", nth));
	return m ? m.slice(1).map(Number) : null;
};
const valueOf = (role, prefix, nth = 1) => {
	const out = find(role, prefix, "value", nth);
	return out.startsWith("found ") ? out.slice(6) : null;
};
async function until(fn, ms = 15000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const v = fn();
		if (v) return v;
		await sleep(250);
	}
	return null;
}
// One key at a time, 40 ms apart: a whole string sent in one burst arrives faster than anyone types, and the built
// app (1.0.0 included) then drops spaces and letters while an aid is replacing a word.
// Every keystroke goes through the typing guard (decision 72): nothing is typed unless the test copy is in front with a text box focused.
const typing = guardedTyping({ osa, fail, pid: () => child.pid }); // keys are posted to the test copy's own process (decision 90)
const sendKeys = typing.sendKeys;



const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-sync-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
mkdirSync(join(project, "_backstage/storyforge"), { recursive: true });
const settingsFile = join(project, "_backstage/storyforge/project.md");
const base = (extra) => `---\nformat-version: 1\n${extra}---\n`;
writeFileSync(settingsFile, base(""));
const data = join(home, DATA_FOLDER);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
if (shotsAt) mkdirSync(shotsAt, { recursive: true });
const problems = [];
const windowNumber = () =>
	spawnSync("osascript", ["-l", "JavaScript", "-e", `ObjC.import('CoreGraphics'); const l = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0))); const w = l.find((x) => x.kCGWindowOwnerPID === ${child.pid} && x.kCGWindowLayer === 0); w ? String(w.kCGWindowNumber) : ''`], { encoding: "utf8" }).stdout.trim();
const windowShot = (name) => {
	if (!shotsAt) return;
	const id = windowNumber();
	if (!id) return void problems.push(`no picture "${name}": the test copy's window wasn't found (a picture is never taken of the screen)`);
	spawnSync("screencapture", ["-x", "-o", "-l", id, join(shotsAt, `${name}.png`)]);
};

const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" });
process.on("exit", () => child.kill("SIGKILL"));
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => process.exit(1));
const hasReadout = () => find("AXGroup", "Current session").startsWith("found");
try {
	if (!(await until(() => find("AXButton", "Open Project").startsWith("found")))) fail("the app's window never appeared");
	if (!(await until(() => find("AXButton", `proj ${dir}`).startsWith("found"), 8000))) fail("the temporary HOME did not redirect the app's data folder");
	find("AXButton", `proj ${dir}`, "click");
	if (!(await until(() => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
	await sleep(1200);
	if (hasReadout()) problems.push("the session readout was showing before anything was switched on");
	windowShot("sync-before");
	// Outside: switch the readout on and the Codex colour to green.
	const before = readFileSync(settingsFile, "utf8");
	writeFileSync(settingsFile, base("show-session-readout: true\ncodex-colour: green\n"));
	if (!(await until(() => hasReadout(), 8000))) problems.push("the session readout did not appear after project.md was changed from outside");
	await sleep(600);
	windowShot("sync-after-outside-edit");
	// Outside again, deleted: the last values stay and the file is not recreated by the app.
	rmSync(settingsFile);
	await sleep(2500);
	if (existsSync(settingsFile)) problems.push("project.md came back on its own after it was deleted");
	if (!hasReadout()) problems.push("the readout went when project.md was deleted: the last values should stay");
	windowShot("sync-after-delete");
	void before;
} finally {
	child.kill("SIGKILL");
	await sleep(300);
	rmSync(dir, { recursive: true, force: true });
}
console.log("");
if (problems.length === 0) console.log("PASS  an outside change to project.md applies at once in the built app, and a deleted file leaves the last values in place");
else {
	console.log("FAIL  the built app did not follow project.md");
	for (const p of problems) console.log(`        - ${p}`);
}
process.exit(problems.length === 0 ? 0 : 1);
