import { expect, test, type Locator, type Page } from "@playwright/test";
import { parse } from "yaml";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 20, build 1 (decisions 149 and 157): the GFM dressing in every editor, and the proof that it is display only.

const BOOK_A = "_story-library/novel-aaa.md";
const SERIES = "_story-library/series.md";
const CHAPTER = "_story-library/aaa/ch-a1.md";
const SETTINGS = "_backstage/storyforge/project.md";
const MOD = "ControlOrMeta";

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

	test("a comment typed on its own line, and code with an apostrophe in it, are left alone as typed", async ({ page }) => {
		await openProject(page);
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("Enter");
		await page.keyboard.type("<!-- it's -- done -->");
		await page.keyboard.press("Enter");
		await page.keyboard.type("x `a's` y it's");
		await expect.poll(async () => (await content.locator(".cm-line").allTextContents()).slice(-2)).toEqual(["<!-- it's -- done -->", "x `a's` y it’s"]);
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

test.describe("Codex links", () => {
	const content = (page: Page) => page.locator(".sf-slot--centre .cm-content");
	const popup = (page: Page) => page.getByRole("listbox", { name: "Codex entries" });
	const docOf = async (page: Page): Promise<string> => (await content(page).locator(".cm-line").allTextContents()).join("\n");
	const seed = (page: Page, text: string) => page.evaluate(async ({ path, text }) => void (await window.__preview.touch(path, text)), { path: CHAPTER, text });
	async function open(page: Page, text?: string): Promise<void> {
		await openPreview(page);
		if (text !== undefined) await seed(page, text);
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
	}
	async function atEnd(page: Page): Promise<void> {
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("Enter");
	}

	test("[[ offers the Codex entries, an alias too; Tab writes the complete GFM link; one ⌘Z gives back what was typed", async ({ page }) => {
		await open(page, "Start.\n");
		await atEnd(page);
		await page.keyboard.type("[[sa");
		await expect(popup(page).getByRole("option")).toHaveCount(1);
		await expect(popup(page).getByRole("option", { name: /Sam/ })).toBeVisible();
		await page.keyboard.press("Tab");
		await expect.poll(() => docOf(page)).toBe("Start.\n[Sam](../../Codex/Sam.md)");
		await expect.poll(() => onDisk(page, CHAPTER)).toContain("[Sam](../../Codex/Sam.md)");
		await page.keyboard.press(`${MOD}+z`);
		expect(await docOf(page)).toBe("Start.\n[[sa");
		// an alias is matched, and becomes the link's text
		await page.keyboard.press(`${MOD}+a`);
		await page.keyboard.type("[[Sammy");
		await expect(popup(page).getByRole("option", { name: /alias: Sammy/ })).toBeVisible();
		await page.keyboard.press("Tab");
		await expect.poll(() => docOf(page)).toBe("[Sammy](../../Codex/Sam.md)");
	});

	test("every non-archived entry is offered, in any order of typing; an archived one never; Escape and other keys leave the typing alone", async ({ page }) => {
		await open(page, "");
		await atEnd(page);
		await page.keyboard.type("[[");
		await expect(popup(page).getByRole("option")).toHaveCount(6); // Harbour, Jane, Sam, Windows, NoNewline and Zoë; Retired is archived
		await page.keyboard.press("Escape");
		await expect(popup(page)).toHaveCount(0);
		await page.keyboard.type("ret]]");
		await expect(popup(page)).toHaveCount(0);
		expect(await docOf(page)).toBe("\n[[ret]]");
	});

	test("nothing is offered inside code or a comment, nor for a [[ that was already there", async ({ page }) => {
		await open(page, "Old [[sa\n");
		await atEnd(page);
		await page.keyboard.type("`[[sa"); // inside an unclosed backtick (the unclosed-line rule)
		await expect(popup(page)).toHaveCount(0);
		await page.keyboard.press("Enter");
		await page.keyboard.type("```");
		await page.keyboard.press("Enter");
		await page.keyboard.type("[[sa"); // inside a fenced block
		await expect(popup(page)).toHaveCount(0);
		await page.keyboard.press("Enter");
		await page.keyboard.type("```");
		await page.keyboard.press("Enter");
		await page.keyboard.press("Enter");
		await page.keyboard.type("<!-- [[sa"); // inside an HTML comment that starts its line
		await expect(popup(page)).toHaveCount(0);
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("End");
		await expect(popup(page)).toHaveCount(0); // text that was already there
	});

	test("live and muted links, and the tooltips of the muted ones", async ({ page }) => {
		const text = ["[Sam](../../Codex/Sam.md)", "[Ch](ch-a2.md)", "[Idea](../../notes/idea.md)", "[Gone](../../Codex/Nobody.md)", "[Web](https://example.com/x)", "[Old](../../Codex/Retired.md)", "end"].join("\n\n");
		await open(page, text);
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		const tip = async (name: string): Promise<string | null> => content(page).locator(".sf-link", { hasText: name }).first().getAttribute("title");
		await expect(content(page).locator(".sf-link-live")).toHaveCount(2); // Sam and the archived Retired
		await expect(content(page).locator(".sf-link-live", { hasText: "Sam" })).toHaveAttribute("data-codex-path", "Codex/Sam.md");
		expect(await tip("Ch")).toBe("a chapter, not a Codex entry");
		expect(await tip("Idea")).toBe("not a Codex entry");
		expect(await tip("Gone")).toBe("no such entry");
		expect(await tip("Web")).toBe("the app doesn't open web links");
		expect(await tip("Old")).toBe("an archived entry: it opens read-only");
		for (const name of ["Ch", "Idea", "Gone", "Web"]) await expect(content(page).locator(".sf-link-muted", { hasText: name })).toHaveCount(1);
	});

	test("⌘-click opens a live link in the context panel; a plain click only places the caret; a muted link does nothing", async ({ page }) => {
		await open(page, "A [Sam](../../Codex/Sam.md) and [Ch](ch-a2.md).\n\nend\n");
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		expect(await page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBeNull();
		await content(page).locator(".sf-link-live", { hasText: "Sam" }).click();
		expect(await page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBeNull(); // a plain click
		await content(page).locator(".sf-link-live", { hasText: "Sam" }).click({ modifiers: ["ControlOrMeta"] });
		await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBe("Codex/Sam.md");
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await content(page).locator(".sf-link-muted", { hasText: "Ch" }).click({ modifiers: ["ControlOrMeta"] });
		expect(await page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBe("Codex/Sam.md"); // unchanged
	});

	test("⌘-Return: opens a live link, does nothing on a muted one, and keeps its own meaning (a blank line) elsewhere", async ({ page }) => {
		await open(page, "A [Sam](../../Codex/Sam.md) and [Ch](ch-a2.md).\n\nplain words\n");
		await content(page).click();
		const caretIn = async (needle: string): Promise<void> => {
			await page.keyboard.press(`${MOD}+ArrowUp`);
			const n = (await content(page).locator(".cm-line").first().textContent())!.indexOf(needle) + 1;
			await page.keyboard.press("Home");
			for (let i = 0; i < n; i++) await page.keyboard.press("ArrowRight");
		};
		await caretIn("Sam]"); // inside the link's text: the first line is the caret's, so its markers show
		await page.keyboard.press(`${MOD}+Enter`);
		await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBe("Codex/Sam.md");
		const before = await docOf(page);
		await page.locator(".sf-slot--centre .cm-content").click();
		await caretIn("Ch]");
		await page.keyboard.press(`${MOD}+Enter`);
		expect(await docOf(page)).toBe(before); // muted: nothing happens, no blank line
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press(`${MOD}+Enter`);
		expect((await docOf(page)).split("\n").length).toBe(before.split("\n").length + 1); // elsewhere: the usual blank line
	});

	test("a link in a Codex note, followed, replaces the note in the context panel; on the library side it opens the Codex tab", async ({ page }) => {
		await open(page, "x\n");
		await page.evaluate(async () => void (await window.__preview.touch("Codex/Harbour.md", "See [Sam](Sam.md).\n")));
		await page.evaluate(() => window.__app.editors!.open("lore", "Codex/Harbour.md"));
		const note = page.locator(".sf-slot--lore .cm-content");
		await expect(note.locator(".sf-link-live", { hasText: "Sam" })).toBeVisible();
		await note.locator(".sf-link-live", { hasText: "Sam" }).click({ modifiers: ["ControlOrMeta"] });
		await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBe("Codex/Sam.md");
	});

	test("a link in a field is relative to the file the field is stored in, and on the library side it is dressed as a link but inert (Tweaks 1 part 2, §2)", async ({ page }) => {
		await open(page, "x\n");
		await toNovelTab(page);
		const box = page.getByRole("textbox", { name: "Plot note for Chapter 1" });
		await box.click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("Enter");
		await page.keyboard.type("[[sam");
		await expect(popup(page).getByRole("option", { name: /Sam/ })).toBeVisible();
		await page.keyboard.press("Tab");
		await expect(box.locator(".sf-link", { hasText: "Sam" })).toHaveCount(1);
		await expect(box.locator(".sf-link-live, .sf-link-muted")).toHaveCount(0); // dressed as a link, not live, no tooltip
		await expect(box.locator(".cm-line").last()).toHaveText("[Sam](../Codex/Sam.md)"); // the plot note is stored in the novel file: one level up (the caret's line shows the whole link)
		await box.locator(".sf-link").first().click({ modifiers: ["ControlOrMeta"] });
		await page.keyboard.press(`${MOD}+Enter`);
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => window.__app.editors!.pathIn("codex"))).toBeFalsy(); // nothing opened
		await expect(page.getByRole("tab", { name: "novel", selected: true })).toBeVisible();
	});
});

test.describe("the chapter length bar (decision 160)", () => {
	const strip = (page: Page) => page.locator(".sf-length-strip");
	const words = (n: number): string => Array.from({ length: n }, () => "w").join(" ") + "\n";
	/** Opens with the chapter holding `n` words (the book's planned chapter length is 2,500 in the fixture). */
	async function openWith(page: Page, n: number): Promise<void> {
		await openPreview(page);
		await page.evaluate(async ({ path, text }) => void (await window.__preview.touch(path, text)), { path: CHAPTER, text: words(n) });
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(page.locator(".sf-slot--centre .cm-content")).toBeVisible();
	}
	const box = async (loc: Locator) => (await loc.boundingBox())!;

	test("a picture only: no text, no tooltip, a name for the screen reader; 12px rail, 8px bar 2px in; rail and box share their edges", async ({ page }) => {
		await openWith(page, 1250);
		await expect(strip(page)).toBeVisible();
		expect(await strip(page).evaluate((e) => e.textContent)).toBe("");
		await expect(strip(page)).toHaveAttribute("role", "img");
		await expect(strip(page)).toHaveAttribute("aria-label", "Chapter length: 1,250 of 2,500 words");
		// a visible bar's name is never the planned-length field's: an exact lookup of "Chapter Length" finds nothing here
		await expect(page.getByLabel("Chapter Length", { exact: true })).toHaveCount(0);
		expect(await strip(page).getAttribute("title")).toBeNull();
		const rail = await box(strip(page).locator(".sf-length-rail"));
		const fill = await box(strip(page).locator(".sf-length-fill"));
		const chapterBox = await box(page.locator(".sf-slot--centre"));
		expect(rail.height).toBe(12);
		expect(fill.height).toBe(8);
		expect(fill.x - rail.x).toBe(2);
		expect(fill.y - rail.y).toBe(2);
		expect(Math.abs(rail.x - chapterBox.x)).toBeLessThan(1);
		expect(Math.abs(rail.x + rail.width - (chapterBox.x + chapterBox.width))).toBeLessThan(1);
		// centred in the 76px strip under the box: 32px above and below the rail
		const s = await box(strip(page));
		expect(rail.y - s.y).toBe(32);
		expect(s.y + s.height - (rail.y + rail.height)).toBe(32);
		// same radius on both: the bar's is its own half-height, the rail's its own
		expect(await strip(page).locator(".sf-length-rail").evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("6px");
		expect(await strip(page).locator(".sf-length-fill").evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("4px");
	});

	test("its geometry: rail only with no words; half; at the target; 150% shortens the rail; beyond 300% the rail is a third and the end is cut", async ({ page }) => {
		const geometry = async () => {
			const rail = await box(strip(page).locator(".sf-length-rail"));
			const s = await box(strip(page));
			const fillEl = strip(page).locator(".sf-length-fill");
			const fill = (await fillEl.count()) && (await fillEl.isVisible()) ? await box(fillEl) : null;
			return { W: s.width, rail: rail.width, fill: fill?.width ?? null, fillRight: fill ? fill.x + fill.width - s.x : null, cut: await fillEl.evaluate((e) => e.classList.contains("sf-length-fill--cut")) };
		};
		await openWith(page, 0);
		let g = await geometry();
		expect(g.fill).toBeNull(); // no words: the rail only (decision 153)
		expect(g.rail).toBe(g.W);
		await openWith(page, 1250);
		g = await geometry();
		expect(g.fill!).toBeCloseTo((g.W - 4) * 0.5, 0);
		expect(g.rail).toBe(g.W);
		await openWith(page, 2500);
		g = await geometry();
		expect(g.fill!).toBeCloseTo(g.W - 4, 0); // meets the rail's inner edge
		await openWith(page, 3750);
		g = await geometry();
		expect(g.rail).toBeCloseTo((g.W - 2) / 1.5 + 4, 0); // overrun shortens the rail (its 2px padding is not scaled, as the data bars' is not)
		expect(g.fillRight!).toBeCloseTo(g.W, 0); // and the bar runs on to the row's end
		expect(g.cut).toBe(false);
		await openWith(page, 9000);
		g = await geometry();
		expect(g.rail).toBeCloseTo((g.W - 2) / 3 + 4, 0); // never under a third (the padding apart)
		expect(g.fillRight!).toBeCloseTo(g.W, 0);
		expect(g.cut).toBe(true); // a shape, not colour alone
	});

	test("any words draw at least 3px", async ({ page }) => {
		await openWith(page, 1);
		expect((await box(strip(page).locator(".sf-length-fill"))).width).toBeGreaterThanOrEqual(3);
	});

	test("nothing is shown with no chapter length set, or on the library side", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(async () => {
			const novel = await window.__preview.read("_story-library/novel-aaa.md");
			await window.__preview.touch("_story-library/novel-aaa.md", novel.replace(/planned-chapter-length: \d+\n/, ""));
		});
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(strip(page)).toBeHidden();
		await openWith(page, 100);
		await expect(strip(page)).toBeVisible();
		await flipFace(page);
		await expect(strip(page)).toBeHidden();
	});

	test("it follows typing live, from the project's own count", async ({ page }) => {
		await openWith(page, 10);
		const before = (await box(strip(page).locator(".sf-length-fill"))).width;
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type(" more words typed right now to make the chapter longer than it was before");
		await expect.poll(async () => (await box(strip(page).locator(".sf-length-fill"))).width).toBeGreaterThan(before);
		await expect(strip(page)).toHaveAttribute("aria-label", /^Chapter length: 2\d of 2,500 words$/);
	});

	test("its colour is the data colour until the author chooses one of the five", async ({ page }) => {
		const FILL: Record<string, string> = { yellow: "rgb(219, 188, 127)", aqua: "rgb(131, 192, 146)", blue: "rgb(127, 187, 179)", orange: "rgb(230, 152, 117)", purple: "rgb(214, 153, 182)" };
		const colour = (): Promise<string> => strip(page).locator(".sf-length-fill").evaluate((e) => getComputedStyle(e).backgroundColor);
		const rail = (): Promise<string> => strip(page).locator(".sf-length-rail").evaluate((e) => getComputedStyle(e).backgroundColor);
		const set = (text: string) => page.evaluate(async ({ path, text }) => {
			await window.__preview.touch(path, text);
			window.__preview.emit("watch-batch", { paths: [path], rescan: false });
		}, { path: SETTINGS, text });
		await openWith(page, 100);
		expect(await colour()).toBe(FILL.blue); // the default data colour
		expect(await rail()).toBe("rgb(51, 60, 67)"); // the working background, bg0
		await set("---\nformat-version: 1\ndata-colour: orange\n---\n");
		await expect.poll(colour).toBe(FILL.orange); // follows the data colour while nothing is chosen
		for (const [name, rgb] of Object.entries(FILL)) {
			await set(`---\nformat-version: 1\ndata-colour: orange\nchapter-bar-colour: ${name}\n---\n`);
			await expect.poll(colour).toBe(rgb);
		}
		for (const bad of ["red", "green", "grey"]) {
			await set(`---\nformat-version: 1\ndata-colour: orange\nchapter-bar-colour: ${bad}\n---\n`);
			await expect.poll(colour).toBe(FILL.orange); // an excluded or unknown value draws the default (the data colour)
		}
		expect(await onDisk(page, SETTINGS)).toContain("chapter-bar-colour: grey"); // and is never rewritten
	});

	test("Settings ▸ Appearance ▸ storytelling mode has its swatches, the data colour's five and 'same as the data bars'", async ({ page }) => {
		await openWith(page, 100);
		await openSettingsDialog(page);
		await page.getByRole("dialog").getByRole("tab", { name: "appearance", exact: true }).click();
		await page.getByRole("dialog").getByRole("tab", { name: "storytelling mode", exact: true }).click();
		const group = page.getByRole("radiogroup", { name: "chapter length bar colour" });
		await expect(group.getByRole("radio")).toHaveCount(6);
		await expect(group.getByRole("radio", { checked: true })).toHaveAccessibleName("Same as the data bars");
		await group.getByRole("radio", { name: "Purple" }).click();
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p).catch(() => ""), SETTINGS)).toContain("chapter-bar-colour: purple");
		await expect(group.getByRole("radio", { checked: true })).toHaveAccessibleName("Purple");
	});
});
