import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as nodePath from "node:path";
import { openPreview, shot } from "./helpers";

const SESSIONS = "_backstage/storyforge/sessions";
const entry = (id: string, day: string, from: string, to: string, net: number, extra = "") =>
	[
		`  - id: ${id}`,
		`    start: ${day}T${from}:00+00:00`,
		`    end: ${day}T${to}:00+00:00`,
		`    day: ${day}`,
		`    net: ${net}`,
		"    chapters:",
		"      - path: aaa/ch-a1.md",
		"        id: c-a1k3",
		`        net: ${net}`,
		extra || "    unreliable: false",
		"    recovered: false",
	].join("\n");
const file = (...entries: string[]) => `---\nsessions-format: 1\ncomputer: k7x2q9ab\nsessions:\n${entries.join("\n")}\n---\nWriting sessions.\n`;
const DAY = "2026-10-20"; // the fixture's history has 25 words on this day

const normal = entry("a", DAY, "09:00:00".slice(0, 5), "09:20", 400);
const unreliable = entry("b", DAY, "10:00", "10:30", 20, "    unreliable: true");
const short = entry("c", DAY, "11:00", "11:02", 3);
const editing = entry("d", DAY, "12:00", "12:20", -4);
const recovered = entry("e", DAY, "13:00", "13:20", 300).replace("recovered: false", "recovered: true");

