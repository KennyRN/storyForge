import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Fix 5, commit 2: the stored panel widths, the same-width switch, the unit and narrowing for display (decisions 76 and 77).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const resize = async (page: Page, width: number) => {
	await page.setViewportSize({ width, height: 800 });
	await page.waitForTimeout(150);
};
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1); // percent is kept to a tenth: about a pixel
const read = (page: Page) => page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md").catch(() => null));
const widths = (page: Page) =>
	page.evaluate(() => ({
		left: Math.round(document.querySelector(".sf-left")!.getBoundingClientRect().width),
		lore: Math.round(document.querySelector(".sf-slot--lore")!.getBoundingClientRect().width),
	}));
const stored = (page: Page) => page.evaluate(() => { const n = (window.__app as any).nav; return { story: n.storyWidth, library: n.libraryWidth, lore: n.loreWidth, unit: n.widthUnit, linked: n.widthsLinked }; });
const leftBar = (page: Page) => page.getByRole("separator", { name: "Resize the left panel" });
const loreBar = (page: Page) => page.getByRole("separator", { name: "Resize the context panel" });

test.describe("panel widths", () => {
	test("a project with nothing stored opens linked, in percent, all three at the left panel's old width", async ({ page }) => {
		await openProject(page);
		const s = await stored(page);
		expect(s).toMatchObject({ unit: "percent", linked: true });
		expect(s.story).toBe(s.library);
		expect(s.story).toBe(s.lore);
		const w = await widths(page);
		expect(w.left).toBe(w.lore);
		expect(Math.abs(w.left - 288)).toBeLessThanOrEqual(1);
	});

	test("while linked, keys on either divider move all three, and flipping keeps them equal", async ({ page }) => {
		await openProject(page);
		const before = await widths(page);
		await leftBar(page).focus();
		await page.keyboard.press("ArrowRight");
		let w = await widths(page);
		near(w.left, before.left + 16);
		expect(w.lore).toBe(w.left);
		await loreBar(page).focus();
		await page.keyboard.press("ArrowLeft"); // the context panel grows leftwards: ← widens it
		w = await widths(page);
		near(w.lore, before.left + 32);
		await page.getByRole("button", { name: "Flip side" }).click();
		w = await widths(page);
		expect(w.left).toBe(w.lore);
		const s = await stored(page);
		expect(new Set([s.story, s.library, s.lore]).size).toBe(1);
	});

	test("unlinked, each side's left panel and the context panel change on their own", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => (window.__app as any).setWidthsLinked(false));
		const before = await widths(page);
		await leftBar(page).focus();
		await page.keyboard.press("ArrowRight");
		let w = await widths(page);
		near(w.left, before.left + 16);
		expect(w.lore).toBe(before.lore);
		await page.getByRole("button", { name: "Flip side" }).click();
		w = await widths(page);
		near(w.left, before.left); // the library side still has its own
		await page.getByRole("button", { name: "Flip side" }).click();
		near((await widths(page)).left, before.left + 16);
		// turning it back on takes the shown side's left width
		await page.evaluate(() => (window.__app as any).setWidthsLinked(true));
		const w2 = await widths(page);
		expect(w2.lore).toBe(w2.left);
	});

	test("changing the unit moves nothing; pixels hold in a resized window and percent scales", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => (window.__app as any).setWidthUnit("px"));
		const before = await widths(page);
		await resize(page, 1500);
		expect(await widths(page)).toEqual(before);
		await page.evaluate(() => (window.__app as any).setWidthUnit("percent"));
		expect(Math.abs((await widths(page)).left - before.left)).toBeLessThanOrEqual(1);
		await resize(page, 1000);
		const small = await widths(page);
		expect(small.left).toBeLessThan(before.left);
	});

	test("a small window narrows the panels for display only; widening gives them back", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => (window.__app as any).setWidthUnit("px"));
		await page.evaluate(() => { const a = window.__app as any; a.setWidthsLinked(false); a.commitTypedWidth("lore", 400); });
		const set = await stored(page);
		await resize(page, 900);
		const w = await widths(page);
		expect(w.lore).toBeLessThan(400);
		expect(await stored(page)).toEqual(set);
		const centre = await page.evaluate(() => Math.round(document.querySelector(".sf-centre-wrap")!.getBoundingClientRect().width));
		expect(centre).toBeGreaterThanOrEqual(358);
		await resize(page, 1600);
		expect((await widths(page)).lore).toBe(400);
	});

	test("a hidden context panel keeps its width", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => (window.__app as any).setWidthsLinked(false));
		const set = await stored(page);
		const before = await widths(page);
		await page.evaluate(() => (window.__app as any).toggleLoreSlot());
		await page.evaluate(() => (window.__app as any).toggleLoreSlot());
		expect(await stored(page)).toEqual(set);
		expect((await widths(page)).lore).toBe(before.lore);
	});

	test("typed figures are refused outside the limits and change nothing", async ({ page }) => {
		await openProject(page);
		const set = await stored(page);
		const bad = await page.evaluate(() => (window.__app as any).commitTypedWidth("shared", 1));
		expect(bad.ok).toBe(false);
		expect(await stored(page)).toEqual(set);
		const good = await page.evaluate(() => (window.__app as any).commitTypedWidth("shared", 25));
		expect(good.ok).toBe(true);
		const w = await widths(page);
		expect(w.lore).toBe(w.left);
	});

	test("none of it writes the project folder", async ({ page }) => {
		await openProject(page);
		const before = await page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md").catch(() => null));
		await leftBar(page).focus();
		await page.keyboard.press("ArrowRight");
		await page.evaluate(() => { const a = window.__app as any; a.setWidthUnit("px"); a.setWidthsLinked(false); });
		await page.waitForTimeout(700);
		expect(await read(page)).toBe(before);
	});
});
