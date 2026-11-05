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
//   --shots saves pictures of the window: the chapter, a Codex note in the context panel, a plot note, both Codex lists.
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


const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-look-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });
// The wynn and yogh lines are in the chapter on disk: the keystroke tool can't type them (it types an "a"), and what is
// checked is how they are drawn, not how they are typed.
appendFileSync(join(project, "_story-library/aaa/ch-a1.md"), "\n\nƿȝƿȝƿȝƿȝƿȝ\n\n*ƿȝƿȝƿȝƿȝƿȝƿ*\n\nThe old letters, upright: ð þ ƿ ȝ ǣ, in *italic: ð þ ƿ ȝ ǣ*, in **bold: ð þ ƿ ȝ ǣ**.\n");
// The Codex list's spacing is judged on a deep folder and a name with an accented capital and descenders (decision 85): Cast > Houses >
// Ravens > The Nest > Óswyg is three folders inside Cast.
writeFileSync(join(project, "Codex/Óswyg.md"), "An accented capital and two descenders.\n");
const codexPath = join(project, "_backstage/storyforge/codex.md");
writeFileSync(
	codexPath,
	readFileSync(codexPath, "utf8")
		.replace("      - Codex/Sam.md\n  f-places:", "      - Codex/Sam.md\n      - f-houses\n  f-houses:\n    name: Houses\n    order:\n      - f-ravens\n  f-ravens:\n    name: Ravens\n    order:\n      - f-nest\n  f-nest:\n    name: The Nest\n    order:\n      - Codex/Óswyg.md\n  f-places:")
		.replace("  Codex/Windows.md: populace\n", "  Codex/Windows.md: populace\n  Codex/Óswyg.md: person\n"),
);
// LOOK_CODEX_COLOUR=green (or any choice) sets the project's Codex colour, to take the pictures in that colour.
// The storytelling side's Codex list is the author's choice of font (decision 84): this check is of SN Pro in it, so the project chooses it
// (400 at 1 rem, the 16 px it was drawn at before).
mkdirSync(join(project, "_backstage/storyforge"), { recursive: true });
writeFileSync(join(project, "_backstage/storyforge/project.md"), `---\nformat-version: 1\n${process.env.LOOK_CODEX_COLOUR ? `codex-colour: ${process.env.LOOK_CODEX_COLOUR}\n` : ""}appearance-codex-font: SN Pro\nappearance-codex-weight: 400\nappearance-codex-size: 1\n${process.env.LOOK_READOUT ? "show-session-readout: true\n" : ""}---\n`);
const data = join(home, DATA_FOLDER);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
// The context panel's card is measured at the width these checks were written for (400 px). Since 1.5.0 a project with nothing stored opens with the panels linked at 288 px, so the widths are stored here.
mkdirSync(join(data, "project-ui"), { recursive: true });
writeFileSync(join(data, "project-ui", `${createHash("sha256").update(project).digest("hex")}.json`), JSON.stringify({ selectedNovel: null, selectedObject: null, collapsedCodexFolderIds: [], leftWidth: 288, loreWidth: 400, widthUnit: "px", widthsLinked: false }));
if (shotsAt) mkdirSync(shotsAt, { recursive: true });

const key = typing.key;
/** The test copy's window by its window number, so a picture is of that window alone and nothing of anyone else's can be in it. */
const windowNumber = () =>
	spawnSync("osascript", ["-l", "JavaScript", "-e", `ObjC.import('CoreGraphics'); const l = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0))); const w = l.find((x) => x.kCGWindowOwnerPID === ${child.pid} && x.kCGWindowLayer === 0); w ? String(w.kCGWindowNumber) : ''`], { encoding: "utf8" }).stdout.trim();
