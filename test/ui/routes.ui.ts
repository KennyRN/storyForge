import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 19, commit 4 (§1.4): the two routes to writing another novel, and the novel selector on the novel tab.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const nav = (page: Page) => page.evaluate(() => ({ book: window.__app.nav.book, chapter: window.__app.nav.chapter, libraryBook: window.__app.nav.libraryBook }));
const selectorButton = (page: Page) => page.locator(".sf-overview .sf-select-current");
const read = (page: Page, f: string) => page.evaluate((x) => window.__preview.read(x), f);

test.describe("the novel selector on the novel tab", () => {
	test.beforeEach(async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await tab(page, "novel").click();
	});

	test("opens from the novel's name, lists the placed novels only (Tweaks 1, §1.4), and marks the current one", async ({ page }) => {
		await expect(selectorButton(page)).toContainText("Book 1");
		await selectorButton(page).click();
		const rows = page.locator(".sf-overview .sf-select-row");
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0)).toContainText("Book 1");
		await expect(rows.nth(0)).toHaveClass(/is-active/);
		await expect(rows.nth(1)).toContainText("Book 2");
		await expect(page.locator(".sf-overview .sf-select-separator")).toHaveCount(0);
	});

	test("works by keyboard: arrows move, Return chooses, Escape closes; choosing changes the library's novel and never the one being written", async ({ page }) => {
		const before = await nav(page);
		await selectorButton(page).focus();
		await page.keyboard.press("ArrowDown"); // opens the list and moves onto the current novel
		await expect(page.locator(".sf-overview .sf-select-row").nth(0)).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(page.locator(".sf-overview .sf-select-row").nth(1)).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.locator(".sf-overview .sf-select-list")).toHaveCount(0);
		await expect(selectorButton(page)).toBeFocused();
		await page.keyboard.press("Enter");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await expect(selectorButton(page)).toContainText("Book 2");
		expect(await nav(page)).toEqual({ ...before, libraryBook: "bbb" });
		// one library choice, shared by both tabs
		await tab(page, "series").click();
		await expect(page.locator(".sf-forge-pane .sf-row", { hasText: "Book 2" })).toHaveClass(/is-selected/);
	});

	test("a standalone project shows its name as plain text, with no selector", async ({ page }) => {
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nstory-kind: standalone\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await flipFace(page);
		await tab(page, "novel").click();
		await expect(page.locator(".sf-overview .sf-overview-title")).toContainText("Book 1");
		await expect(page.locator(".sf-overview .sf-select-current")).toHaveCount(0);
	});
});

test.describe("the novel tab follows the series tab's choice", () => {
	test.beforeEach(async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await tab(page, "series").click();
		await page.locator(".sf-forge-pane .sf-row", { hasText: "Book 2" }).click();
	});

	test("it shows the chosen novel; until a chapter is clicked its first placed chapter shows (Tweaks 2 §1.8) and what is being written is unchanged", async ({ page }) => {
		await tab(page, "novel").click();
		await expect(selectorButton(page)).toContainText("Book 2");
		await expect(page.locator(".sf-chapter-context .sf-ctx-plot")).toBeVisible();
		await expect(page.locator(".sf-forge-pane .sf-row.is-selected")).toHaveCount(1);
		expect((await nav(page)).book).toBe("aaa");
	});

	test("choosing one of its chapters makes it what is being written, with no text lost; the written novel's text is saved first", async ({ page }) => {
		await tab(page, "novel").click();
		await page.evaluate(() => window.__app.chooseNovel("aaa")); // back to the novel being written, to type in its chapter
		await flipFace(page);
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press("End");
		await page.keyboard.type(" ROUTETEXT");
		await flipFace(page);
		await page.evaluate(() => window.__app.chooseNovel("bbb"));
		await page.locator(".sf-forge-pane .sf-row").first().click();
		await expect.poll(() => nav(page)).toEqual({ book: "bbb", chapter: "ch-b1.md", libraryBook: null });
		await expect.poll(() => read(page, "_story-library/aaa/ch-a1.md")).toContain("ROUTETEXT");
		await expect(page.locator(".sf-chapter-context")).not.toBeEmpty();
	});

	test("the library's novel tab shows the novel being written, and the model's route from the storytelling side resets the choice to it (the novel name there is now a selector, Tweaks 1 part 2, §6.1)", async ({ page }) => {
		await flipFace(page);
		await page.evaluate(() => (window.__app as any).openLibraryTab("novel", { resetChoice: true }));
		await expect(tab(page, "novel")).toHaveAttribute("aria-selected", "true");
		await expect(selectorButton(page)).toContainText("Book 1");
		expect(await nav(page)).toMatchObject({ book: "aaa", libraryBook: "aaa" });
	});
});

test.describe("tell this story", () => {
	test.beforeEach(async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await tab(page, "series").click();
	});

	test("makes the chosen novel the one being written, reopens the last chapter written in it, and opens the novel tab", async ({ page }) => {
		await page.evaluate(() => window.__app.chooseChapter("aaa", "ch-a2.md"));
		await page.evaluate(() => window.__app.chooseChapter("bbb", "ch-b1.md"));
		await page.evaluate(() => window.__app.chooseNovel("aaa"));
		await page.getByRole("button", { name: /^tell this story/ }).click();
		await expect(tab(page, "novel")).toHaveAttribute("aria-selected", "true");
		await expect.poll(() => nav(page)).toEqual({ book: "aaa", chapter: "ch-a2.md", libraryBook: null });
		await expect(page.locator(".sf-chapter-context")).not.toBeEmpty();
	});

	test("with no remembered chapter, or one that no longer exists, it reopens the novel's first placed chapter", async ({ page }) => {
		await page.evaluate(() => { window.__app.nav.lastChapters.bbb = "gone.md"; window.__app.chooseNovel("bbb"); });
		await page.getByRole("button", { name: /^tell this story/ }).click();
		await expect.poll(() => nav(page)).toMatchObject({ book: "bbb", chapter: "ch-b1.md" });
	});

	test("typed text in the chapter being left is saved first, nothing lost", async ({ page }) => {
		await flipFace(page);
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press("End");
		await page.keyboard.type(" WRITENOVELTEXT");
		await flipFace(page);
		await page.evaluate(() => window.__app.chooseNovel("bbb"));
		await page.getByRole("button", { name: /^tell this story/ }).click();
		await expect.poll(() => read(page, "_story-library/aaa/ch-a1.md")).toContain("WRITENOVELTEXT");
	});
});

test("going from the novel tab to the series tab shows the series overview, not a late redraw of the novel's", async ({ page }) => {
	await openProject(page);
	await page.evaluate(() => (window.__app as any).openLibraryTab("novel", { resetChoice: true }));
	await expect(page.getByRole("region", { name: "Novel overview" })).toBeVisible();
	await page.getByRole("tab", { name: "series" }).click();
	await page.waitForTimeout(800); // longer than the overviews' redraw delay
	await expect(page.getByRole("region", { name: "Series overview" }).locator(".sf-overview-title")).toHaveText("The Lantern Cycle");
	await expect(page.locator(".sf-overview .sf-select")).toHaveCount(0);
});
