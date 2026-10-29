import { expect, test, type Locator, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { openPreview, shot } from "./helpers";

function tree(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) tree(full, base, out);
		else out[path.relative(base, full)] = readFileSync(full).toString("base64");
	}
	return out;
}

async function openProject(page: Page): Promise<string> {
	const { root } = await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	return root;
}
const flip = (page: Page) => page.getByRole("button", { name: "Flip side" }).click();
const tab = (page: Page, name: string) => page.getByRole("tab", { name });
/** The text of a field editor (plot note, synopsis, description) as the lines it shows: they are small CodeMirror editors (decision 47). */
const fieldText = (box: Locator): Promise<string> => box.evaluate((el) => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"));
const plotField = (page: Page, chapter = "ch-a1.md") => page.locator(`.sf-card[data-chapter="${chapter}"] .sf-note-field .cm-content`);
const overview = (page: Page) => page.getByRole("region", { name: "Series overview" });

test.describe("the series overview", () => {
	test("the series tab covers the workspace; the longest novel's bar is full and the editor beneath is inert", async ({ page }) => {
		await openProject(page);
		await flip(page);
		await tab(page, "series").click();
		await expect(overview(page)).toBeVisible();
		await expect(page.locator(".sf-slot--centre")).toHaveAttribute("inert", "");
		const widths = await overview(page).locator(".sf-overview-row:not(.sf-overview-row--unplaced) .sf-bar-fill").evaluateAll((els) => els.map((e) => (e as HTMLElement).style.width));
		expect(widths.length).toBeGreaterThan(0);
		expect(widths).toContain("100%");
		await expect(overview(page).locator(".sf-overview-row--unplaced")).not.toHaveCount(0);
		await expect(overview(page).locator(".sf-overview-row--unplaced .sf-bar")).toHaveCount(0);
		await shot(page, "numbers-series-overview");
	});

	test("the series description and a novel's synopsis are written as sections, changing nothing else in the file", async ({ page }) => {
		await openProject(page);
		await flip(page);
		await tab(page, "series").click();
		const before = await page.evaluate((f) => window.__preview.read(f), "_story-library/series.md");
		const description = overview(page).getByRole("textbox", { name: "Series description" });
		await expect.poll(() => fieldText(description)).toBe("A synthetic series used only for tests.");
		await description.click();
		await description.press("Meta+a");
		await description.pressSequentially("Five books of lanterns.");
		await overview(page).locator(".sf-overview-title").click();
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), "_story-library/series.md")).toBe(before.replace("A synthetic series used only for tests.", "Five books of lanterns."));
		const novelBefore = await page.evaluate((f) => window.__preview.read(f), "_story-library/novel-aaa.md");
		const synopsis = overview(page).getByRole("textbox", { name: /^Synopsis of / }).first();
		await synopsis.click();
		await synopsis.pressSequentially("Jane finds the harbour.");
		await overview(page).locator(".sf-overview-title").click();
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), "_story-library/novel-aaa.md")).toBe(`${novelBefore.trimEnd()}\n\n## Synopsis\nJane finds the harbour.\n`);
	});

	test("a synopsis whose heading appears twice shows read-only, with a notice", async ({ page }) => {
		await openProject(page);
		const path = "_story-library/novel-aaa.md";
		const text = await page.evaluate((f) => window.__preview.read(f), path);
		await outside(page, path, `${text.trimEnd()}\n\n## Synopsis\nOne\n\n## Synopsis\nTwo\n`);
		await flip(page);
		await tab(page, "series").click();
		const field = overview(page).getByRole("textbox", { name: /^Synopsis of / }).first();
		await expect(field).toHaveAttribute("aria-readonly", "true");
		await expect(page.getByRole("alert")).toContainText("appears more than once");
		// Read-only, but still there to select and copy: typing changes nothing.
		const shown = await fieldText(field);
		await field.click();
		await field.pressSequentially("x");
		expect(await fieldText(field)).toBe(shown);
	});

	test("under an overview the editor takes no focus, no shortcuts and no menu undo, and saving carries on", async ({ page }) => {
		await openProject(page);
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press("End");
		await page.keyboard.type(" under");
		const text = () => page.evaluate(() => (window.__app.editors as any).slots.centre.occupant.mounted.view.state.doc.toString() as string);
		const typed = await text();
		await flip(page);
		await tab(page, "series").click();
		await expect(overview(page)).toBeVisible();
		await expect(page.locator(".sf-slot--centre")).toHaveAttribute("inert", "");
		// No focus, and nothing is exposed to assistive technology (inert removes it from the accessibility tree).
		await content.focus({ timeout: 500 }).catch(() => undefined);
		expect(await page.evaluate(() => !!document.activeElement?.closest(".sf-slot--centre"))).toBe(false);
		// Find, bold and undo do nothing to it.
		// A bare ⌘Z and ⇧⌘Z reach WebKit's own undo in this preview; the covered editor refuses them itself.
		await page.keyboard.press("Meta+z");
		expect(await text(), "bare ⌘Z").toBe(typed);
		await page.keyboard.press("Meta+Shift+z");
		expect(await text(), "bare ⇧⌘Z").toBe(typed);
		// A change from any other source (here a programmatic edit standing in for a drop or a dictated word) is refused too.
		await page.evaluate(() => (window.__app.editors as any).slots.centre.occupant.mounted.view.dispatch({ changes: { from: 0, insert: "SNEAK" }, userEvent: "input.type" }));
		expect(await text(), "a change from another source").toBe(typed);
		// Undo and Redo are the app's menu items, which act on the focused editor only. (A bare ⌘Z keypress in this
		// browser preview reaches WebKit's own undo, which the real app's menu consumes; so the menu route is tested.)
		expect(await page.evaluate(() => [(window.__app.editors as any).undo(), (window.__app.editors as any).redo()])).toEqual([false, false]);
		expect(await text(), "undo and redo").toBe(typed);
		for (const combo of ["Meta+b", "Meta+i"]) {
			await page.keyboard.press(combo);
			expect(await text(), combo).toBe(typed);
		}
		await page.keyboard.press("Meta+f");
		await expect(page.locator(".sf-slot--centre .cm-search")).toHaveCount(0);
		// Saving carries on underneath.
		await expect.poll(() => page.evaluate(() => window.__preview.read("_story-library/aaa/ch-a1.md"))).toContain(" under");
	});

	test("clicking a novel shows the novel tab; opening a chapter shows it; the tab again brings the overview back", async ({ page }) => {
		await openProject(page);
		await flip(page);
		await tab(page, "series").click();
		await overview(page).locator(".sf-overview-name").first().click();
		await expect(tab(page, "novel")).toHaveAttribute("aria-selected", "true");
		await expect(overview(page)).toBeHidden();
		await tab(page, "series").click();
		await expect(overview(page)).toBeVisible();
		await page.evaluate(() => void window.__app.openChapter(window.__app.nav.book!, window.__app.nav.chapter!));
		await expect(overview(page)).toBeHidden();
		await expect(page.locator(".sf-slot--centre")).not.toHaveAttribute("inert", "");
		await tab(page, "series").click();
		await expect(overview(page)).toBeVisible();
	});

	test("the storytelling face always shows the chapter, and the open chapter survives the flip", async ({ page }) => {
		await openProject(page);
		await flip(page);
		await tab(page, "series").click();
		await expect(overview(page)).toBeVisible();
		await flip(page);
		await expect(overview(page)).toBeHidden();
		await expect(page.locator(".sf-slot--centre .cm-content")).toBeVisible();
		await flip(page);
		await expect(overview(page)).toBeVisible();
	});

	test("opening it writes nothing", async ({ page }) => {
		const root = await openProject(page);
		const before = tree(root);
		await flip(page);
		await tab(page, "series").click();
		await expect(overview(page)).toBeVisible();
		const after = tree(root);
		expect(after).toEqual(before);
	});
});

