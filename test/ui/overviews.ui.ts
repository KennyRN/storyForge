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
