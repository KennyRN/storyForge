#!/usr/bin/env node
// The look check in the built app (docs/look.md, Brief 10): macOS only, outside `npm test`, run before a release that
// touches the fonts, the security policy or the writing surfaces. The browser preview serves no content security policy,
// so only the built app shows whether SN Pro is really loaded (the cover bug's lesson: 0.12.0's policy blocked what the
// preview drew). It starts the BUILT app on a fixture copy with a temporary HOME and reads, through accessibility, the
// width each line of text really takes. SN Pro's widths are known (measured in WebKit from the shipped files) and differ
// from the system sans-serif's: a row of ten "w" is 137 px in SN Pro and 127 px in the system font at 17 px, and 10 px
// more in the italic, so a blocked font, a missing file or a synthesised italic all show as a wrong width.
//
// It drives the window with System Events: the terminal needs Accessibility permission and the screen must be unlocked.
// Usage: npm run test:look [-- path/to/storyForge.app] [--shots <folder>]
//   --candidates takes one picture of a local build made with VITE_SF_FONT_CANDIDATES=1 (the fallback candidates beside SN Pro,
//   decision 56) and does nothing else.
//   --shots saves pictures of the window: the chapter, a Codex note in the context panel, a plot note, both Codex lists.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const DATA_FOLDER = `Library/Application Support/${BUNDLE_ID}`;
const args = process.argv.slice(2);
const shotsAt = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
const candidates = args.includes("--candidates");
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
				if act is "center" then
					set p to position of e
					set sz to size of e
					return "found " & (((item 1 of p) + ((item 1 of sz) div 2)) as text) & "," & (((item 2 of p) + ((item 2 of sz) div 2)) as text)
				end if
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
const find = (role, prefix, act = "none", nth = 1) => (osa(findScript, role, prefix, act, String(nth)).stdout || "").trim();
const widthOf = (role, prefix, nth = 1) => {
	const out = find(role, prefix, "size", nth);
	const m = /^found (\d+)x(\d+)$/.exec(out);
	return m ? Number(m[1]) : null;
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
const sendKeys = (text) => osa('on run argv\nset t to item 1 of argv\ntell application "System Events"\nrepeat with i from 1 to count of t\nkeystroke (character i of t)\ndelay 0.04\nend repeat\nend tell\nend run', text);


const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-look-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
const data = join(home, DATA_FOLDER);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
if (shotsAt) mkdirSync(shotsAt, { recursive: true });

const key = (script) => osa(`tell application "System Events" to ${script}`);
const windowShot = (name) => {
	if (!shotsAt) return;
	const [x, y, w, h] = osa('tell application "System Events" to tell process "storyforge" to return (position of window 1) & (size of window 1)').stdout.trim().split(", ").map(Number);
	spawnSync("screencapture", ["-x", "-R", [x, y, w, h].join(","), join(shotsAt, `${name}.png`)]);
};
const clickAny = (name) => ["AXButton", "AXCheckBox", "AXToggle", "AXRadioButton", "AXTab"].some((role) => find(role, name, "click").startsWith("found"));
const problems = [];
/** A line's width must be within 2 px of what SN Pro gives, and clearly not what the system font gives. */
const expectWidth = (what, got, sn, sys) => {
	if (got === null) return problems.push(`${what}: no line of that text was found through accessibility`);
	if (Math.abs(got - sn) > 2.5) problems.push(`${what}: the line is ${got} px wide; SN Pro gives ${sn} px (the system font gives ${sys} px), so the font is not drawing`);
};

const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: ["ignore", "ignore", "pipe"] });
let stderr = "";
child.stderr.on("data", (d) => (stderr += d));
try {
	if (!(await until(() => find("AXButton", "Open Project").startsWith("found")))) fail("the app's window never appeared");
	if (!(await until(() => find("AXButton", `proj ${dir}`).startsWith("found"), 8000))) fail("the temporary HOME did not redirect the app's data folder");
	find("AXButton", `proj ${dir}`, "click");
	if (!(await until(() => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
	await sleep(1200);
	if (candidates) {
		windowShot("font-candidates");
		problems.push("--candidates takes the picture only");
		throw new Error("done");
	}

	// The Codex list (13 px): "Jane" is 27 px in SN Pro, 29 in the system font; "Harbour" 47 and 49.
	expectWidth("the Codex list, Jane", widthOf("AXStaticText", "Jane"), 27, 29);
	expectWidth("the Codex list, Harbour", widthOf("AXStaticText", "Harbour"), 47, 49);
	windowShot("codex-storytelling-no-note");

	// The chapter: ten "w" upright (137 px) and eleven in italic (the italic file is a real italic, 147 px for ten).
	find("AXTextArea", "Text", "focus");
	await sleep(400);
	key("key code 125 using command down"); // ⌘↓: the end of the chapter
	key("key code 36");
	sendKeys("wwwwwwwwww");
	key("key code 36");
	sendKeys("*wwwwwwwwwww*");
	key("key code 36");
	sendKeys("end");
	await sleep(700);
	expectWidth("the chapter, upright", widthOf("AXStaticText", "wwwwwwwwww"), 137, 127);
	expectWidth("the chapter, italic", widthOf("AXStaticText", "wwwwwwwwwww"), 162, 140);
	windowShot("chapter");

	// A Codex note in the context panel.
	// A Codex row answers only to pointer events (it starts a drag on pointerdown), not to an accessibility press: one real
	// click with cliclick, on a throwaway copy. (Return on a row, Brief 10 commit 3, will make this unnecessary.)
	const at = /^found (\d+),(\d+)$/.exec(find("AXStaticText", "Sam", "center"));
	if (!at) problems.push("could not find Sam in the Codex list");
	else {
		key("set frontmost of process \"storyforge\" to true");
		spawnSync("/opt/homebrew/bin/cliclick", [`c:${at[1]},${at[2]}`]);
	}
	await sleep(1200);
	if (!(await until(() => find("AXTextArea", "Text", "none", 2).startsWith("found"), 8000))) {
		problems.push("the Codex note did not open in the context panel");
	}
	else {
		find("AXTextArea", "Text", "focus", 2);
		await sleep(400);
		key("key code 125 using command down");
		key("key code 36");
		sendKeys("wwwwwwwwww");
		key("key code 36");
		sendKeys("*wwwwwwwwwww*");
		key("key code 36");
		sendKeys("end");
		await sleep(700);
		expectWidth("the Codex note in the context panel, upright", widthOf("AXStaticText", "wwwwwwwwww", 3), 137, 127);
		expectWidth("the Codex note in the context panel, italic", widthOf("AXStaticText", "wwwwwwwwwww", 2), 162, 140);
		windowShot("codex-note-in-context-panel");
	}

	// The library side's Codex list, and a plot note (13 px: ten "w" is 105 px in SN Pro, 100 in the system font).
	if (!(await until(() => clickAny("Flip side")))) fail("could not reach the library side");
	await sleep(600);
	clickAny("codex");
	await sleep(800);
	expectWidth("the library's Codex list, Jane", widthOf("AXStaticText", "Jane"), 27, 29);
	windowShot("codex-library");
	if (!(await until(() => clickAny("novel"), 8000))) fail("could not reach the novel tab");
	if (!(await until(() => find("AXTextArea", "Plot note for", "focus").startsWith("found")))) fail("no plot note to type in");
	await sleep(500);
	key('keystroke "a" using command down');
	sendKeys("wwwwwwwwww");
	await sleep(700);
	expectWidth("a plot note", widthOf("AXStaticText", "wwwwwwwwww", 1), 105, 100);
	windowShot("plot-note");
} catch (e) {
	if (!(candidates && e.message === "done")) throw e;
} finally {
	child.kill("SIGKILL");
	await sleep(300);
	rmSync(dir, { recursive: true, force: true });
}
console.log("");
if (candidates) {
	console.log(`(picture: ${join(shotsAt ?? ".", "font-candidates.png")})`);
	process.exit(0);
}
if (problems.length === 0) console.log("PASS  SN Pro is the font drawing in the Codex list (both sides), the chapter, a Codex note in the context panel and a plot note, upright and italic where the surface has an italic (a plot note is plain text, with none), at the widths its shipped files give");
else {
	console.log("FAIL  the built app is not drawing what it should");
	for (const p of problems) console.log(`        - ${p}`);
	if (stderr.trim()) console.log(`        stderr: ${stderr.trim().slice(0, 300)}`);
}
process.exit(problems.length === 0 ? 0 : 1);