const outside = async (page: Page, path: string, text: string) => {
	await page.evaluate(([p, t]) => window.__preview.touch(p, t), [path, text]);
	await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), path);
};
const novelOverview = (page: Page) => page.getByRole("region", { name: "Novel overview" });
const BOOK_A = "_story-library/novel-aaa.md";
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const TINY_GIF = "R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const onDisk = (page: Page, p: string) => page.evaluate((x) => window.__preview.read(x), p);

test.describe("the novel overview", () => {
	test.beforeEach(async ({ page }) => {
		await openProject(page);
		await flip(page);
		await tab(page, "novel").click();
		await expect(novelOverview(page)).toBeVisible();
	});

	test("segments only for chapters with words; ghost dividers with both plans; seven structure marks", async ({ page }) => {
		const o = novelOverview(page);
		const withWords = await o.locator(".sf-card .sf-bar:not(.sf-bar--sliver)").count();
		await expect(o.locator(".sf-progress-seg")).toHaveCount(withWords);
		expect(withWords).toBeGreaterThan(0);
		expect(await o.locator(".sf-progress-ghost").count()).toBeGreaterThan(0);
		await expect(o.locator(".sf-structure-mark")).toHaveCount(7);
		await expect(o.getByRole("heading", { level: 2 })).toContainText("Book 1:");
		await shot(page, "numbers-novel-overview");
	});

	test("ghost dividers go when the novel is at its plan", async ({ page }) => {
		const o = novelOverview(page);
		await o.getByRole("button", { name: /of 80,000/ }).click();
		await page.keyboard.type("1");
		await page.keyboard.press("Enter");
		await expect.poll(async () => /planned-novel-length: 1\b/.test(await onDisk(page, BOOK_A))).toBe(true);
		await expect(o.locator(".sf-progress-ghost")).toHaveCount(0);
	});

	test("a chapter past its plan shows orange beyond the marker; under it shows the dashed marker", async ({ page }) => {
		const o = novelOverview(page);
		await expect(o.locator(".sf-bar--under .sf-bar-marker").first()).toBeAttached();
		await o.getByRole("button", { name: "2,500" }).click();
		await page.keyboard.type("1");
		await page.keyboard.press("Enter");
		await expect(o.locator(".sf-bar--over .sf-bar-over").first()).toBeAttached();
		await expect(o.locator(".sf-bar--over .sf-bar-notch").first()).toBeAttached();
		await expect(o.locator(".sf-bar-marker")).toHaveCount(0);
	});

	test("the planned length edited in the overview shows in the left pane", async ({ page }) => {
		await novelOverview(page).getByRole("button", { name: /of 80,000/ }).click();
		await page.keyboard.type("90000");
		await page.keyboard.press("Enter");
		await expect(page.locator(".sf-left .sf-meta-row", { hasText: "Novel Length" })).toContainText("of 90,000");
	});

	test("clicking a bar opens the chapter; the tab again brings the overview back", async ({ page }) => {
		await novelOverview(page).locator(".sf-card .sf-bar").first().click();
		await expect(novelOverview(page)).toBeHidden();
		await expect(page.locator(".sf-slot--centre .cm-content")).toBeVisible();
		await tab(page, "novel").click();
		await expect(novelOverview(page)).toBeVisible();
	});

	test("screenshots for the report: the three sizes and the picker", async ({ page }) => {
		const o = novelOverview(page);
		const cards = o.locator(".sf-card");
		await cards.nth(0).locator(".sf-card-chevron").click();
		await expect(cards.nth(0)).toHaveAttribute("data-tier", "collapsed");
		await cards.nth(0).locator(".sf-card-chevron").click();
		await expect(cards.nth(0)).toHaveAttribute("data-tier", "bar");
		await cards.nth(1).locator(".sf-card-chevron").click(); // collapsed
		await expect(cards.nth(1)).toHaveAttribute("data-tier", "collapsed");
		await expect(cards.nth(2)).toHaveAttribute("data-tier", "extended");
		await shot(page, "shape-novel-overview-mixed");
		await o.locator('.sf-size-option[data-size="extended"]').click();
		await shot(page, "shape-novel-overview-extended");
		await o.locator('.sf-card[data-chapter="ch-a5.md"]').getByRole("button", { name: /^Choose pov/i }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await shot(page, "shape-picker");
	});

	test("the chevron cycles one card's size; the size control sets them all and shows none when mixed; the bar still opens the chapter", async ({ page }) => {
		const o = novelOverview(page);
		const card = o.locator(".sf-card").first();
		const chevron = card.locator(".sf-card-chevron");
		await expect(card).toHaveAttribute("data-tier", "extended");
		await chevron.click();
		await expect(card).toHaveAttribute("data-tier", "collapsed");
		await chevron.click();
		await expect(card).toHaveAttribute("data-tier", "bar");
		// Mixed: no size is selected.
		await expect(o.locator('.sf-size-option[aria-checked="true"]')).toHaveCount(0);
		await o.locator('.sf-size-option[data-size="collapsed"]').click();
		const count = await o.locator(".sf-card").count();
		await expect(o.locator('.sf-card[data-tier="collapsed"]')).toHaveCount(count);
		await expect(o.locator('.sf-size-option[data-size="collapsed"]')).toHaveAttribute("aria-checked", "true");
		await o.locator('.sf-size-option[data-size="extended"]').click();
		await expect(o.locator('.sf-card[data-tier="extended"]')).toHaveCount(count);
		await o.locator(".sf-card .sf-bar").first().click();
		await expect(novelOverview(page)).toHaveCount(0);
	});

	test("the tooltip shows the word count at once, the plot note's first paragraph joins it, and a changed note replaces it", async ({ page }) => {
		const card = novelOverview(page).locator('.sf-card[data-chapter="ch-a1.md"] .sf-bar');
		const tip = page.getByRole("tooltip");
		const hover = async () => {
			await page.mouse.move(0, 0);
			await expect(tip).toHaveCount(0);
			await card.hover();
			await expect(tip).toBeVisible();
		};
		await hover();
		await expect(tip).toHaveText(/^[\d,.]+/); // the count is there at once, whatever the plot read has done
		// The note is read on the first hover and cached: a later hover shows it.
		await expect.poll(async () => {
			await hover();
			return tip.textContent();
		}).toMatch(/: Jane reaches the harbour at dawn\.$/);
		// The next index change clears the cache; the new first paragraph is read on the next hover.
		const novel = await page.evaluate((f) => window.__preview.read(f), BOOK_A);
		await outside(page, BOOK_A, novel.replace("plot: Jane reaches the harbour at dawn.", "plot: The tide turns before breakfast.\n"));
		await expect.poll(async () => {
			await hover();
			return tip.textContent();
		}).toMatch(/: The tide turns before breakfast\.$/);
	});

	test("a plot note is committed when it loses focus, keeping a leading space and further lines", async ({ page }) => {
		const field = plotField(page);
		await expect.poll(() => fieldText(field)).toBe("Jane reaches the harbour at dawn.");
		await field.click();
		await field.press("Meta+a");
		await field.pressSequentially("  Jane leaves.\nThen the tide: turns.");
		// Nothing is written while typing.
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).not.toContain("Jane leaves.");
		await novelOverview(page).locator(".sf-overview-title").click();
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("Jane leaves.");
		await expect.poll(() => fieldText(field)).toBe("  Jane leaves.\nThen the tide: turns.");
	});

	test("a plot note is a multi-line text box: announced as one, Return makes a plain new line, Tab leaves it, spellcheck is on", async ({ page }) => {
		const field = page.getByRole("textbox", { name: "Plot note for Chapter 1" });
		await expect(field).toHaveAttribute("aria-multiline", "true");
		await expect(field).toHaveAttribute("spellcheck", "true");
		await expect(page.getByRole("textbox", { name: "Plot note for Chapter 2" })).toBeVisible();
		await expect(page.locator('.sf-card[data-chapter="ch-a5.md"] .sf-note-field .cm-placeholder')).toHaveText("Plot note");
		await field.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("  indented");
		await page.keyboard.press("Enter");
		await page.keyboard.type("next");
		expect(await fieldText(field)).toBe("  indented\nnext"); // no auto-indent: the new line starts at the left
		await page.keyboard.press("Tab");
		expect(await page.evaluate(() => !!document.activeElement?.closest(".sf-note-field"))).toBe(false); // no Tab trap
	});

	test("the typing aids work in a field: curly quotes and dashes, one ⌘Z gives back what was typed, and they are saved", async ({ page }) => {
		const field = plotField(page, "ch-a2.md");
		await field.click();
		await page.keyboard.type("It's - 'twas...");
		expect(await fieldText(field)).toBe("It’s – ’twas…");
		await page.keyboard.press("ControlOrMeta+z");
		expect(await fieldText(field)).toBe("It’s – ’twas...");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		expect(await fieldText(field)).toBe("It’s – ’twas…");
		await novelOverview(page).locator(".sf-overview-title").click();
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("It’s – ’twas…");
	});

	test("Edit ▸ Undo and Redo reach the focused field's own history", async ({ page }) => {
		const field = plotField(page);
		await field.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" And more.");
		expect(await fieldText(field)).toBe("Jane reaches the harbour at dawn. And more.");
		await page.evaluate(() => window.__preview.emit("menu", "undo"));
		expect(await fieldText(field)).toBe("Jane reaches the harbour at dawn.");
		await page.evaluate(() => window.__preview.emit("menu", "redo"));
		expect(await fieldText(field)).toBe("Jane reaches the harbour at dawn. And more.");
	});

	test("a field refreshed from disk starts a new history: ⌘Z can't bring back text that was replaced from outside", async ({ page }) => {
		let field = plotField(page);
		await field.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("Mine.");
		await novelOverview(page).locator(".sf-overview-title").click(); // committed
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("Mine.");
		const novel = await page.evaluate((f) => window.__preview.read(f), BOOK_A);
		await outside(page, BOOK_A, novel.replace("plot: Mine.", "plot: Theirs.\n"));
		field = plotField(page);
		await expect.poll(() => fieldText(field)).toBe("Theirs.");
		await field.click();
		await page.keyboard.press("ControlOrMeta+z");
		expect(await fieldText(field)).toBe("Theirs.");
	});

	test("a plot note still being typed in is committed by a close request", async ({ page }) => {
		const field = plotField(page);
		await field.click();
		await field.press("Meta+a");
		await field.pressSequentially("Typed when the app was told to close.");
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).not.toContain("Typed when the app");
		await page.evaluate(() => window.__preview.emit("close-requested"));
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("Typed when the app was told to close.");
	});

	test("a planned length still being typed in is committed by a close request", async ({ page }) => {
		await novelOverview(page).getByRole("button", { name: "2,500" }).click();
		const input = novelOverview(page).getByRole("textbox", { name: "Chapter Length" });
		await input.fill("3,100");
		await page.evaluate(() => window.__preview.emit("close-requested"));
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("planned-chapter-length: 3100");
	});

	test("a plot note changed on disk while it is being edited is not overwritten: the author's text goes to recovery and a notice says so", async ({ page }) => {
		const field = plotField(page);
		await field.click();
		await field.press("Meta+a");
		await field.pressSequentially("My own words");
		const novel = await page.evaluate((f) => window.__preview.read(f), BOOK_A);
		await outside(page, BOOK_A, novel.replace("plot: Jane reaches the harbour at dawn.", "plot: Somebody else.\n"));
		await novelOverview(page).locator(".sf-overview-title").click();
		await expect(page.getByRole("alert")).toContainText("changed on disk");
		await expect.poll(() => fieldText(field)).toBe("Somebody else.");
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("Somebody else.");
	});

	test("a chapter with no PoV of its own shows the default, muted and labelled, and the default is not written into the chapter", async ({ page }) => {
		const row = novelOverview(page).locator('.sf-card[data-chapter="ch-a5.md"] [data-row="pov"]');
		await expect(row.locator(".sf-ref.is-muted")).toHaveText("Jane");
		await expect(row).toContainText("(default)");
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).not.toMatch(/ch-a5\.md:[\s\S]*pov/);
	});

	test("the PoV picker sets a chapter's PoV, and the default PoV picker sets the default", async ({ page }) => {
		const o = novelOverview(page);
		const row = o.locator('.sf-card[data-chapter="ch-a5.md"] [data-row="pov"]');
		await row.getByRole("button", { name: /Choose pov/i }).click();
		await page.getByRole("dialog").getByLabel("Sam").check();
		await page.getByRole("dialog").getByRole("button", { name: "Choose" }).click();
		await expect(row.locator(".sf-ref")).toHaveText("Sam");
		await expect(row.locator(".sf-ref.is-muted")).toHaveCount(0);
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("Codex%2FSam.md=Sam");
		await o.getByRole("button", { name: "Choose the default PoV" }).click();
		await page.getByRole("dialog").getByLabel("Sam").check();
		await page.getByRole("dialog").getByRole("button", { name: "Choose" }).click();
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("default-pov-path: Codex/Sam.md");
		await expect(o.locator('[data-row="default-pov"] .sf-ref')).toHaveText("Sam");
	});

	test("a reference to a note that is gone is shown as missing, and stays in the file", async ({ page }) => {
		const novel = await page.evaluate((f) => window.__preview.read(f), BOOK_A);
		await outside(page, BOOK_A, novel.replace("v1;Codex%2FJane.md=Jane", "v1;Codex%2FGone.md=Gone"));
		const ref = novelOverview(page).locator('.sf-card[data-chapter="ch-a1.md"] [data-row="pov"] .sf-ref');
		await expect(ref).toHaveText("Gone (missing)");
		await expect(ref).toHaveClass(/is-muted/);
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("Codex%2FGone.md=Gone");
	});

	test("a name in a PoV row opens that note in the workspace, and the overview comes back from its tab", async ({ page }) => {
		await novelOverview(page).locator('.sf-card[data-chapter="ch-a1.md"] [data-row="pov"] .sf-ref').click();
		await expect(novelOverview(page)).toHaveCount(0);
		await tab(page, "novel").click();
		await expect(novelOverview(page)).toBeVisible();
	});

	test("a cover chosen in the native panel is placed by Rust, recorded in the book's details, and the old one is retired", async ({ page }) => {
		const o = novelOverview(page);
		const box = o.locator('[data-cover="book:aaa"]');
		const oldCover = await page.evaluate(() => window.__preview.readBase64("_backstage/storyforge/aaa/cover.png"));
		await page.evaluate((b) => window.__preview.armCover(b), ONE_PIXEL_PNG);
		await box.click();
		await expect(box).toHaveAttribute("data-state", "image");
		expect(await page.evaluate(() => window.__preview.readBase64("_backstage/storyforge/aaa/cover.png"))).toBe(ONE_PIXEL_PNG);
		expect(await page.evaluate(() => window.__preview.readBase64(".trash/_backstage/storyforge/aaa/cover.png"))).toBe(oldCover);
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("cover-image: cover.png");
	});

	test("a cover of another type replaces the old one; a cancelled panel changes nothing", async ({ page }) => {
		const box = novelOverview(page).locator('[data-cover="book:aaa"]');
		const before = await page.evaluate((f) => window.__preview.read(f), BOOK_A);
		await page.evaluate(() => window.__preview.armCover(null));
		await box.click();
		expect(await page.evaluate((f) => window.__preview.read(f), BOOK_A)).toBe(before);
		await page.evaluate((b) => window.__preview.armCover(b), TINY_GIF);
		await box.click();
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).toContain("cover-image: cover.gif");
		await expect(page.evaluate(() => window.__preview.readBase64("_backstage/storyforge/aaa/cover.png"))).rejects.toThrow();
		expect(await page.evaluate(() => window.__preview.readBase64(".trash/_backstage/storyforge/aaa/cover.png"))).not.toBe("");
	});

	test("a file that is not an allowed image is refused with the accepted types named, and the old cover stays", async ({ page }) => {
		const box = novelOverview(page).locator('[data-cover="book:aaa"]');
		const old = await page.evaluate(() => window.__preview.readBase64("_backstage/storyforge/aaa/cover.png"));
		await page.evaluate(() => window.__preview.armCover(btoa("<svg/>")));
		await box.click();
		await expect(page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: "PNG, JPEG, GIF or WebP" })).toBeVisible();
		expect(await page.evaluate(() => window.__preview.readBase64("_backstage/storyforge/aaa/cover.png"))).toBe(old);
	});

	test("a cover that is not a picture the window can show is a placeholder; removing a cover retires its file and clears the key", async ({ page }) => {
		const o = novelOverview(page);
		const box = o.locator('[data-cover="book:aaa"]');
		await expect(box).toHaveAttribute("data-state", "placeholder"); // the fixture's cover is not a real picture
		await expect(box.locator(".sf-cover-placeholder")).toBeVisible();
		// Never silent: a cover that is recorded but can't be drawn says so.
		await expect(page.getByRole("status").filter({ hasText: "could not be shown" })).toBeVisible();
		await o.getByRole("button", { name: /^Remove the cover/ }).click();
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), BOOK_A)).not.toContain("cover-image");
		await expect(page.evaluate(() => window.__preview.readBase64("_backstage/storyforge/aaa/cover.png"))).rejects.toThrow();
		await expect(o.getByRole("button", { name: /^Remove the cover/ })).toHaveCount(0);
	});

	test("the series cover is chosen from the series overview", async ({ page }) => {
		await tab(page, "series").click();
		const box = overview(page).locator('[data-cover="series"]');
		await page.evaluate((b) => window.__preview.armCover(b), ONE_PIXEL_PNG);
		await box.click();
		await expect(box).toHaveAttribute("data-state", "image");
		await shot(page, "shape-series-overview");
		await expect.poll(() => page.evaluate((f) => window.__preview.read(f), "_story-library/series.md")).toContain("cover-image: cover.png");
		expect(await page.evaluate(() => window.__preview.readBase64(".trash/_backstage/storyforge/_series/cover.jpg"))).not.toBe("");
	});

	test("the bar's tooltip shows on hover", async ({ page }) => {
		const bar = novelOverview(page).locator(".sf-card .sf-bar").first();
		await expect(bar).toHaveAttribute("aria-label", /\d/);
		await bar.hover();
		await expect(page.getByRole("tooltip")).toBeVisible();
	});
});

