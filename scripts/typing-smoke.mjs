#!/usr/bin/env node
// The typing check in the built app (docs/typing-aids.md §1.2 and §9): macOS only, outside `npm test`, run before a
// release that touches the editor's input or the macOS platform module. The browser preview can't show what the
// Mac's own text system does to typed text (smart quotes, smart dashes, Text Replacements, spelling autocorrection),
// and 0.12.0 shipped with all of them acting inside the manuscript, including inside [[links]], code and comments.
//
// It starts the BUILT app on a fixture copy, types real keystrokes into a chapter, and reads the editor's own
// content back through accessibility. Nothing is typed into a real project. The text must come out exactly as the
// typing aids make it (and nothing else may have acted on it: the Mac's own substitutions are off, decision 46), and
// one ⌘Z through the real Edit menu must undo a curl. Each commit of Brief 9 adds the cases for its own aid.
//
// It drives the window with System Events: the terminal needs Accessibility permission and the screen must be
// unlocked. Usage: npm run test:typing [-- path/to/storyForge.app] [--shot path/to/window.png]
//   --aid-shots <prefix> saves two pictures of a plot note, <prefix>-name.png (a corrected name) and <prefix>-popup.png (an open shortcode popup).
//   --shot saves a picture of the app's window after typing a misspelled sentence, to look at the red underlines
//   (they can't be detected through accessibility).
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedTyping } from "./lib/typingGuard.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const DATA_FOLDER = `Library/Application Support/${BUNDLE_ID}`;
const args = process.argv.slice(2);
const shotAt = args.includes("--shot") ? args[args.indexOf("--shot") + 1] : null;
const fieldShotAt = args.includes("--field-shot") ? args[args.indexOf("--field-shot") + 1] : null;
const aidShotsAt = args.includes("--aid-shots") ? args[args.indexOf("--aid-shots") + 1] : null;
const appArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--shot" && args[i - 1] !== "--field-shot" && args[i - 1] !== "--aid-shots");
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
// One key at a time, 40 ms apart: a whole string sent in one burst arrives faster than anyone types, and the built
// app (1.0.0 included) then drops spaces and letters while an aid is replacing a word.
// Every keystroke goes through the typing guard (decision 72): nothing is typed unless the test copy is in front with a text box focused.
const typing = guardedTyping({ osa, fail });
const sendKeys = typing.sendKeys;

// What is typed, what the editor must hold after the typing aids (and only the aids), and what each piece proves.
// Typed with real keystrokes, so the Mac's text system sees it as typing. A case where the editor holds something else
// means either an aid is wrong or the Mac's own substitutions acted as well.
const CASES = [
	["curly quotes, an apostrophe and a spaced en dash", `'Don't say "never" - not yet,' she said.`, "‘Don’t say “never” – not yet,’ she said."],
	["an em dash and an ellipsis", "Well--then... and so on...", "Well—then… and so on…"],
	["a Text Replacement (omw) is not expanded, and a Codex name in lower case is corrected with its possessive", "omw jane's boat and sam.", "omw Jane’s boat and Sam."],
	["an elision, a quoted word and a decade", "'tis 'em' 90's", "’tis ‘em’ 90’s"],
	["nothing inside a link, code or a comment", "[[it's]] `don't` %% 'x' -- y %% end", "[[it's]] `don't` %% 'x' -- y %% end"],
];

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-typing-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
// A project with one shortcode defined, as the author would in settings.
writeFileSync(join(project, "_backstage/storyforge/project.md"), "---\nformat-version: 1\ntyping-shortcodes-list:\n  th: the Right Honourable\n---\n");
const data = join(home, DATA_FOLDER);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));

