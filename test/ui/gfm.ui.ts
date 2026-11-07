import { expect, test, type Locator, type Page } from "@playwright/test";
import { parse } from "yaml";
import { flipFace, openPreview } from "./helpers";

// Brief 20, build 1 (decisions 149 and 157): the GFM dressing in every editor, and the proof that it is display only.

const BOOK_A = "_story-library/novel-aaa.md";
const SERIES = "_story-library/series.md";
const CHAPTER = "_story-library/aaa/ch-a1.md";
const SETTINGS = "_backstage/storyforge/project.md";
const MOD = "Meta";

const COMMENT = "<!-- a comment -->";

/** Every dressed element, in the text the author types (no quote marks, dashes or names: the typing aids have nothing to act on). */
/** In a field the first line is a small heading: a section of a file ends at the next heading of its own level or above. */
const doc = (heading: string): string => [
	heading,
	"",
	"Plain **bold** *italic* ***both*** `code` [a link](../../Codex/Harbour.md)",
	"",
	"> quoted words",
	"",
	"> [!NOTE]",
	"> note body",
	"",
	"> [!TIP]",
	"> tip body",
	"",
	"> [!IMPORTANT]",
	"> important body",
	"",
	"> [!WARNING]",
	"> warning body",
	"",
	"> [!CAUTION]",
	"> caution body",
	"",
	"- a bullet",
	"- [ ] a task",
	"- [x] a done task",
	"",
	"|a|b|",
	"|-|-|",
	"|1|2|",
	"",
	"***",
	"",
	COMMENT,
	"",
	"A footnote[^1] here",
	"",
	"[^1]: the footnote",
	"",
	"==not a highlight== and [[not a link]]",
].join("\n");
const TYPED = doc("# Scene one");
const TYPED_FIELD = doc("#### Scene one");

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const onDisk = (page: Page, path: string): Promise<string> => page.evaluate((p) => window.__preview.read(p), path);
const lastLineOf = (s: string): string => s.split("\n").pop()!;

/** Types the document, moves the caret through every line (so each takes its turn as the active one), and checks the file holds exactly what was typed. */
async function typeAndCheck(page: Page, box: Locator, path: string, contains: boolean, away: () => Promise<void>, typed = TYPED, read: (disk: string) => string = (d) => d): Promise<void> {
	await box.click();
	await page.keyboard.press(`${MOD}+ArrowDown`);
	await page.keyboard.press("Enter");
	await page.keyboard.type(typed);
	for (let i = 0; i < typed.split("\n").length + 2; i++) await page.keyboard.press("ArrowUp");
	for (let i = 0; i < typed.split("\n").length + 2; i++) await page.keyboard.press("ArrowDown");
	await away();
	await expect.poll(async () => read(await onDisk(page, path)), { timeout: 10000 }).toContain(lastLineOf(typed));
	const disk = read(await onDisk(page, path));
	if (contains) expect(disk).toContain(typed);
	else expect(disk.trimEnd().slice(-typed.length)).toBe(typed);
	// The window shows the raw text on every line with the caret; moving through them changed nothing saved.
	expect(read(await onDisk(page, path))).toBe(disk);
}

async function toNovelTab(page: Page): Promise<void> {
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await page.locator('.sf-card[data-chapter="ch-a1.md"] .sf-bar').click();
	await expect(page.locator(".sf-chapter-context .sf-chapter-text .cm-content")).toBeVisible();
}

