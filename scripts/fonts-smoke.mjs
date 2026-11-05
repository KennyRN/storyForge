#!/usr/bin/env node
// Brief 13 (docs/navigator.md): the embedded font families in the BUILT app. Mac only, outside `npm test`.
// For each configuration it writes the Appearance keys into a throwaway copy of the series fixture's project.md, starts the
// BUILT app under a temporary HOME, and reads through accessibility the width the Codex list's names really take. Each family
// must draw differently from the others and from the current look; a variable font's weight and Fraunces' Softness
// must change the drawing (Wonk was removed in 1.6.1); SN Pro chosen explicitly must draw exactly as the current look does (it is the same file).
// Fraunces draws its wonky n, m and h only at larger optical sizes, so its Softness is measured at 1.75 rem.
// No picture is taken, and no measurement is trusted, while the screen is locked or the display is dimmed or asleep (decision 103); and when a comparison
// shows no difference, a control (a size step, known to show) is measured before the check is allowed to fail: if the control shows nothing either, the run is
// refused, saying the screen may be locked or dimmed, instead of reporting a font fault.
// Nothing is typed: only accessibility reads and one click. The screen must be unlocked and the terminal allowed to drive apps.
//
// Usage: npm run test:fonts [-- path/to/storyForge.app]
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, readFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
/** The screen is unlocked and the display fully on (a dimmed or sleeping display makes pictures and readings unreliable). */
const screenProblem = () => {
	if (/CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(run("sh", ["-c", "ioreg -n Root -d1 -a"]).stdout.replace(/\s+/g, " ").replace(/> </g, "><"))) return "the screen is locked";
	const state = /"CurrentPowerState"=(\d+)/.exec(run("sh", ["-c", "ioreg -r -n IODisplayWrangler -d 3"]).stdout);
	if (state && Number(state[1]) < 4) return "the display is dimmed or asleep";
	return "";
};
const proc = 'tell application "System Events" to tell process "storyforge"';

