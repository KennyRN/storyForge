#!/usr/bin/env node
// Brief 13 (docs/navigator.md): the embedded font families in the BUILT app. Mac only, outside `npm test`.
// For each configuration it writes the Appearance keys into a throwaway copy of the series fixture's project.md, starts the
// BUILT app under a temporary HOME, and reads through accessibility the width the Codex list's names really take. Each family
// must draw differently from the others and from the current look; a variable font's weight, and Fraunces' Softness and Wonk,
// must change the drawing; SN Pro chosen explicitly must draw exactly as the current look does (it is the same file).
// Nothing is typed: only accessibility reads and one click. The screen must be unlocked and the terminal allowed to drive apps.
//
// Usage: npm run test:fonts [-- path/to/storyForge.app]
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const appArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
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
if (/CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(run("sh", ["-c", "ioreg -n Root -d1 -a"]).stdout.replace(/\s+/g, " ").replace(/> </g, "><"))) fail("the screen is locked: the window can't be driven.");
if (osa('tell application "System Events" to get name of first process').status !== 0) fail("System Events is not allowed to drive apps.");

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
					set frontmost to true
					set focused of (item (i - 1) of els) to true
					return "found " & n
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
const widthOf = (prefix) => {
	const m = /^found (\d+)x(\d+)$/.exec(find("AXStaticText", prefix, "size"));
	return m ? Number(m[1]) : null;
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

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-fonts-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
const data = join(home, `Library/Application Support/${BUNDLE_ID}`);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
const projectMd = join(project, "_backstage/storyforge/project.md");
const proc = 'tell application "System Events" to tell process "storyforge"';

let child = null;
process.on("exit", () => child?.kill("SIGKILL"));
/** Starts the built app on this configuration, reads the Codex list's names' widths, and quits it. */
async function measure(label, keys) {
	writeFileSync(projectMd, `---\nformat-version: 1\n${Object.entries(keys).map(([k, v]) => `appearance-codex-${k}: ${v}`).join("\n")}${Object.keys(keys).length ? "\n" : ""}---\n`);
	child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" }); // nothing is read from it, so nothing may be piped to a reader that goes away first
	try {
		if (!(await until(() => find("AXButton", `proj ${dir}`).startsWith("found")))) fail("the app's window, or the temporary HOME's recent list, never appeared");
		find("AXButton", `proj ${dir}`, "click");
		if (!(await until(() => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
		await sleep(1500);
		const a = widthOf("NoNewline");
		const b = widthOf("Windows");
		if (a === null || b === null) fail(`${label}: no Codex row was found through accessibility`);
		console.log(`${label.padEnd(34)} NoNewline ${a} px, Windows ${b} px`);
		return a * 1000 + b;
	} finally {
		child.kill("SIGTERM");
		await new Promise((r) => (child.once("exit", r), setTimeout(r, 6000)));
		child.kill("SIGKILL");
		child = null;
		await sleep(500);
	}
}

const problems = [];
const check = (ok, what) => (ok ? console.log(`ok   ${what}`) : (problems.push(what), console.log(`FAIL ${what}`)));
try {
	const current = await measure("current look", {});
	const families = ["SN Pro", "Aleo", "Atkinson Hyperlegible Next", "Courier Prime", "Fraunces", "Inter"];
	const drawn = {};
	for (const f of families) drawn[f] = await measure(f, { font: f, weight: 400, size: 1 });
	check(drawn["SN Pro"] === current, "SN Pro chosen explicitly draws exactly as the current look (the same file, 400 at 1 rem)");
	for (const f of families.slice(1)) check(drawn[f] !== current, `${f} draws differently from the current look`);
	check(new Set(Object.values(drawn)).size === families.length, "every family draws differently from every other");
	for (const f of ["Aleo", "Atkinson Hyperlegible Next", "Fraunces", "Inter", "SN Pro"]) {
		const light = await measure(`${f}, weight 200`, { font: f, weight: 200, size: 1 });
		const heavy = await measure(`${f}, weight 800`, { font: f, weight: 800, size: 1 });
		check(light !== heavy, `${f}: weight changes the drawing`);
	}
	await measure("Courier Prime, weight 700 (monospaced: same width as 400)", { font: "Courier Prime", weight: 700, size: 1 }); // opens; a width can't tell its bold, so the WebKit tests check the file loads
	const plain = await measure("Fraunces, Softness 0, Wonk off", { font: "Fraunces", weight: 400, size: 1, soft: 0, wonk: "false" });
	const soft = await measure("Fraunces, Softness 100", { font: "Fraunces", weight: 400, size: 1, soft: 100, wonk: "false" });
	const wonk = await measure("Fraunces, Wonk on", { font: "Fraunces", weight: 400, size: 1, soft: 0, wonk: "true" });
	check(soft !== plain, "Fraunces' Softness changes the drawing");
	check(wonk !== plain, "Fraunces' Wonk changes the drawing");
	const big = await measure("Inter at 1.5 rem", { font: "Inter", weight: 400, size: 1.5 });
	check(big > drawn.Inter * 1.3, "a size of 1.5 rem draws larger than 1 rem");
} finally {
	rmSync(dir, { recursive: true, force: true });
}
if (problems.length) {
	console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
	process.exit(1);
}
console.log("\nPASS  each family is drawn in the built app; weight, Softness, Wonk and size change the drawing");
