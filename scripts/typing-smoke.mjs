#!/usr/bin/env node
// The typing check in the built app (docs/typing-aids.md §1.2 and §9): macOS only, outside `npm test`, run before a
// release that touches the editor's input or the macOS platform module. The browser preview can't show what the
// Mac's own text system does to typed text (smart quotes, smart dashes, Text Replacements, spelling autocorrection),
// and 0.12.0 shipped with all of them acting inside the manuscript, including inside [[links]], code and comments.
//
// It starts the BUILT app on a fixture copy, types real keystrokes into a chapter, and reads the editor's own
// content back through accessibility. Nothing is typed into a real project. Today (before the typing aids) the
// text must come out exactly as typed; Brief 9 extends this with the aids' own expected results.
//
// It drives the window with System Events: the terminal needs Accessibility permission and the screen must be
// unlocked. Usage: npm run test:typing [-- path/to/storyForge.app] [--shot path/to/window.png]
//   --shot saves a picture of the app's window after typing a misspelled sentence, to look at the red underlines
//   (they can't be detected through accessibility).
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const DATA_FOLDER = `Library/Application Support/${BUNDLE_ID}`;
const args = process.argv.slice(2);
const shotAt = args.includes("--shot") ? args[args.indexOf("--shot") + 1] : null;
const appArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--shot");
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
const find = (role, prefix, act = "none") => (osa(findScript, role, prefix, act).stdout || "").trim();
const valueOf = (role, prefix) => {
	const out = find(role, prefix, "value");
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
const sendKeys = (text) => osa('on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run', text);

// What is typed, and what each piece proves. Typed with real keystrokes, so the Mac's text system sees it as typing.
const CASES = [
	["curly quotes and apostrophes", `'Don't say "never" - not yet,' she said.`],
	["two hyphens and three full stops", "Well--then... and so on..."],
	["a Text Replacement (omw) and a name typed lazily", "omw aelfric"],
	["elisions and a decade", "'tis 'em' 90's"],
	["inside a link, code and a comment", "[[it's]] `don't` %% 'x' -- y %% end"],
];

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-typing-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
const data = join(home, DATA_FOLDER);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));

const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: ["ignore", "ignore", "pipe"] });
let stderr = "";
child.stderr.on("data", (d) => (stderr += d));
const problems = [];
try {
	if (!(await until(() => find("AXButton", "Open Project").startsWith("found")))) fail("the app's window never appeared");
	if (!(await until(() => find("AXButton", `proj ${dir}`).startsWith("found"), 8000))) fail("the temporary HOME did not redirect the app's data folder");
	find("AXButton", `proj ${dir}`, "click");
	if (!(await until(() => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
	await sleep(600);
	find("AXTextArea", "Text", "focus");
	if (!(await until(() => find("AXTextArea", "Text", "isfocused") === "found true"))) fail("the editor never took focus");
	await sleep(400);

	for (const [what, text] of CASES) {
		const before = valueOf("AXTextArea", "Text") ?? "";
		sendKeys(`${text} `);
		await sleep(500);
		const after = valueOf("AXTextArea", "Text") ?? "";
		const added = after.length >= before.length ? after.slice(0, after.length - before.length + 0) : after;
		// The new text goes in at the caret, which is at the start of the chapter: the editor now begins with everything typed so far.
		const typedSoFar = CASES.slice(0, CASES.findIndex((c) => c[0] === what) + 1).map((c) => `${c[1]} `).join("");
		if (!after.startsWith(typedSoFar)) problems.push(`${what}: typed ${JSON.stringify(text)}, the editor holds ${JSON.stringify(after.slice(0, typedSoFar.length))}`);
		void added;
	}

	if (shotAt) {
		sendKeys("Teh quikc brwon foxx jumpd ovr lazyy dogg. ");
		await sleep(2500);
		const [x, y, w] = osa('tell application "System Events" to tell process "storyforge" to return (position of window 1) & (size of window 1)').stdout.trim().split(", ").map(Number);
		spawnSync("screencapture", ["-x", "-R", [x, y + 40, Math.min(w, 900), 300].join(","), shotAt]);
		console.log(`(picture of the app's window: ${shotAt})`);
	}
} finally {
	child.kill("SIGKILL");
	await sleep(300);
	rmSync(dir, { recursive: true, force: true });
}
console.log("");
if (problems.length === 0) console.log("PASS  everything typed came out exactly as typed: the Mac's own substitutions do not act in the editor");
else {
	console.log("FAIL  the Mac's own text substitutions acted inside the editor");
	for (const p of problems) console.log(`        - ${p}`);
	if (stderr.trim()) console.log(`        stderr: ${stderr.trim().slice(0, 300)}`);
}
process.exit(problems.length === 0 ? 0 : 1);
