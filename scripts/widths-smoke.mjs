#!/usr/bin/env node
// Fix 5 (docs/widths.md): panel widths in the BUILT app. Mac only, outside `npm test`.
// Opens a throwaway copy of the series fixture under a temporary HOME, measures the panels through accessibility, resizes the
// test copy's window, opens Settings from the menu, types a width and checks both panels followed, and saves pictures.
//
// Usage: npm run test:widths [-- path/to/storyForge.app] [--shots <folder>]
// Every keystroke goes through the typing guard (decision 72). The window's size is set only on the test copy's own process.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedTyping } from "./lib/typingGuard.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
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
const version = run("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleShortVersionString", join(app, "Contents/Info.plist")]).stdout.trim();
console.log(`built app: ${version}`);
if (run("pgrep", ["-ix", "storyforge"]).stdout.trim()) fail("storyForge is already running. Quit it first.");
if (osa('tell application "System Events" to get name of first process').status !== 0) fail("System Events is not allowed to drive apps.");

const proc = 'tell application "System Events" to tell process "storyforge"';
// A panel's width is read from its divider (a separator, "Resize the left panel" and "Resize the context panel") and the window's edges.
const dividerX = (label) => {
	for (const role of ["AXSplitter", "AXSeparator", "AXGroup"]) {
		const m = /^found (-?\d+),(-?\d+),(\d+),(\d+)$/.exec((osa(findScript, role, label, "frame", "1").stdout || "").trim());
		if (m) return Number(m[1]);
	}
	return null;
};
const widthOfPanel = (name) => {
	const [wx, , ww] = windowFrame();
	if (name === "Storytelling") {
		const x = dividerX("Resize the left panel");
		return x === null ? null : x - wx;
	}
	const x = dividerX("Resize the context panel");
	return x === null ? null : wx + ww - x;
};
const windowFrame = () => osa(`${proc} to return (position of window 1) & (size of window 1)`).stdout.trim().split(", ").map(Number);
const shot = (name) => {
	if (!shotsAt) return;
	const [x, y, w, h] = windowFrame();
	spawnSync("screencapture", ["-x", "-R", [x, y, w, h].join(","), join(shotsAt, `${name}.png`)]);
};
const setWindowWidth = (w) => osa(`${proc} to set size of window 1 to {${w}, 800}`);
const clickMenu = (menu, item) => osa(`${proc} to click menu item "${item}" of menu 1 of menu bar item "${menu}" of menu bar 1`);
const typing = guardedTyping({ osa, fail, pid: () => child.pid }); // keys are posted to the test copy's own process (decision 90)
const problems = [];
const check = (ok, what) => (ok ? console.log(`ok   ${what}`) : (problems.push(what), console.log(`FAIL ${what}`)));
const near = (a, b, d = 2) => a !== null && Math.abs(a - b) <= d;

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-widths-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
const data = join(home, `Library/Application Support/${BUNDLE_ID}`);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
if (shotsAt) mkdirSync(shotsAt, { recursive: true });
const projectMd = join(project, "_backstage/storyforge/project.md");
const before = existsSync(projectMd) ? readFileSync(projectMd, "utf8") : null;

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
				if act is "press" then perform action "AXPress" of e
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
	return (osa(findScript, role, prefix, act, String(nth)).stdout || "").trim().replace(/^found.*/s, "found");
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

const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" }); // nothing is read from it, so nothing may be piped to a reader that goes away first
// The test copy is this script's own child: whichever way the script ends (including a refusal), it goes with it.
process.on("exit", () => child.kill("SIGTERM"));
try {
	await sleep(1500);
	typing.bringToFront();
	const launched = Date.now();
	if (!(await until(() => find("AXButton", "Open Project") === "found"))) fail(`the app's window never appeared (waited ${Math.round((Date.now() - launched) / 1000)} s)`);
	console.log(`window appeared ${((Date.now() - launched) / 1000).toFixed(1)} s after the launch`);
	if (!(await until(() => find("AXButton", `proj ${dir}`) === "found", 8000))) fail("the temporary HOME did not redirect the app's data folder");
	osa(`${proc} to set size of window 1 to {1280, 800}`); // before the project opens, so the percent figures are made at this width
	await sleep(600);
	find("AXButton", `proj ${dir}`, "click");
	if (!(await until(() => find("AXTextArea", "Text") === "found"))) fail("the project did not open");
	await sleep(1200);
	const left0 = widthOfPanel("Storytelling");
	const ctx0 = widthOfPanel("Context");
	console.log(`default window: left ${left0}, context ${ctx0}`);
	check(near(left0, 288, 4) && near(ctx0, 288, 4), "a project with nothing stored opens with both panels at the old left width (288 px), linked");
	shot("1-default-linked");

	// Settings from the menu, then a typed figure.
	clickMenu("storyForge", "Settings…");
	// Settings has seven pages since 1.6.0: the widths are on "This Mac". The page is chosen by its accessibility action.
	await until(() => ["AXRadioButton", "AXTab", "AXButton"].some((r) => find(r, "This Mac", "press") === "found"), 8000);
	if (!(await until(() => find("AXTextField", "Width of all three panels") === "found", 8000))) problems.push("Settings did not show the widths group");
	else {
		find("AXTextField", "Width of all three panels", "focus"); // focusing scrolls the group into view
		await sleep(500);
		shot("2-settings-group");
		typing.key('keystroke "a" using command down');
		typing.sendKeys("30");
		typing.key("key code 36");
		await sleep(700);
		const w = windowFrame()[2];
		check(near(widthOfPanel("Storytelling"), w * 0.3, 3), "a typed 30% moved the left panel behind the dialog");
		check(near(widthOfPanel("Context"), w * 0.3, 3), "…and the context panel with it (linked)");
		shot("3-typed-30-percent");
		find("AXButton", "Done", "click"); // close the dialog
		await sleep(500);
	}

	// Percent scales with the window.
	setWindowWidth(1000);
	await sleep(800);
	const leftSmall = widthOfPanel("Storytelling");
	check(leftSmall !== null && leftSmall < 0.3 * 1280 - 20, `in a narrower window (1000) percent panels scale or narrow (left ${leftSmall})`);
	shot("4-narrower-window-percent");
	setWindowWidth(1280);
	await sleep(800);
	check(near(widthOfPanel("Storytelling"), 0.3 * 1280, 4), "widening the window gives the set width back");
} finally {
	child.kill("SIGTERM");
	await sleep(1500);
}
const after = existsSync(projectMd) ? readFileSync(projectMd, "utf8") : null;
check(before === after, "project.md is untouched");
if (problems.length) {
	console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
	process.exit(1);
}
console.log("\nAll good.");
