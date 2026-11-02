import { expect, test, type Page } from "@playwright/test";
import { openPreview, flipFace } from "./helpers";

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
		await flipFace(page);
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
		await flipFace(page);
		w = await widths(page);
		near(w.left, before.left); // the library side still has its own
		await flipFace(page);
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

	test.describe("in settings", () => {
		const openSettings = async (page: Page) => {
			await page.evaluate(() => window.__preview.emit("menu", "settings")); await page.getByRole("dialog").getByRole("tab", { name: "This Mac", exact: true }).click();
			await expect(page.getByRole("group", { name: "This Mac, this project" }).or(page.locator("section[aria-label='This Mac, this project']"))).toBeVisible();
		};
		const group = (page: Page) => page.locator("section[aria-label='This Mac, this project']");

		test("says plainly that these stay on this Mac, and starts with one figure for all three", async ({ page }) => {
			await openProject(page);
			await openSettings(page);
			await expect(group(page)).toContainText("stay on this Mac, for this project");
			await expect(group(page).getByLabel("Keep the panels the same width")).toBeChecked();
			await expect(group(page).locator("input[type=number]")).toHaveCount(1);
		});

		test("a drag or key shows in settings when reopened; a typed figure moves the panel behind the dialog", async ({ page }) => {
			await openProject(page);
			await leftBar(page).focus();
			await page.keyboard.press("Shift+ArrowRight");
			const w = await widths(page);
			await openSettings(page);
			const field = group(page).locator("input[type=number]");
			near(Number(await field.inputValue()), (w.left / (await page.evaluate(() => innerWidth))) * 100);
			await field.fill("30");
			await field.press("Enter");
			const after = await widths(page);
			near(after.left, Math.round((await page.evaluate(() => innerWidth)) * 0.3));
			expect(after.lore).toBe(after.left);
		});

		test("an out-of-range figure is refused with its range and stores nothing; Escape puts the figure back", async ({ page }) => {
			await openProject(page);
			const set = await stored(page);
			await openSettings(page);
			const field = group(page).locator("input[type=number]");
			await field.fill("3");
			await field.press("Tab");
			await expect(group(page)).toContainText("Not allowed");
			await expect(field).toHaveAttribute("aria-invalid", "true");
			expect(await stored(page)).toEqual(set);
			await field.fill("3");
			await field.press("Escape");
			expect(Number(await field.inputValue())).toBe(set.story);
			await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible(); // Escape did not close the dialog
		});

		test("switching off shows three named figures; the unit switch converts without moving the panels", async ({ page }) => {
			await openProject(page);
			await openSettings(page);
			const before = await widths(page);
			await group(page).getByLabel("Keep the panels the same width").uncheck();
			await expect(group(page).locator("input[type=number]")).toHaveCount(3);
			for (const name of ["Left panel, storytelling side", "Left panel, library side", "Context panel"]) await expect(group(page).getByLabel(new RegExp(name))).toBeVisible();
			await group(page).getByLabel("Measure panel widths in").selectOption("px");
			near((await widths(page)).left, before.left);
			await expect(group(page).getByLabel(/Context panel \(pixels\)/)).toHaveValue(String(before.lore));
		});

		test("changing the switches in settings writes nothing to project.md", async ({ page }) => {
			await openProject(page);
			const before = await read(page);
			await openSettings(page);
			await group(page).getByLabel("Measure panel widths in").selectOption("px");
			await group(page).getByLabel("Keep the panels the same width").uncheck();
			await page.waitForTimeout(700);
			expect(await read(page)).toBe(before);
		});
	});
});