test.describe("the GFM dressing is display only, in every editor", () => {
	test("the chapter: every element is dressed, and the file holds exactly what was typed", async ({ page }) => {
		await openProject(page);
		const content = page.locator(".sf-slot--centre .cm-content");
		await typeAndCheck(page, content, CHAPTER, false, async () => void (await page.keyboard.press("Escape")));
		await page.keyboard.press(`${MOD}+ArrowDown`);
		// With the caret on the last line, the others are dressed.
		for (const cls of [".sf-heading", ".sf-quote", ".sf-code", ".sf-footnote-ref", ".sf-table-head", ".sf-hr", ".sf-glyph-task-open", ".sf-glyph-task-done", ".sf-link"]) await expect(content.locator(cls).first(), cls).toBeVisible();
		for (const kind of ["note", "tip", "important", "warning", "caution"]) await expect(content.locator(`.cm-line.sf-alert-${kind}`).first(), kind).toBeVisible();
		await expect(content.locator(".sf-alert-label")).toHaveCount(5);
		// The alert icons are Tabler's native 24 px; a table's pipes and alignment row take the colour of a hidden marker shown on the caret's line (muted).
		expect(await content.locator(".sf-alert-icon").first().evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height])).toEqual([24, 24]);
		const MUTED = "rgb(157, 169, 160)";
		const table = content.locator(".cm-line", { hasText: "|-|-|" });
		expect(await table.locator(".sf-marker").first().evaluate((e) => getComputedStyle(e).color)).toBe(MUTED);
		await table.click();
		await page.keyboard.press("Home");
		expect(await table.locator(".sf-marker").first().evaluate((e) => getComputedStyle(e).color)).toBe(MUTED);
		// ==x== and [[x]] are plain text (decision 157).
		await expect(content.locator(".sf-highlight")).toHaveCount(0);
		await expect(content.locator(".cm-line").last()).toHaveText("==not a highlight== and [[not a link]]");
	});

	test("a Codex note", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => window.__app.editors!.open("lore", "Codex/Harbour.md"));
		const note = page.locator(".sf-slot--lore .cm-content");
		await typeAndCheck(page, note, "Codex/Harbour.md", true, async () => void (await page.locator(".sf-slot--centre .cm-content").click()));
	});

	test("the plot note", async ({ page }) => {
		await openProject(page);
		await toNovelTab(page);
		const box = page.getByRole("textbox", { name: "Plot note for Chapter 1" });
		const plot = (disk: string): string => String(parse(disk.split("---")[1])?.chapters?.["ch-a1.md"]?.plot ?? "");
		await typeAndCheck(page, box, BOOK_A, true, async () => void (await page.locator(".sf-chapter-context .sf-chapter-text .cm-content").click()), TYPED_FIELD, plot);
	});

	test("the novel's synopsis", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await page.getByRole("tab", { name: "novel" }).click();
		const box = page.getByRole("region", { name: "Novel overview" }).getByRole("textbox", { name: /^Synopsis of / });
		await typeAndCheck(page, box, BOOK_A, true, async () => void (await page.getByRole("region", { name: "Novel overview" }).locator(".sf-overview-title").click()), TYPED_FIELD);
	});

	test("the series description", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await page.getByRole("tab", { name: "series" }).click();
		const box = page.getByRole("region", { name: "Series overview" }).getByRole("textbox", { name: "Series description" });
		await typeAndCheck(page, box, SERIES, true, async () => void (await page.getByRole("region", { name: "Series overview" }).locator(".sf-overview-title").click()), TYPED_FIELD);
	});

	test("opening a project with every element in a chapter writes nothing (the dressing never edits)", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(async ({ path, text }) => void (await window.__preview.touch(path, text)), { path: CHAPTER, text: TYPED + "\n" });
		const before = await onDisk(page, CHAPTER);
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(page.locator(".sf-slot--centre .cm-content .sf-alert-label").first()).toBeVisible();
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("ArrowUp");
		await expect(page.locator(".sf-slot--centre .cm-content .sf-comment")).toHaveText(COMMENT);
		await page.waitForTimeout(1500);
		expect(await onDisk(page, CHAPTER)).toBe(before);
	});

	test("the retired highlight-colour key stays in project.md untouched, and nothing reads it", async ({ page }) => {
		await openProject(page);
		const text = "---\nformat-version: 1\nhighlight-colour: orange\n---\n";
		await page.evaluate(async ({ path, text }) => {
			await window.__preview.touch(path, text);
			window.__preview.emit("watch-batch", { paths: [path], rescan: false });
		}, { path: SETTINGS, text });
		await expect(page.locator("html")).not.toHaveAttribute("data-highlight-colour", /.*/);
		await page.waitForTimeout(800);
		expect(await onDisk(page, SETTINGS)).toBe(text);
	});
});

test.describe("the typing aids read the parse tree", () => {
	test("a long chapter just opened: an aid waits at most 20 ms for the parse and, if it hasn't reached the caret, changes nothing; once it has, the aid works", async ({ page }) => {
		await openPreview(page);
		const long = "A line of prose with *emphasis* and a [link](x.md) in it, again and again.\n\n".repeat(60000); // about 4.5 MB
		await page.evaluate(async ({ path, text }) => void (await window.__preview.touch(path, text)), { path: CHAPTER, text: long });
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("Enter");
		await page.keyboard.type("it's");
		// Straight at once, if the parse hadn't reached the end: never a wrong change.
		const last = async (): Promise<string> => (await content.locator(".cm-line").last().textContent()) ?? "";
		const first = await last();
		expect(["it's", "it’s"]).toContain(first);
		// Given time, the parse reaches the caret and the aid works again.
		await page.waitForTimeout(6000);
		await page.keyboard.press("Enter");
		await page.keyboard.type("it's");
		await expect.poll(last).toBe("it’s");
	});

	test("a comment typed on its own line, and code with an apostrophe in it once closed, are left alone", async ({ page }) => {
		await openProject(page);
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("Enter");
		await page.keyboard.type("<!-- it's -- done -->");
		await page.keyboard.press("Enter");
		await page.keyboard.type("x `a's` y it's");
		await expect.poll(async () => (await content.locator(".cm-line").allTextContents()).slice(-2)).toEqual(["<!-- it's -- done -->", "x `a’s` y it’s"]);
	});
});

test.describe("code is drawn in Sono", () => {
	test("embedded, with MONO pinned to 1, and the weight of the text around it (inside bold too)", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(async ({ path, text }) => void (await window.__preview.touch(path, text)), { path: CHAPTER, text: "Plain `code` here, **bold `code` bold**.\n\n```\nfenced\n```\n\nlast line\n" });
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press(`${MOD}+ArrowDown`); // off the first line, so its markers are hidden
		await page.evaluate(() => document.fonts.load('300 16px "Sono"'));
		expect(await page.evaluate(() => document.fonts.check('300 16px "Sono"'))).toBe(true); // the embedded file is loaded (a missing file would make this false)
		const style = (loc: Locator) => loc.first().evaluate((e) => {
			const s = getComputedStyle(e);
			return { family: s.fontFamily.split(",")[0].replace(/"/g, "").trim(), weight: s.fontWeight, variation: s.fontVariationSettings, size: parseFloat(s.fontSize), parentWeight: getComputedStyle(e.parentElement!).fontWeight, parentSize: parseFloat(getComputedStyle(e.parentElement!).fontSize) };
		});
		const plain = await style(content.locator(".sf-code").first());
		expect(plain.family).toBe("Sono");
		expect(plain.variation).toContain("MONO");
		expect(plain.weight).toBe(plain.parentWeight); // the text's own weight: 300 in the chapter
		expect(plain.size).toBeCloseTo(plain.parentSize * 0.9, 0); // relative: it follows the Writing size
		const inBold = await style(content.locator(".sf-strong .sf-code"));
		expect(inBold.weight).toBe("700");
		const fence = await style(content.locator(".sf-codeblock").first());
		expect(fence.family).toBe("Sono");
		expect(fence.variation).toContain("MONO");
	});
});