async function openWith(page: Page, files: Record<string, string>): Promise<void> {
	await openPreview(page);
	for (const [name, text] of Object.entries(files)) await page.evaluate(([p, t]) => window.__preview.touch(p, t), [`${SESSIONS}/${name}`, text]);
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const history = async (page: Page) => {
	await page.getByRole("button", { name: /Open the history/ }).click();
	return page.getByRole("dialog", { name: "Word count history" });
};

test.describe("writing sessions in the history view", () => {
	test("a day lists its sessions with times, length, words, pace and chapters; short ones are not listed", async ({ page }) => {
		await openWith(page, { "2026-10-k7x2q9ab.md": file(normal, unreliable, short, editing, recovered) });
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		const list = d.getByRole("list", { name: "Writing sessions" });
		await expect(list.locator(".sf-session")).toHaveCount(4); // the 2-minute session is left out
		const first = list.locator(".sf-session").first();
		await expect(first).toContainText("09:00–09:20, 20 min");
		await expect(first).toContainText("400 words, 20 words a minute");
		await expect(first).toContainText("Chapter 1");
		await expect(list).not.toContainText("11:00");
		// the day's chapter rows keep their numbers inside the dialog: nothing in the view is wider than the view
		expect(await page.evaluate(() => { const b = document.querySelector(".sf-dialog-body") as HTMLElement; const r = b.getBoundingClientRect(); return [...b.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > r.right + 1).length; })).toBe(0);
		await list.scrollIntoViewIfNeeded();
		await shot(page, "sessions-history");
	});

	test("editing, unreliable and recovered sessions carry those words", async ({ page }) => {
		await openWith(page, { "2026-10-k7x2q9ab.md": file(normal, unreliable, short, editing, recovered) });
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		const row = (time: string) => d.locator(".sf-session", { hasText: time });
		await expect(row("10:00–10:30").locator(".sf-session-tag")).toHaveText(["unreliable"]);
		await expect(row("12:00–12:20").locator(".sf-session-tag")).toHaveText(["editing"]);
		await expect(row("12:00–12:20")).toContainText("net loss of 4 words, no pace");
		await expect(row("10:00–10:30")).toContainText("20 words, 1 word a minute");
		await expect(row("13:00–13:20").locator(".sf-session-tag")).toHaveText(["recovered"]);
		await expect(row("09:00–09:20").locator(".sf-session-tag")).toHaveCount(0);
	});

	test("the day's figure leaves out unreliable and editing sessions; the chapter breakdown still counts every word", async ({ page }) => {
		await openWith(page, { "2026-10-k7x2q9ab.md": file(normal, unreliable, short, editing, recovered) });
		const d = await history(page);
		// the history says 25; the unreliable session's 20 and the editing session's −4 come off: 25 − 20 + 4 = 9
		await expect(d.getByRole("gridcell", { name: /Tuesday 20 October: 9\b/ })).toBeVisible();
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		await expect(d.locator(".sf-history-chapter")).toContainText("25");
		await expect(d.locator(".sf-history-day .sf-history-note")).toContainText("16 words written in editing or unreliable sessions are left out");
	});

	test("the average pace is drawn from qualifying sessions only, and says how many", async ({ page }) => {
		await openWith(page, { "2026-10-k7x2q9ab.md": file(normal, unreliable, short, editing, recovered) });
		const d = await history(page);
		// (400 + 300) words over (20 + 20) minutes = 17.5, from 2 sessions: the unreliable, editing and short ones are not in it
		await expect(d.locator(".sf-history-stat", { hasText: "Average pace" })).toContainText("18 words a minute (2 sessions)");
	});

	test("sessions from another computer are merged, and a file that can't be read is named and left alone", async ({ page }) => {
		const bad = "---\nsessions: &a []\nlater: *a\n---\nanchors\n";
		await openWith(page, { "2026-10-k7x2q9ab.md": file(normal), "2026-10-zzzz0000.md": file(entry("z", DAY, "15:00", "15:30", 120)).replace("k7x2q9ab", "zzzz0000"), "2026-10-bad00000.md": bad });
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		await expect(d.locator(".sf-session")).toHaveCount(2);
		await expect(d.getByRole("note")).toContainText("One session file couldn't be read");
		await expect(d.getByRole("note")).toContainText("2026-10-bad00000.md");
		expect(await page.evaluate((p) => window.__preview.read(p), `${SESSIONS}/2026-10-bad00000.md`)).toBe(bad);
	});

	test("opening the history view writes nothing, sessions included", async ({ page }) => {
		await openWith(page, { "2026-10-k7x2q9ab.md": file(normal, unreliable) });
		const before = await page.evaluate((p) => window.__preview.read(p), `${SESSIONS}/2026-10-k7x2q9ab.md`);
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		await page.keyboard.press("Escape");
		expect(await page.evaluate((p) => window.__preview.read(p), `${SESSIONS}/2026-10-k7x2q9ab.md`)).toBe(before);
	});
});

test.describe("recording a session in the app", () => {
	const settings = "---\nformat-version: 1\nsession-idle-minutes: 1\nsession-min-shown-minutes: 0\n---\n";
	const projectMd = "_backstage/storyforge/project.md";

	test("type, pause past the idle limit, and the session is listed in the history view; nothing is written to the project until it ends", async ({ page }) => {
		const { root } = await openPreview(page);
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [projectMd, settings]);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.clock.install({ time: new Date("2026-10-26T10:00:00Z") });
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press("End");
		for (let i = 0; i < 6; i++) {
			await page.keyboard.type(" some freshly written words here");
			await page.clock.runFor(10_000);
		}
		// still writing: the chapter has been saved, but no session file exists yet
		expect(existsSync(nodePath.join(root, SESSIONS))).toBe(false);
		await page.clock.runFor(70_000); // past the one-minute limit
		await page.waitForTimeout(300);
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Monday 26 October/ }).click();
		const row = d.locator(".sf-session").first();
		await expect(row).toContainText("10:00–10:00"); // started and ended at the first and last edits (the clock ran 10 s between)
		await expect(row).toContainText("30 words");
		await expect(row).toContainText("Chapter 1");
		expect(existsSync(nodePath.join(root, SESSIONS))).toBe(true);
	});

	test("a real paste of many words marks the session unreliable, leaves it out of the day's figure, and the chapter still counts the words", async ({ page }) => {
		const { root } = await openPreview(page);
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [projectMd, settings]);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.clock.install({ time: new Date("2026-10-26T10:00:00Z") });
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		const chapterWords = () => page.evaluate(() => (window.__app.running as any).opened.project.wordCount("_story-library/aaa/ch-a1.md") as number);
		const before = await chapterWords();
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press("End");
		await page.evaluate(() => {
			const data = new DataTransfer();
			data.setData("text/plain", Array.from({ length: 50 }, () => "pasted").join(" "));
			document.querySelector(".sf-slot--centre .cm-content")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
		});
		await page.clock.runFor(5_000);
		await page.keyboard.type(" and then some more typing");
		await page.clock.runFor(5_000);
		await expect.poll(chapterWords).toBeGreaterThanOrEqual(before + 50); // what is on the page counts every word, pasted or not
		await page.clock.runFor(70_000);
		await page.waitForTimeout(300);
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Monday 26 October/ }).click();
		await expect(d.locator(".sf-session").first().locator(".sf-session-tag")).toHaveText(["unreliable"]);
		// the history credits the day with every word saved; the storytelling figure leaves the session out
		const raw = Number(/2026-10-26:\n\s+net: (-?\d+)/.exec(await page.evaluate(() => window.__preview.read("_backstage/storyforge/aaa/wordcount.md")))?.[1]);
		const dir = nodePath.join(root, SESSIONS);
		const sessionNet = Number(/^ {4}net: (-?\d+)/m.exec(readFileSync(nodePath.join(dir, readdirSync(dir)[0]), "utf8"))?.[1]);
		expect(sessionNet).toBeGreaterThanOrEqual(50); // the paste glued to the last word counts one word fewer
		expect(raw).toBeGreaterThanOrEqual(sessionNet);
		await expect(d.getByRole("gridcell", { name: new RegExp(`Monday 26 October: ${raw - sessionNet}$`) }).first()).toBeVisible();
	});
});

