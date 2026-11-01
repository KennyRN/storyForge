#!/usr/bin/env node
// The cover display check (docs/story-shape-report.md): macOS only, outside `npm test`, run before a release that
// touches covers or the content security policy. The browser preview serves no CSP, so only the built app can show
// whether a saved cover is actually drawn (0.12.0 shipped with `img-src 'self' data:` and showed "No cover" for covers
// that were saved correctly). It starts the BUILT app on a fixture copy whose novel and series have real PNG covers,
// goes to the novel overview and the series overview, and checks that the cover is drawn in each.
//
// It drives the window with System Events: the terminal needs Accessibility permission and the screen must be unlocked.
// The native open panel is not driven; choosing a cover is checked by hand (Brief 8 §7, item 6).
// Usage: npm run test:cover [-- path/to/storyForge.app]
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const DATA_FOLDER = `Library/Application Support/${BUNDLE_ID}`;
const app = resolve(process.argv[2] ?? join(root, "src-tauri/target/universal-apple-darwin/release/bundle/macos/storyForge.app"));
const binary = join(app, "Contents/MacOS/storyforge");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
const osa = (script, ...args) => run("osascript", ["-e", script, ...args]);
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
				return "found " & n
			end if
		end repeat
	end tell
	return "none"
end run`;
const find = (role, prefix, act = "none") => (osa(findScript, role, prefix, act).stdout || "").trim();
const clickAny = (name) => ["AXButton", "AXCheckBox", "AXToggle", "AXRadioButton", "AXTab"].some((role) => find(role, name, "click").startsWith("found"));
async function until(what, fn, ms = 15000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const v = fn();
		if (v) return v;
		await sleep(250);
	}
	return null;
}

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-cover-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
// Real pictures for the novel's cover and the series' cover (the fixture's own are not images).
writeFileSync(join(project, "_backstage/storyforge/aaa/cover.png"), PNG);
rmSync(join(project, "_backstage/storyforge/_series/cover.jpg"));
writeFileSync(join(project, "_backstage/storyforge/_series/cover.png"), PNG);
const seriesFile = join(project, "_story-library/series.md");
writeFileSync(seriesFile, readFileSync(seriesFile, "utf8").replace("cover-image: cover.jpg", "cover-image: cover.png"));
const data = join(home, DATA_FOLDER);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));

const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" }); // nothing is read from it, so nothing may be piped to a reader that goes away first
// The test copy is this script's own child: whichever way the script ends (a refusal included), it goes with it.
process.on("exit", () => child.kill("SIGKILL"));
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => process.exit(1)); // so the line above runs when the script is stopped from outside
const problems = [];
try {
	if (!(await until("the window", () => find("AXButton", "Open Project").startsWith("found")))) fail("the app's window never appeared");
	if (!(await until("the temporary project", () => find("AXButton", `proj ${dir}`).startsWith("found"), 8000))) fail("the temporary HOME did not redirect the app's data folder");
	find("AXButton", `proj ${dir}`, "click");
	if (!(await until("an editor", () => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
	await sleep(500);
	if (!(await until("the novel name", () => clickAny("Open the novel on the library side")))) fail("could not reach the library side");
	if (!(await until("the novel tab", () => clickAny("novel"), 8000))) fail("could not reach the novel tab");
	if (!(await until("the novel's cover", () => find("AXButton", "Change the cover of").startsWith("found"), 6000))) problems.push("the novel overview shows no cover image (saved cover, recorded in novel-aaa.md)");
	if (!(await until("the series tab", () => clickAny("series"), 8000))) fail("could not reach the series tab");
	if (!(await until("the series' cover", () => find("AXButton", "Change the cover of").startsWith("found"), 6000))) problems.push("the series overview shows no cover image (saved cover, recorded in series.md)");
} finally {
	child.kill("SIGKILL");
	await sleep(300);
	rmSync(dir, { recursive: true, force: true });
}
console.log("");
if (problems.length === 0) console.log("PASS  the novel's and the series' saved covers are drawn in the built app");
else {
	console.log("FAIL  a saved cover is not drawn in the built app");
	for (const p of problems) console.log(`        - ${p}`);
}
process.exit(problems.length === 0 ? 0 : 1);
