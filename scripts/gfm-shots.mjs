#!/usr/bin/env node
// Brief 20: pictures of the built app's window showing the GFM dressing (a chapter and a Codex note holding every dressed
// element, and the five alerts). macOS only, outside `npm test`. It starts the BUILT app on a throwaway fixture copy with a
// temporary HOME, opens the project by an accessibility press, and takes pictures of the test copy's window only
// (`screencapture -l` with its window number, never the screen). It types nothing and sends no key.
// Usage: node scripts/gfm-shots.mjs <folder for the pictures> [path/to/storyForge.app]
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedTyping } from "./lib/typingGuard.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const BUNDLE_ID = "io.github.kennyrn.storyforge";
const args = process.argv.slice(2);
const out = resolve(args[0] ?? fail("give a folder for the pictures"));
const app = resolve(args[1] ?? join(root, "src-tauri/target/universal-apple-darwin/release/bundle/macos/storyForge.app"));
const binary = join(app, "Contents/MacOS/storyforge");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, a) => spawnSync(cmd, a, { encoding: "utf8" });
const osa = (script, ...a) => run("osascript", ["-e", script, ...a]);
function fail(msg) {
	console.error(`\nREFUSED/FAILED: ${msg}`);
	process.exit(1);
}
if (process.platform !== "darwin") fail("macOS only.");
if (!existsSync(binary)) fail(`no built app at ${app}. Run npm run app:build first.`);
if (run("pgrep", ["-ix", "storyforge"]).stdout.trim()) fail("storyForge is already running. Quit it first.");
if (/CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(run("sh", ["-c", "ioreg -n Root -d1 -a"]).stdout.replace(/\s+/g, " ").replace(/> </g, "><"))) fail("the screen is locked.");
if (osa('tell application "System Events" to get name of first process').status !== 0) fail("System Events is not allowed to drive apps. Give this terminal Accessibility permission.");

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sf-gfm-")));
const home = join(dir, "home");
const project = join(dir, "proj");
cpSync(join(root, "test/fixtures/series"), project, { recursive: true });

const CHAPTER = [
	"# The harbour wakes",
	"",
	"Plain, **bold**, *italic*, ***both***, ~~struck~~ and `code`, with a [Codex link](../../Codex/Harbour.md).",
	"",
	"> A block quote, quieter than the prose.",
	"",
	"- a bullet",
	"- [ ] a task to do",
	"- [x] a task done",
	"",
	"```",
	"fenced code stays plain",
	"```",
	"",
	"|Name|Where|",
	"|----|-----|",
	"|Jane|Harbour|",
	"",
	"***",
	"",
	"<!-- a comment, dimmed -->",
	"",
	"A footnote[^1] at the end.",
	"",
	"[^1]: The footnote itself.",
	"",
].join("\n");
const NOTE = [
	"Harbour is where it starts.",
	"",
	"> [!NOTE]",
	"> Useful information, even when skimming.",
	"",
	"> [!TIP]",
	"> Helpful advice for doing things better.",
	"",
	"> [!IMPORTANT]",
	"> Key information needed to succeed.",
	"",
	"> [!WARNING]",
	"> Urgent, needs immediate attention.",
	"",
	"> [!CAUTION]",
	"> Negative potential consequences.",
	"",
	"> [!SECRET]",
	"> An ordinary quote.",
	"",
	"Also **bold**, *italic*, ==plain==, and [[plain]].",
	"",
].join("\n");
writeFileSync(join(project, "_story-library/aaa/ch-a1.md"), CHAPTER);
writeFileSync(join(project, "Codex/Harbour.md"), NOTE);
mkdirSync(join(project, "_backstage/storyforge"), { recursive: true });
writeFileSync(join(project, "_backstage/storyforge/project.md"), "---\nformat-version: 1\n---\n");
const data = join(home, `Library/Application Support/${BUNDLE_ID}`);
mkdirSync(data, { recursive: true });
writeFileSync(join(data, "recent.json"), JSON.stringify([project]));
mkdirSync(join(data, "project-ui"), { recursive: true });
writeFileSync(join(data, "project-ui", `${createHash("sha256").update(project).digest("hex")}.json`), JSON.stringify({ selectedNovel: null, selectedObject: null, collapsedCodexFolderIds: [], leftWidth: 288, loreWidth: 520, widthUnit: "px", widthsLinked: false }));
mkdirSync(out, { recursive: true });

const clickScript = `on run argv
	set role_ to item 1 of argv
	set prefix to item 2 of argv
	tell application "System Events" to tell process "storyforge"
		if (count of windows) is 0 then return "nowindow"
		set els to entire contents of window 1
		repeat with e in els
			set r to "?"
			set n to ""
			try
				set r to (role of e) as string
				set n to (name of e) as string
			end try
			if r is role_ and n starts with prefix then
				click e
				return "found"
			end if
		end repeat
	end tell
	return "none"
end run`;
// A Codex row is the group just before its name in the accessibility tree: it is focused through accessibility and Return opens it (as the look check does).
const focusRow = (name) => (osa(`on run argv
	tell application "System Events" to tell process "storyforge"
		set els to entire contents of window 1
		repeat with i from 2 to count of els
			set e to item i of els
			set n to ""
			try
				set n to (name of e) as string
			end try
			if (role of e) as string is "AXStaticText" and n is (item 1 of argv) then
				set focused of (item (i - 1) of els) to true
				return "found"
			end if
		end repeat
	end tell
	return "none"
end run`, name).stdout || "").trim().startsWith("found");
const resize = (w, h) => osa(`tell application "System Events" to tell process "storyforge" to set size of window 1 to {${w}, ${h}}`);
const press = (role, prefix) => (osa(clickScript, role, prefix).stdout || "").trim().startsWith("found");
async function until(fn, ms = 15000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (fn()) return true;
		await sleep(250);
	}
	return false;
}
const child = spawn(binary, [], { env: { ...process.env, HOME: home }, stdio: "ignore" });
process.on("exit", () => child.kill("SIGKILL"));
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => process.exit(1));
const windowNumber = () =>
	spawnSync("osascript", ["-l", "JavaScript", "-e", `ObjC.import('CoreGraphics'); const l = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0))); const w = l.find((x) => x.kCGWindowOwnerPID === ${child.pid} && x.kCGWindowLayer === 0); w ? String(w.kCGWindowNumber) : ''`], { encoding: "utf8" }).stdout.trim();
const shot = (name) => {
	const id = windowNumber();
	if (!id) fail(`no picture "${name}": the test copy's window wasn't found`);
	spawnSync("screencapture", ["-x", "-o", "-l", id, join(out, `${name}.png`)]);
	console.log(`saved ${name}.png`);
};

if (!(await until(() => press("AXButton", "The Lantern Cycle")))) fail("the app's window or the project card never appeared");
await sleep(2500);
resize(1200, 1400);
await sleep(1200);
shot("chapter");
// The one key sent (Return on the focused Codex row) goes through the typing guard: to the test copy's own process, only while it is in front and alone.
const typing = guardedTyping({ osa, fail, pid: () => child.pid });
typing.bringToFront();
if (focusRow("Harbour")) {
	await sleep(400);
	typing.keyOnControl("key code 36");
	await sleep(1800);
	shot("codex-note");
} else console.log("could not open the Codex note by accessibility; only the chapter was taken");
child.kill();
console.log(`pictures are in ${out}`);