const problems = [];
const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" }); // nothing is read from it, so nothing may be piped to a reader that goes away first
try {
	if (!(await until(() => find("AXButton", "Open Project").startsWith("found")))) fail("the app's window never appeared");
	if (!(await until(() => find("AXButton", `proj ${dir}`).startsWith("found"), 8000))) fail("the temporary HOME did not redirect the app's data folder");
	find("AXButton", `proj ${dir}`, "click");
	if (!(await until(() => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
	await sleep(600);
	find("AXTextArea", "Text", "focus");
	if (!(await until(() => find("AXTextArea", "Text", "isfocused") === "found true"))) fail("the editor never took focus");
	await sleep(400);

	let expectedSoFar = "";
	for (const [what, text, expected] of CASES) {
		sendKeys(`${text} `);
		await sleep(500);
		expectedSoFar += `${expected} `;
		const after = valueOf("AXTextArea", "Text") ?? "";
		if (!after.startsWith(expectedSoFar)) problems.push(`${what}: typed ${JSON.stringify(text)}, expected ${JSON.stringify(expected)}, the editor holds ${JSON.stringify(after.slice(expectedSoFar.length - expected.length - 1, expectedSoFar.length))}`);
	}

	// One ⌘Z straight after a curl gives back exactly what was typed (through the real Edit menu).
	const keystroke = typing.key;
	sendKeys("don'");
	await sleep(500);
	const curled = valueOf("AXTextArea", "Text") ?? "";
	if (!curled.startsWith(`${expectedSoFar}don’`)) problems.push(`typed don' and the editor holds ${JSON.stringify(curled.slice(expectedSoFar.length, expectedSoFar.length + 6))}, expected don’`);
	keystroke('keystroke "z" using command down');
	await sleep(500);
	const undone = valueOf("AXTextArea", "Text") ?? "";
	if (!undone.startsWith(`${expectedSoFar}don'`) || undone.startsWith(`${expectedSoFar}don’`)) problems.push(`⌘Z straight after the curl should leave the straight apostrophe; the editor holds ${JSON.stringify(undone.slice(expectedSoFar.length, expectedSoFar.length + 6))}`);

	// A shortcode: ~ and letters open the popup, the real Tab key puts in the full text.
	sendKeys(" ~th");
	await sleep(500);
	keystroke("key code 48"); // Tab
	await sleep(600);
	const expanded = valueOf("AXTextArea", "Text") ?? "";
	if (!expanded.startsWith(`${expectedSoFar}don' the Right Honourable`)) problems.push(`typed ~th and pressed Tab; the editor holds ${JSON.stringify(expanded.slice(expectedSoFar.length, expectedSoFar.length + 40))}, expected "don' the Right Honourable"`);

	// The special-characters button, with the real pointer-free press: the character lands where the cursor was.
	const pressAny = (name) => ["AXButton", "AXPopUpButton", "AXMenuButton", "AXCheckBox"].some((role) => find(role, name, "click").startsWith("found"));
	if (!pressAny("Special characters")) problems.push("no Special characters button in the context panel");
	await sleep(400);
	if (!pressAny("ash")) problems.push("the palette has no 'ash' button");
	await sleep(500);
	const withAsh = valueOf("AXTextArea", "Text") ?? "";
	if (!withAsh.startsWith(`${expectedSoFar}don' the Right Honourableæ`)) problems.push(`pressed the ash button; the editor holds ${JSON.stringify(withAsh.slice(expectedSoFar.length, expectedSoFar.length + 40))}, expected "don' the Right Honourableæ"`);

	// The field editors (decision 53): a plot note has the name autocorrect and the shortcodes too. Typed into the first
	// plot note of the novel, with real keystrokes; each aid is read back from the field through accessibility.
	const clickAny = (name) => ["AXButton", "AXCheckBox", "AXToggle", "AXRadioButton", "AXTab"].some((role) => find(role, name, "click").startsWith("found"));
	if (!(await until(() => clickAny("Open the novel on the library side")))) fail("could not reach the library side");
	if (!(await until(() => clickAny("novel"), 8000))) fail("could not reach the novel tab");
	if (!(await until(() => find("AXTextArea", "Plot note for", "focus").startsWith("found")))) fail("no plot note to type in");
	await sleep(500);
	// Accessibility gives the value without its trailing spaces and line breaks, so what follows is compared that way.
	const note = () => (valueOf("AXTextArea", "Plot note for") ?? "").trimEnd();
	const noteFocused = () => find("AXTextArea", "Plot note for", "isfocused") === "found true";
	const windowShot = (file) => {
		const [x, y, w, h] = osa('tell application "System Events" to tell process "storyforge" to return (position of window 1) & (size of window 1)').stdout.trim().split(", ").map(Number);
		spawnSync("screencapture", ["-x", "-R", [x, y, w, h].join(","), file]);
	};
	const key = typing.key;
	key('keystroke "a" using command down');
	sendKeys("jane and sam. ");
	await sleep(500);
	if (note() !== "Jane and Sam.") problems.push(`in a plot note: typed "jane and sam. ", the field holds ${JSON.stringify(note())}, expected "Jane and Sam."`);
	sendKeys("sam ");
	await sleep(400);
	key('keystroke "z" using command down');
	await sleep(500);
	if (note() !== "Jane and Sam. sam") problems.push(`in a plot note: ⌘Z straight after a name correction should leave what was typed; the field holds ${JSON.stringify(note())}`);
	key('keystroke "z" using command down'); // and the typing of "sam " itself
	await sleep(300);
	sendKeys("~th");
	await sleep(500);
	if (aidShotsAt) windowShot(`${aidShotsAt}-popup.png`);
	key("key code 48"); // Tab accepts while the popup shows
	await sleep(600);
	if (!note().endsWith("the Right Honourable") || !noteFocused()) problems.push(`in a plot note: typed ~th and pressed Tab; the field holds ${JSON.stringify(note())} (focused: ${noteFocused()})`);
	key('keystroke "z" using command down');
	await sleep(500);
	if (!note().endsWith("~th")) problems.push(`in a plot note: ⌘Z after an accepted shortcode should leave ~th; the field holds ${JSON.stringify(note())}`);
	sendKeys(" ~th");
	await sleep(400);
	key("key code 53"); // Escape dismisses the popup only
	await sleep(400);
	if (!note().endsWith("~th ~th") || !noteFocused()) problems.push(`in a plot note: Escape should only dismiss the popup; the field holds ${JSON.stringify(note())} (focused: ${noteFocused()})`);
	key("key code 36"); // Return makes a new line (seen below: the next letter is on a new line, and nothing was accepted)
	await sleep(300);
	sendKeys("x");
	await sleep(300);
	key("key code 48"); // no popup: Tab leaves the field
	await sleep(600);
	if (noteFocused() || !note().endsWith("~th ~th\nx")) problems.push(`in a plot note: Tab with no popup should leave the field and put nothing in; the field holds ${JSON.stringify(note())} (focused: ${noteFocused()})`);
	if (aidShotsAt) {
		find("AXTextArea", "Plot note for", "focus");
		await sleep(300);
		key('keystroke "a" using command down');
		sendKeys("the harbour was quiet, and jane and sam watched it. ");
		await sleep(2000);
		windowShot(`${aidShotsAt}-name.png`);
		console.log(`(pictures of a plot note: ${aidShotsAt}-name.png, ${aidShotsAt}-popup.png)`);
	}

	if (shotAt) {
		sendKeys(process.env.SHOT_TEXT || "Teh quikc brwon foxx jumpd ovr lazyy dogg. ");
		await sleep(2500);
		const [x, y, w] = osa('tell application "System Events" to tell process "storyforge" to return (position of window 1) & (size of window 1)').stdout.trim().split(", ").map(Number);
		spawnSync("screencapture", ["-x", "-R", [x, y + 40, Math.min(w, 900), 300].join(","), shotAt]);
		console.log(`(picture of the app's window: ${shotAt})`);
	}
	if (fieldShotAt) {
		// A plot note is a small editor of its own: the red underlines must appear in it too.
		if (!(await until(() => find("AXTextArea", "Plot note for", "focus").startsWith("found")))) fail("no plot note to type in");
		await sleep(500);
		sendKeys(process.env.FIELD_TEXT || "Teh quikc brwon foxx jumpd ovr lazyy dogg. Don't - wait...");
		await sleep(2500);
		const [x, y, w, h] = osa('tell application "System Events" to tell process "storyforge" to return (position of window 1) & (size of window 1)').stdout.trim().split(", ").map(Number);
		spawnSync("screencapture", ["-x", "-R", [x, y + 40, Math.min(w, 1100), Math.min(h - 40, 760)].join(","), fieldShotAt]);
		console.log(`(picture of a plot note: ${fieldShotAt})`);
	}
} finally {
	child.kill("SIGKILL");
	await sleep(300);
	rmSync(dir, { recursive: true, force: true });
}
console.log("");
if (problems.length === 0) console.log("PASS  the typing aids gave exactly the expected text in a chapter and in a plot note (a name, a shortcode with Tab, Escape, Return and Tab out), one ⌘Z undid a curl, and the Mac's own substitutions did not act as well");
else {
	console.log("FAIL  what the editor holds is not what the aids should give (an aid is wrong, or the Mac's own substitutions acted too)");
	for (const p of problems) console.log(`        - ${p}`);
}
process.exit(problems.length === 0 ? 0 : 1);
