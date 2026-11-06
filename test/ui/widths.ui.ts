import { expect, test, type Page } from "@playwright/test";
import { openPreview, flipFace, openSettingsDialog } from "./helpers";

// Fix 5, commit 2: the stored panel widths, the same-width switch, the unit and narrowing for display (decisions 76 and 77). Round five: one set of side-panel widths per view
// (storytelling, series, novel); the Codex and Archive tabs keep the older library pair.

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
const stored = (page: Page) => page.evaluate(() => { const n = (window.__app as any).nav; return { sets: JSON.parse(JSON.stringify(n.viewWidths)), legacy: { left: n.libraryWidth, lore: n.loreWidth }, oldStory: n.storyWidth, unit: n.widthUnit, linked: n.widthsLinked }; });
const leftBar = (page: Page) => page.getByRole("separator", { name: "Resize the left panel" });
const loreBar = (page: Page) => page.getByRole("separator", { name: "Resize the context panel" });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();

test.describe("panel widths", () => {
	test("a project with nothing stored opens linked, in percent, all three sets at the left panel's old width", async ({ page }) => {
		await openProject(page);
		const s = await stored(page);
		expect(s).toMatchObject({ unit: "percent", linked: true });
		for (const v of ["storytelling", "series", "novel"]) expect(s.sets[v]).toEqual({ left: s.oldStory, lore: s.oldStory });
		expect(s.legacy).toEqual({ left: s.oldStory, lore: s.oldStory });
		const w = await widths(page);
		expect(w.left).toBe(w.lore);
		expect(Math.abs(w.left - 288)).toBeLessThanOrEqual(1);
	});

	test("dragging a divider sets the widths of the view you are in; flipping sides or switching tabs applies that view's", async ({ page }) => {
		await openProject(page);
		const before = await widths(page);
		await leftBar(page).focus();
		await page.keyboard.press("ArrowRight"); // the storytelling side's set; linked, so both panels
		let w = await widths(page);
		near(w.left, before.left + 16);
		expect(w.lore).toBe(w.left);
		await flipFace(page); // the novel tab: its own set, untouched
		w = await widths(page);
		near(w.left, before.left);
		await loreBar(page).focus();
		await page.keyboard.press("ArrowLeft"); // widens the context panel by 16: the novel set
		near((await widths(page)).lore, before.left + 16);
		await tab(page, "series"); // the series set: still what it started as
		near((await widths(page)).left, before.left);
		await tab(page, "novel");
		near((await widths(page)).left, before.left + 16);
		await flipFace(page); // back to storytelling
		near((await widths(page)).left, before.left + 16);
		const s = await stored(page);
		expect(s.sets.series.left).toBe(s.oldStory);
		expect(s.sets.storytelling.left).toBe(s.sets.novel.left); // both moved by the same key press
		expect(s.sets.series.left).not.toBe(s.sets.storytelling.left);
	});

	test("the Codex and Archive tabs keep the older library pair, shared between them, apart from the series and novel sets", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		const before = await widths(page);
		await tab(page, "codex");
		await leftBar(page).focus();
		await page.keyboard.press("ArrowRight");
		const codex = await widths(page);
		near(codex.left, before.left + 16);
		await tab(page, "archive");
		near((await widths(page)).left, before.left + 16); // the same pair
		await tab(page, "novel");
		near((await widths(page)).left, before.left); // the novel set did not move
		await tab(page, "series");
		near((await widths(page)).left, before.left);
		const s = await stored(page);
		expect(s.legacy.left).toBeGreaterThan(s.sets.novel.left);
	});

	test("unlinked, a set's left panel and context panel change on their own", async ({ page }) => {
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
		near(w.left, before.left); // the novel view still has its own
		await flipFace(page);
		near((await widths(page)).left, before.left + 16);
		// turning it back on gives each set's context panel its left panel's width
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
		await page.evaluate(() => { const a = window.__app as any; a.setWidthsLinked(false); a.commitTypedWidth("storytelling", "lore", 400); });
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

	test("typed figures are refused outside the limits and change nothing; the limits apply to each set", async ({ page }) => {
		await openProject(page);
		const set = await stored(page);
		for (const view of ["storytelling", "series", "novel"]) {
			const bad = await page.evaluate((v) => (window.__app as any).commitTypedWidth(v, "shared", 1), view);
			expect(bad.ok, view).toBe(false);
			const tooWide = await page.evaluate((v) => (window.__app as any).commitTypedWidth(v, "shared", 99), view);
			expect(tooWide.ok, view).toBe(false);
		}
		expect(await stored(page)).toEqual(set);
		const good = await page.evaluate(() => (window.__app as any).commitTypedWidth("novel", "shared", 25));
		expect(good.ok).toBe(true);
		const s = await stored(page);
		expect(s.sets.novel.left).toBe(25);
		expect(s.sets.novel.lore).toBe(25);
		expect(s.sets.storytelling).toEqual(set.sets.storytelling);
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
			await openSettingsDialog(page); await page.getByRole("dialog").getByRole("tab", { name: "this computer", exact: true }).click();
			await expect(page.locator("section[aria-label='This computer, this project']")).toBeVisible();
		};
		const group = (page: Page) => page.locator("section[aria-label='This computer, this project']");
		const sets = ["storytelling", "series", "novel"] as const;

		test("says plainly that these stay on this computer, names the three sets as side panels only, and starts with one figure for each", async ({ page }) => {
			await openProject(page);
			await openSettings(page);
			await expect(group(page)).toContainText("stay on this computer, for this project");
			await expect(group(page)).toContainText("never the central workspace");
			await expect(group(page).getByLabel("Keep the panels the same width")).toBeChecked();
			for (const v of sets) await expect(group(page).getByRole("group", { name: `${v} panel widths` })).toBeVisible();
			await expect(group(page).locator("input[type=number]")).toHaveCount(3);
		});

		test("a drag or key shows in settings when reopened; a typed figure moves the panel behind the dialog", async ({ page }) => {
			await openProject(page);
			await leftBar(page).focus();
			await page.keyboard.press("Shift+ArrowRight");
			const w = await widths(page);
			await openSettings(page);
			const field = group(page).getByRole("group", { name: "storytelling panel widths" }).locator("input[type=number]");
			near(Number(await field.inputValue()), (w.left / (await page.evaluate(() => innerWidth))) * 100);
			await field.fill("30");
			await field.press("Enter");
			const after = await widths(page);
			near(after.left, Math.round((await page.evaluate(() => innerWidth)) * 0.3));
			expect(after.lore).toBe(after.left);
			// the other two sets did not move
			const s = await stored(page);
			expect(s.sets.series.left).toBe(s.oldStory);
			expect(s.sets.novel.left).toBe(s.oldStory);
		});

		test("an out-of-range figure is refused with its range and stores nothing, in each set; Escape puts the figure back", async ({ page }) => {
			await openProject(page);
			const set = await stored(page);
			await openSettings(page);
			for (const v of sets) {
				const field = group(page).getByRole("group", { name: `${v} panel widths` }).locator("input[type=number]");
				await field.fill("3");
				await field.press("Tab");
				await expect(group(page).getByRole("group", { name: `${v} panel widths` })).toContainText("Not allowed");
				await expect(field).toHaveAttribute("aria-invalid", "true");
				expect(await stored(page)).toEqual(set);
				await field.fill("3");
				await field.press("Escape");
				expect(Number(await field.inputValue())).toBe(set.sets[v].left);
			}
			await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible(); // Escape did not close the dialog
		});

		test("switching off shows two named figures in each set; the unit switch converts without moving the panels", async ({ page }) => {
			await openProject(page);
			await openSettings(page);
			const before = await widths(page);
			await group(page).getByLabel("Keep the panels the same width").uncheck();
			await expect(group(page).locator("input[type=number]")).toHaveCount(6);
			for (const v of sets) for (const name of [`${v} left panel`, `${v} context panel`]) await expect(group(page).getByLabel(new RegExp(name))).toBeVisible();
			await group(page).getByLabel("Measure panel widths in").selectOption("px");
			near((await widths(page)).left, before.left);
			await expect(group(page).getByLabel(/storytelling context panel \(pixels\)/)).toHaveValue(String(before.lore));
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