const windowShot = (name) => {
	if (!shotsAt) return;
	const id = windowNumber();
	if (!id) return void problems.push(`no picture "${name}": the test copy's window wasn't found (a picture is never taken of the screen)`);
	spawnSync("screencapture", ["-x", "-o", "-l", id, join(shotsAt, `${name}.png`)]);
};
/**
 * How far the ink of the upper half of a line sits to the right of the ink of its lower half, in pixels of a 2x picture:
 * upright letters sit about square (little), italic ones lean forward (more). Read from a screenshot of the line.
 */
const inkLean = ([x, y, w, h]) => {
	const png = join(dir, "lean.png");
	const bmp = join(dir, "lean.bmp");
	spawnSync("screencapture", ["-x", "-R", `${x - 2},${y - 2},${w + 4},${h + 4}`, png]);
	spawnSync("sips", ["-s", "format", "bmp", png, "--out", bmp]);
	const b = readFileSync(bmp);
	const start = b.readUInt32LE(10);
	const W = b.readInt32LE(18);
	const rawH = b.readInt32LE(22);
	const H = Math.abs(rawH);
	const bytes = b.readUInt16LE(28) / 8;
	const stride = Math.ceil((W * bytes) / 4) * 4;
	const lum = (px, py) => {
		const row = rawH > 0 ? H - 1 - py : py; // BMP rows run bottom-up unless the height is negative
		const o = start + row * stride + px * bytes;
		return (b[o] + b[o + 1] + b[o + 2]) / 3;
	};
	const bg = lum(0, 0);
	const ink = [];
	for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) if (Math.abs(lum(px, py) - bg) > 50) ink.push([px, py]);
	if (ink.length === 0) return 0;
	const top = Math.min(...ink.map((p) => p[1]));
	const bottom = Math.max(...ink.map((p) => p[1]));
	const mid = (top + bottom) / 2;
	const mean = (pts) => pts.reduce((a, p) => a + p[0], 0) / Math.max(1, pts.length);
	return mean(ink.filter((p) => p[1] < mid)) - mean(ink.filter((p) => p[1] >= mid));
};
const clickAny = (name) => ["AXButton", "AXCheckBox", "AXToggle", "AXRadioButton", "AXTab"].some((role) => find(role, name, "click").startsWith("found"));
const problems = [];
/** A line's width must be within 2 px of what SN Pro gives, and clearly not what the system font gives. */
const expectWidth = (what, got, sn, sys) => {
	if (got === null) return problems.push(`${what}: no line of that text was found through accessibility`);
	if (Math.abs(got - sn) > 2.5) problems.push(`${what}: the line is ${got} px wide; SN Pro gives ${sn} px (the system font gives ${sys} px), so the font is not drawing`);
};