test.describe("a read-only project's overviews", () => {
	test("every cover, picker and field is read-only, and the cover panel never opens", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await flip(page);
		await tab(page, "novel").click();
		const o = novelOverview(page);
		await expect(o.locator('[data-cover="book:aaa"]')).toBeDisabled();
		await expect(o.getByRole("button", { name: /^Remove the cover/ })).toHaveCount(0);
		await expect(o.getByRole("button", { name: "Choose the default PoV" })).toHaveCount(0);
		await expect(o.getByRole("button", { name: /^Choose pov/i })).toHaveCount(0);
		const fields = o.locator(".sf-note-field .cm-content");
		expect(await fields.count()).toBeGreaterThan(0);
		for (const field of await fields.all()) await expect(field).toHaveAttribute("aria-readonly", "true");
		await tab(page, "series").click();
		await expect(overview(page).locator('[data-cover="series"]')).toBeDisabled();
		await expect(overview(page).getByRole("textbox", { name: "Series description" })).toHaveAttribute("aria-readonly", "true");
	});
});

test.describe("the history view", () => {
	const openHistory = async (page: Page) => {
		await page.getByRole("button", { name: /Open the history/ }).click();
		return page.getByRole("dialog", { name: "Word count history" });
	};

	test("shows the totals and a number for every day; clicking a day lists its chapters", async ({ page }) => {
		await openProject(page);
		const dialog = await openHistory(page);
		await expect(dialog.getByText("All novels")).toBeVisible();
		await expect(dialog.getByRole("gridcell", { name: /Tuesday 20 October: 25/ })).toBeVisible();
		await dialog.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		await expect(dialog.locator(".sf-history-chapter")).toHaveCount(1);
		await expect(dialog.locator(".sf-history-chapter")).toContainText("25");
		await expect(dialog.locator(".sf-history-chapter")).toContainText("Chapter 1");
		await shot(page, "numbers-history");
	});

	test("a net-loss day says so and is never trouble-coloured", async ({ page }) => {
		await openProject(page);
		const text = await page.evaluate(() => window.__preview.read("_backstage/storyforge/aaa/wordcount.md"));
		await page.evaluate((t) => window.__preview.touch("_backstage/storyforge/aaa/wordcount.md", t), text.replace("daily:\n", "daily:\n  2026-10-22:\n    net: -30\n    chapters:\n      ch-a1.md: -30\n"));
		const dialog = await openHistory(page);
		const cell = dialog.getByRole("gridcell", { name: /Thursday 22 October: net loss of 30/ });
		await expect(cell).toBeVisible();
		await expect(cell).toHaveClass(/sf-heat--loss-/);
		const [bg, red] = await page.evaluate(() => [getComputedStyle(document.querySelector(".sf-heat--loss-4, .sf-heat--loss-3, .sf-heat--loss-2, .sf-heat--loss-1")!).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue("--purpose-trouble")]);
		expect(bg).not.toBe(red);
	});

	test("opening it writes nothing, and Escape closes it", async ({ page }) => {
		const root = await openProject(page);
		const before = tree(root);
		const dialog = await openHistory(page);
		await expect(dialog).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		expect(tree(root)).toEqual(before);
	});
});