let child = null;
let lastPicture = "";
process.on("exit", () => child?.kill("SIGKILL"));
/** Starts the built app on this configuration, reads the Codex list's names' widths, and quits it. */
async function measure(label, keys) {
	const bad = screenProblem();
	if (bad) fail(`${label}: ${bad}, so nothing is measured or photographed. Wake and unlock the Mac, then run again.`);
	writeFileSync(projectMd, `---\nformat-version: 1\n${Object.entries(keys).map(([k, v]) => `appearance-codex-${k}: ${v}`).join("\n")}${Object.keys(keys).length ? "\n" : ""}---\n`);
	child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" }); // nothing is read from it, so nothing may be piped to a reader that goes away first
	try {
		if (!(await until(() => find("AXButton", "The Lantern Cycle").startsWith("found")))) fail("the app's window, or the temporary HOME's recent list, never appeared");
		find("AXButton", "The Lantern Cycle", "click");
		if (!(await until(() => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
		await sleep(1500);
		const a = widthOf("NoNewline");
		const b = widthOf("Windows");
		const c = widthOf("Harbour");
		if (a === null || b === null || c === null) fail(`${label}: no Codex row was found through accessibility`);
		// The Codex list is also photographed and the picture hashed (the control below: one configuration photographs the same twice).
		const [wx, wy] = osa(`${proc} to return (position of window 1) & (size of window 1)`).stdout.trim().split(", ").map(Number);
		const png = join(dir, "codex.png");
		spawnSync("screencapture", ["-x", "-R", [wx, wy + 120, 280, 360].join(","), png]);
		lastPicture = createHash("sha1").update(readFileSync(png)).digest("hex");
		console.log(`${label.padEnd(34)} NoNewline ${a} px, Windows ${b} px, Harbour ${c} px`);
		return (a * 1000 + b) * 1000 + c;
	} finally {
		child.kill("SIGTERM");
		await new Promise((r) => (child.once("exit", r), setTimeout(r, 6000)));
		child.kill("SIGKILL");
		child = null;
		await sleep(500);
	}
}

/**
 * The type styles (Brief 18): the start screen's card name is the Body bold style, which follows the Interface font unless it names its own.
 * Writes the lines into project.md, opens the app to the start screen and reads that name's width, then quits.
 */
async function measureCardName(label, lines) {
	const bad = screenProblem();
	if (bad) fail(`${label}: ${bad}, so nothing is measured. Wake and unlock the Mac, then run again.`);
	writeFileSync(projectMd, `---\nformat-version: 1\n${lines.join("\n")}${lines.length ? "\n" : ""}---\n`);
	child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" });
	try {
		if (!(await until(() => find("AXButton", "The Lantern Cycle").startsWith("found")))) fail("the app's window, or the temporary HOME's recent list, never appeared");
		await sleep(1200);
		const w = widthOf("The Lantern Cycle");
		if (w === null) fail(`${label}: the card's name was not found as text through accessibility`);
		console.log(`${label.padEnd(58)} card name ${w} px`);
		return w;
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
/** A size step is known to show: if it shows nothing, the measurements can't be trusted and the run is refused, not failed. */
const control = async () => {
	const small = await measure("control: Sofia Sans at 1 rem", { font: "Sofia Sans", weight: 400, size: 1 });
	const large = await measure("control: Sofia Sans at 1.5 rem", { font: "Sofia Sans", weight: 400, size: 1.5 });
	return large > small * 1.3;
};
const compare = async (ok, what) => {
	if (!ok && !(await control())) fail(`${what}: no difference was shown, and a size step (known to show) showed none either. The screen may be locked or dimmed, so the run is refused instead of failed.`);
	check(ok, what);
};
try {
	const defaults = await measure("the defaults (Atkinson, 400, 1 rem)", {});
	const families = ["SN Pro", "Aleo", "Atkinson Hyperlegible Next", "Courier Prime", "Fraunces", "Sofia Sans", "Sofia Sans Semi Condensed", "Sofia Sans Condensed"];
	const drawn = {};
	for (const f of families) drawn[f] = await measure(f, { font: f, weight: 400, size: 1 });
	check(drawn["Atkinson Hyperlegible Next"] === defaults, "Atkinson at 400 and 1 rem, chosen explicitly, draws exactly as the defaults do");
	check(new Set(Object.values(drawn)).size === families.length, "every family draws differently from every other, the three Sofia Sans widths included (the Codex list is drawn in the chosen font, not a fallback)");
	check(drawn["Sofia Sans Condensed"] < drawn["Sofia Sans Semi Condensed"] && drawn["Sofia Sans Semi Condensed"] < drawn["Sofia Sans"], "the Sofia Sans widths run condensed, semi condensed, standard (each its own family)");
	for (const f of ["Aleo", "Atkinson Hyperlegible Next", "Fraunces", "Sofia Sans", "Sofia Sans Semi Condensed", "Sofia Sans Condensed", "SN Pro"]) {
		const light = await measure(`${f}, weight 200`, { font: f, weight: 200, size: 1 });
		const heavy = await measure(`${f}, weight 800`, { font: f, weight: 800, size: 1 });
		await compare(light !== heavy, `${f}: weight changes the drawing`);
	}
	await measure("Courier Prime, weight 700 (monospaced: same width as 400)", { font: "Courier Prime", weight: 700, size: 1 }); // opens; a width can't tell its bold, so the WebKit tests check the file loads
	const plain = await measure("Fraunces, Softness 0", { font: "Fraunces", weight: 400, size: 1.75, soft: 0 });
	const plainPicture = lastPicture;
	const soft = await measure("Fraunces, Softness 100", { font: "Fraunces", weight: 400, size: 1.75, soft: 100 });
	const picOff = plainPicture;
	await measure("Fraunces, Softness 0, again", { font: "Fraunces", weight: 400, size: 1.75, soft: 0 });
	check(lastPicture === picOff, "control: the same configuration photographs the same twice");
	await compare(soft !== plain, "Fraunces' Softness changes the drawing");
	const big = await measure("Sofia Sans at 1.5 rem", { font: "Sofia Sans", weight: 400, size: 1.5 });
	check(big > drawn["Sofia Sans"] * 1.3, "a size of 1.5 rem draws larger than 1 rem");
	// The two base fonts and the styles that follow them (Brief 18). The card's name is Body bold (600 at 13 px, following the Interface font).
	const follows = await measureCardName("the Interface font: SN Pro (the default), card name", []);
	const aleo = await measureCardName("the Interface font: Aleo, card name", ["appearance-interface-font: Aleo"]);
	await compare(aleo !== follows, "changing the Interface font changes a style that follows it (Body bold, the card's name)");
	const own = await measureCardName("Body bold names Courier Prime, Interface font Aleo", ["appearance-interface-font: Aleo", "appearance-body-bold-font: Courier Prime"]);
	const ownTwice = await measureCardName("Body bold names Courier Prime, Interface font Atkinson", ["appearance-interface-font: Atkinson Hyperlegible Next", "appearance-body-bold-font: Courier Prime"]);
	check(own === ownTwice, "a style that names its own font does not move when the Interface font does");
	const sized = await measureCardName("Body bold at 16 px", ["appearance-body-bold-size: 16"]);
	check(sized > follows * 1.15, "a style's size changes the drawing (Body bold at 16 px against 13)");
	const writing = await measureCardName("the Writing font changed to Aleo (the interface must not move)", ["appearance-writing-font: Aleo"]);
	check(writing === follows, "the Writing font leaves the interface's styles alone");
} finally {
	rmSync(dir, { recursive: true, force: true });
}
if (problems.length) {
	console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
	process.exit(1);
}
console.log("\nPASS  each family is drawn in the built app; weight, Softness and size change the drawing");