const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" }); // nothing is read from it, so nothing may be piped to a reader that goes away first
// The test copy is this script's own child: whichever way the script ends (a refusal included), it goes with it.
process.on("exit", () => child.kill("SIGKILL"));
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => process.exit(1)); // so the line above runs when the script is stopped from outside
try {
	if (!(await until(() => find("AXButton", "Open Project").startsWith("found")))) fail("the app's window never appeared");
	if (!(await until(() => find("AXButton", "The Lantern Cycle").startsWith("found"), 8000))) fail("the temporary HOME did not redirect the app's data folder");
	find("AXButton", "The Lantern Cycle", "click");
	if (!(await until(() => find("AXTextArea", "Text").startsWith("found")))) fail("the project did not open");
	await sleep(1200);

	// The Codex list (16 px since 1.3.0; the references are the 13 px figures scaled by 16/13, and "Jane" measured 33 and "Harbour" 58 in SN Pro): "Jane" is 33 px in SN Pro, about 36 in the system font; "Harbour" 58 and about 60.
	expectWidth("the Codex list, Jane", widthOf("AXStaticText", "Jane"), 33, 36);
	expectWidth("the Codex list, Harbour", widthOf("AXStaticText", "Harbour"), 58, 60);
	windowShot("codex-storytelling-no-note");
	// The navigator, closed and open (the list covers the top of the Codex): an accessibility press on the chapter selector, no keystrokes.
	windowShot("navigator-closed");
	const pressSelector = () => ["AXPopUpButton", "AXButton", "AXMenuButton"].some((role) => find(role, "Chapters", "click").startsWith("found")); // aria-haspopup makes it a pop-up button
	if (pressSelector()) {
		await sleep(500);
		windowShot("navigator-open");
		pressSelector(); // closes it again
		await sleep(500);
	} else problems.push("could not find the chapter selector");

	// The chapter (20 px): ten "w" upright are 161 px in SN Pro (about 150 in the system font), eleven in italic 191 (the italic file
	// is a real italic). Then ten wynn and yogh, which SN Pro lacks: Arial draws them, and in italic text Arial Italic, not the
	// upright (the two have the same widths, so the slant of the ink is measured).
	if (process.env.LOOK_READOUT) windowShot("stats-no-session"); // the readout on, before any edit
	find("AXTextArea", "Text", "focus");
	await sleep(400);
	key("key code 125 using command down"); // ⌘↓: the end of the chapter
	for (const line of ["wwwwwwwwww", "*wwwwwwwwwww*"]) {
		key("key code 36");
		sendKeys(line);
	}
	key("key code 36");
	sendKeys("end");
	await sleep(700);
	expectWidth("the chapter, upright", widthOf("AXStaticText", "wwwwwwwwww"), 161, 150);
	expectWidth("the chapter, italic", widthOf("AXStaticText", "wwwwwwwwwww"), 191, 160);
	const upright = frameOf("AXStaticText", "ƿȝƿȝƿȝƿȝƿȝ", 1);
	const italic = frameOf("AXStaticText", "ƿȝƿȝƿȝƿȝƿȝ", 2);
	if (!upright || !italic) problems.push("the lines of wynn and yogh were not found through accessibility");
	else {
		const lean = inkLean(italic) - inkLean(upright);
		// Arial Italic leans about 12 degrees: over the height of a letter that is several pixels of difference between the top and the bottom.
		if (!(lean >= 2)) problems.push(`wynn and yogh inside italic text lean ${lean.toFixed(1)} px (at 2x) more than the upright ones; Arial Italic should lean by several pixels, so the italic is not being drawn`);
		else console.log(`(wynn and yogh in italic lean ${lean.toFixed(1)} px more than upright: Arial Italic)`);
	}
	windowShot("chapter");
	if (process.env.LOOK_READOUT) {
		// The session is ongoing; after a minute without an edit the clock is the paused one (decision 68).
		windowShot("stats-in-session");
		await sleep(70000);
		windowShot("stats-paused");
	}
	// With the context panel hidden (View > Show or Hide Context) the workspace is wide enough for the editor's maximum width (30em: 600 px at 20 px) to show.
	osa('tell application "System Events" to tell process "storyforge" to click menu item "Show or Hide Context" of menu 1 of menu bar item "View" of menu bar 1');
	await sleep(700);
	windowShot("chapter-30em");
	osa('tell application "System Events" to tell process "storyforge" to click menu item "Show or Hide Context" of menu 1 of menu bar item "View" of menu bar 1');
	await sleep(700);

	// A Codex note in the context panel.
	// The keyboard: the row is focused through accessibility and Return opens it (no pointer is used anywhere in this script).
	if (!find("AXStaticText", "Sam", "focusrow").startsWith("found")) problems.push("could not focus Sam in the Codex list");
	await sleep(300);
	typing.keyOnControl("key code 36");
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
		expectWidth("the Codex note in the context panel, upright", widthOf("AXStaticText", "wwwwwwwwww", 3), 161, 150);
		expectWidth("the Codex note in the context panel, italic", widthOf("AXStaticText", "wwwwwwwwwww", 2), 191, 160);
		windowShot("codex-note-in-context-panel");
		// Sam is selected (highlighted, touching its folder's line). Focus it by the keyboard route (accessibility): the ring on a highlighted row.
		if (find("AXStaticText", "Sam", "focusrow").startsWith("found")) {
			await sleep(500);
			windowShot("codex-selected-and-focused");
		}
		// A highlighted row with the focus ring and an accented capital and descenders ("Óswyg"), in a folder three levels inside Cast:
		// any clipping from the line height shows. Opened by the keyboard, then focused again by accessibility.
		if (find("AXStaticText", "Óswyg", "focusrow").startsWith("found")) {
			typing.keyOnControl("key code 36");
			await sleep(1200);
			find("AXStaticText", "Óswyg", "focusrow");
			await sleep(500);
			windowShot("codex-accent-descender-focused");
		} else problems.push("could not focus Óswyg in the Codex list");
		// The strip's icon focused: its colour is the Codex colour, as on hover (a hover needs a pointer, which this script never uses).
		if (find("AXButton", "New folder", "focus").startsWith("found")) {
			await sleep(500);
			windowShot("strip-focused");
		}
	}

	// The library side's Codex list, and a plot note (Fields style, 14 px since 1.10.0: ten "w" is 105 px at 13 px in SN Pro, so 113 at 14).
	if (!(await until(() => clickAny("Open the novel on the library side")))) fail("could not reach the library side");
	await sleep(600);
	clickAny("codex");
	await sleep(800);
	expectWidth("the library's Codex list, Jane", widthOf("AXStaticText", "Jane"), 33, 36);
	windowShot("codex-library");
	// A Codex note opened in the workspace (the library side's entries open there): the keyboard again.
	if (!find("AXStaticText", "Jane", "focusrow").startsWith("found")) problems.push("could not focus Jane in the library's Codex list");
	await sleep(300);
	typing.keyOnControl("key code 36");
	await sleep(1200);
	windowShot("codex-note-in-workspace");
	if (!(await until(() => clickAny("novel"), 8000))) fail("could not reach the novel tab");
	if (!(await until(() => find("AXTextArea", "Plot note for", "focus").startsWith("found")))) fail("no plot note to type in");
	await sleep(500);
	key('keystroke "a" using command down');
	sendKeys("wwwwwwwwww");
	await sleep(700);
	expectWidth("a plot note", widthOf("AXStaticText", "wwwwwwwwww", 1), 113, 108);
	windowShot("plot-note");
	// The Writing font (Brief 18): changed outside (the file, which the app reads live), it changes the writing surfaces and nothing else.
	writeFileSync(join(project, "_backstage/storyforge/project.md"), `---\nformat-version: 1\n${process.env.LOOK_CODEX_COLOUR ? `codex-colour: ${process.env.LOOK_CODEX_COLOUR}\n` : ""}appearance-codex-font: SN Pro\nappearance-codex-weight: 400\nappearance-codex-size: 1\nappearance-writing-font: Courier Prime\n${process.env.LOOK_READOUT ? "show-session-readout: true\n" : ""}---\n`);
	await sleep(2500);
	const changed = widthOf("AXStaticText", "wwwwwwwwww", 1);
	if (changed === null) problems.push("the plot note's line was not found after the Writing font changed");
	else if (Math.abs(changed - 113) < 8) problems.push(`the plot note's line is still ${changed} px wide after the Writing font was set to Courier Prime (SN Pro gave 113): the Writing font is not reaching the fields`);
	else console.log(`(the plot note's ten "w" went from 113 px to ${changed} px with the Writing font set to Courier Prime)`);
	windowShot("plot-note-courier");
} finally {
	child.kill("SIGKILL");
	await sleep(300);
	rmSync(dir, { recursive: true, force: true });
}
console.log("");
if (problems.length === 0) console.log("PASS  SN Pro (the default Writing font) is drawing in the Codex list (both sides), the chapter, a Codex note in the context panel and a plot note, upright and italic where the surface has an italic (a plot note is plain text, with none), at the widths its shipped files give; and the Writing font, changed in project.md, changes the fields");
else {
	console.log("FAIL  the built app is not drawing what it should");
	for (const p of problems) console.log(`        - ${p}`);
}
process.exit(problems.length === 0 ? 0 : 1);