test.describe("live refresh", () => {
	test("an outside edit updates the bars without moving the caret in the editor beneath", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press("End");
		await page.keyboard.type(" kept");
		await expect.poll(() => page.evaluate(() => window.__preview.read("_story-library/aaa/ch-a1.md"))).toContain("kept");
		const head = () => page.evaluate(() => (window.__app.editors as any).slots.centre.occupant.mounted.view.state.selection.main.head as number);
		const before = await head();
		await flip(page);
		await tab(page, "novel").click();
		const bar = novelOverview(page).locator('.sf-card[data-chapter="ch-a2.md"] .sf-bar');
		const label = await bar.getAttribute("aria-label");
		const text = await page.evaluate(() => window.__preview.read("_story-library/aaa/ch-a2.md"));
		await outside(page, "_story-library/aaa/ch-a2.md", `${text.trimEnd()} alpha beta gamma delta epsilon\n`);
		await expect(bar).not.toHaveAttribute("aria-label", label!);
		expect(await head()).toBe(before);
	});

	test("a redraw leaves keyboard focus where it was", async ({ page }) => {
		await openProject(page);
		await flip(page);
		await tab(page, "novel").click();
		const name = novelOverview(page).locator(".sf-card .sf-overview-name").nth(1);
		await name.focus();
		const text = await page.evaluate(() => window.__preview.read("_story-library/aaa/ch-a1.md"));
		await outside(page, "_story-library/aaa/ch-a1.md", `${text.trimEnd()} more words here\n`);
		await page.waitForTimeout(700);
		await expect(novelOverview(page).locator(".sf-card .sf-overview-name").nth(1)).toBeFocused();
	});

	test("the open history view follows an outside change", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: /Open the history/ }).click();
		const dialog = page.getByRole("dialog", { name: "Word count history" });
		await expect(dialog.getByRole("gridcell", { name: /Thursday 22 October: 0/ })).toBeVisible();
		const text = await page.evaluate(() => window.__preview.read("_backstage/storyforge/aaa/wordcount.md"));
		await outside(page, "_backstage/storyforge/aaa/wordcount.md", text.replace("daily:\n", "daily:\n  2026-10-22:\n    net: 77\n    chapters:\n      ch-a1.md: 77\n"));
		await expect(dialog.getByRole("gridcell", { name: /Thursday 22 October: 77/ })).toBeVisible();
	});
});