test.describe("the live readout", () => {
	const projectMd = "_backstage/storyforge/project.md";
	const start = async (page: Page, readout: boolean) => {
		await openPreview(page);
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [projectMd, `---\nformat-version: 1\nsession-idle-minutes: 5\nshow-session-readout: ${readout}\n---\n`]);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.clock.install({ time: new Date("2026-10-26T10:00:00Z") });
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press("End");
	};
	const readout = (page: Page) => page.getByTestId("session-readout");
	const length = (page: Page) => readout(page).locator(".sf-stats-length");
	const words = (page: Page) => readout(page).locator(".sf-stats-words");
	const clock = (page: Page) => readout(page).locator(".sf-stats-clock");

	test("with the setting on the row is always there: the clock beneath the count icon, `0m`, no words, before any session", async ({ page }) => {
		await start(page, true);
		await expect(readout(page)).toBeVisible();
		await expect(clock(page)).toHaveAttribute("data-clock", "idle");
		await expect(length(page)).toHaveText("0m");
		await expect(words(page)).toBeHidden();
		const [graph, count, clockBox] = await Promise.all([page.locator(".sf-stats-chart").boundingBox(), page.locator(".sf-stats-count").boundingBox(), clock(page).boundingBox()]);
		expect(clockBox?.y).toBeGreaterThan((count?.y ?? 0) + (count?.height ?? 0) - 1); // beneath the count icon
		expect(Math.abs((clockBox?.x ?? 0) - (count?.x ?? 99))).toBeLessThan(2); // in its column, not the graph icon's
		expect(Math.abs((count?.y ?? 0) + (count?.height ?? 0) - ((graph?.y ?? 0) + (graph?.height ?? 0)))).toBeLessThan(1.5); // bottoms line up
		expect(await clock(page).locator("svg").getAttribute("width")).toBe("16"); // its natural size
		await shot(page, "stats-readout-idle");
	});

	test("length is first edit to last, in hours and minutes; the clock pauses a minute after the last edit and runs again at the next", async ({ page }) => {
		await start(page, true);
		await page.keyboard.type(" one two three");
		await page.clock.runFor(2 * 60_000 - 5_000);
		await page.keyboard.type(" four five");
		await page.clock.runFor(2_000);
		await expect(length(page)).toHaveText("1m"); // 1 min 55 s from first edit to last
		await expect(words(page)).toHaveText("5 words");
		await expect(clock(page)).toHaveAttribute("data-clock", "session");
		await page.clock.runFor(61_000);
		await expect(clock(page)).toHaveAttribute("data-clock", "paused");
		await expect(length(page)).toHaveText("1m"); // holds while paused
		await expect(words(page)).toHaveText("5 words");
		await shot(page, "stats-readout-paused");
		await page.keyboard.type(" six");
		await page.clock.runFor(1_000);
		await expect(clock(page)).toHaveAttribute("data-clock", "session");
		await expect(length(page)).toHaveText("2m"); // first edit to this one, 2 min 58 s
		await expect(words(page)).toHaveText("6 words");
	});

	test("the words follow the typing: they match what was typed within 300 ms of the last key", async ({ page }) => {
		await start(page, true);
		await page.keyboard.type(" one two three four five six");
		await page.clock.runFor(300);
		await expect(words(page)).toHaveText("6 words");
		await page.keyboard.type(" seven");
		await page.clock.runFor(300);
		await expect(words(page)).toHaveText("7 words");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.clock.runFor(300);
		await expect(words(page)).toHaveText("6 words"); // a word deleted takes one off
	});

	test("when the session ends the row goes back to the standard clock, `0m` and no words", async ({ page }) => {
		await start(page, true);
		await page.keyboard.type(" one two three");
		await page.clock.runFor(61_000);
		await expect(clock(page)).toHaveAttribute("data-clock", "paused");
		await page.clock.runFor(6 * 60_000); // past the idle limit
		await expect(clock(page)).toHaveAttribute("data-clock", "idle");
		await expect(length(page)).toHaveText("0m");
		await expect(words(page)).toBeHidden();
	});

	test("with session as the count on display, the words aren't repeated in the row", async ({ page }) => {
		await start(page, true);
		await page.locator(".sf-stats-count").click();
		await page.locator(".sf-stats-count").click(); // day, week, session
		await page.locator(".sf-slot--centre .cm-content").click(); // a space typed on the focused icon would step it on
		await page.keyboard.press("End");
		await page.keyboard.type(" one two three");
		await page.clock.runFor(2_000);
		await expect(page.locator(".sf-stats-value")).toHaveText("Words this session: 3");
		await expect(words(page)).toBeHidden();
		await expect(length(page)).toHaveText("0m");
		await shot(page, "stats-readout-session");
	});

	test("every part of the row is grey1, and it is quiet: no live region, no animation, never focused", async ({ page }) => {
		await start(page, true);
		await page.keyboard.type(" one two three");
		await page.clock.runFor(2_000);
		for (const loc of [readout(page), clock(page), length(page), words(page)]) expect(await loc.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(133, 146, 137)");
		expect(await readout(page).getAttribute("aria-live")).toBeNull();
		expect(await readout(page).evaluate((e) => getComputedStyle(e).animationName + getComputedStyle(e).transitionDuration)).toMatch(/^none0s$/);
		expect(await page.evaluate(() => document.activeElement?.className ?? "")).toContain("cm-content");
	});

	test("with the setting off the row isn't drawn", async ({ page }) => {
		await start(page, false);
		await page.keyboard.type(" one two three");
		await page.clock.runFor(3_000);
		await expect(readout(page)).toBeHidden();
	});
});
