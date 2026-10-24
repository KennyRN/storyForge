import { expect, test, type Page } from "@playwright/test";
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

const novelOverview = (page: Page) => page.getByRole("region", { name: "Novel overview" });
const BOOK_A = "_story-library/novel-aaa.md";
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

	test("the bar's tooltip shows on hover", async ({ page }) => {
		const bar = novelOverview(page).locator(".sf-card .sf-bar").first();
		await expect(bar).toHaveAttribute("aria-label", /\d/);
		await bar.hover();
		await expect(page.getByRole("tooltip")).toBeVisible();
	});
});
