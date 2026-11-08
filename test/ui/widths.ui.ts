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
		for (const v of ["storytelling", "series", "novel", "codex", "archive"]) expect(s.sets[v]).toEqual({ left: s.oldStory, lore: s.oldStory });
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
		near((await widths(page)).left, before.left); // the novel set is two figures: only its context panel moved
		near((await widths(page)).lore, before.left + 16);
		await flipFace(page); // back to storytelling
		near((await widths(page)).left, before.left + 16);
		const s = await stored(page);
		expect(s.sets.series.left).toBe(s.oldStory);
		expect(s.sets.novel.left).toBe(s.oldStory); // the novel set is two figures: only its context panel moved
		expect(s.sets.novel.lore).toBe(s.sets.storytelling.left);
		expect(s.sets.series.left).not.toBe(s.sets.storytelling.left);
	});

	test("the Codex and Archive tabs each have their own set, starting from the older library pair; the old keys are left as they were", async ({ page }) => {
		await openProject(page);
		const first = await stored(page);
		await flipFace(page);
		const before = await widths(page);
		await tab(page, "codex");
		await leftBar(page).focus();
		await page.keyboard.press("ArrowRight");
		near((await widths(page)).left, before.left + 16);
		await tab(page, "archive");
		near((await widths(page)).left, before.left); // the archive set did not move
		await tab(page, "novel");
		near((await widths(page)).left, before.left);
		await tab(page, "series");
		near((await widths(page)).left, before.left);
		await tab(page, "codex");
		near((await widths(page)).left, before.left + 16);
		const s = await stored(page);
		expect(s.sets.codex.left).toBeGreaterThan(s.sets.archive.left);
		expect(s.sets.archive).toEqual(first.sets.archive);
		expect(s.legacy).toEqual(first.legacy); // libraryWidth and loreWidth are left as they were
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
		for (const view of ["storytelling", "series", "novel", "codex", "archive"]) {
			const bad = await page.evaluate((v) => (window.__app as any).commitTypedWidth(v, "shared", 1), view);
			expect(bad.ok, view).toBe(false);
			const tooWide = await page.evaluate((v) => (window.__app as any).commitTypedWidth(v, "shared", 99), view);
			expect(tooWide.ok, view).toBe(false);
		}
		expect(await stored(page)).toEqual(set);
		const good = await page.evaluate(() => (window.__app as any).commitTypedWidth("novel", "shared", 25));
		expect(good.ok).toBe(true);
		const s = await stored(page);
		expect(s.sets.novel.left).toBe(25); // not linked: the left panel's figure alone
		expect(s.sets.novel.lore).toBe(set.sets.novel.lore);
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
			await openSettingsDialog(page); await page.getByRole("dialog").getByRole("tab", { name: "sidebar widths", exact: true }).click();
			await expect(page.locator("section[aria-label='sidebar widths']")).toBeVisible();
		};
		const group = (page: Page) => page.locator("section[aria-label='sidebar widths']");
		const table = (page: Page) => group(page).getByRole("table", { name: "side panel widths" });
		const view = (page: Page, v: string) => table(page).locator(`tr[data-view='${v}']`);
		const sets = ["storytelling", "series", "novel", "codex", "archive"] as const;

		test("one table: region, left, right and width options, headed once by two icons; a row per region with its icon and a plain word", async ({ page }) => {
			await openProject(page);
			await openSettings(page);
			await expect(group(page)).toContainText("stay on this computer");
			await expect(table(page).locator("thead svg")).toHaveCount(2); // the left and right sidebar icons, once
			await expect(table(page).locator("thead")).toHaveText("");
			await expect(table(page).locator("tbody tr")).toHaveCount(5);
			for (const v of sets) {
				await expect(view(page, v).locator(".sf-width-view svg")).toHaveCount(1); // the region's own icon
				await expect(view(page, v).locator(".sf-width-view-label")).toHaveText(v);
				await expect(view(page, v).getByRole("heading")).toHaveCount(0);
				await expect(view(page, v).getByRole("button")).toHaveCount(0);
			}
			// the switch is offered on the storytelling, codex and archive rows (Brief 19); series and novel leave the cell empty
			await expect(view(page, "storytelling").getByLabel("keep panels the same width", { exact: true })).toBeChecked();
			await expect(view(page, "codex").getByLabel("keep panels the same width (codex)", { exact: true })).not.toBeChecked();
			await expect(view(page, "archive").getByLabel("keep panels the same width (archive)", { exact: true })).not.toBeChecked();
			await expect(table(page).locator("input[type=checkbox]")).toHaveCount(3);
			for (const v of ["series", "novel"]) await expect(view(page, v).locator("td").last()).toBeEmpty();
			// linked: one slider for storytelling, two for each of the others; no number boxes, no range text, no unit select
			await expect(view(page, "storytelling").locator("input[type=range]")).toHaveCount(1);
			for (const v of sets.slice(1)) await expect(view(page, v).locator("input[type=range]")).toHaveCount(2);
			await expect(table(page).locator("input[type=number]")).toHaveCount(0);
			await expect(group(page)).not.toContainText("Not allowed");
			await expect(group(page)).not.toContainText(/\d+\.?\d*\s*[–-]\s*\d+/);
			await expect(group(page).getByLabel("Measure panel widths in")).toHaveCount(0);
		});

		test("each width has a full name for the screen reader and a tooltip", async ({ page }) => {
			await openProject(page);
			await openSettings(page);
			for (const v of sets.slice(1)) {
				for (const side of ["left", "right"]) {
					const f = view(page, v).getByLabel(`${v}, ${side} panel width`, { exact: true });
					await expect(f).toBeVisible();
					await expect(f).toHaveAttribute("title", new RegExp(`^${v}, ${side} panel width`));
				}
			}
			await expect(view(page, "storytelling").getByLabel("storytelling, left and right panel width", { exact: true })).toBeVisible();
			await expect(table(page).getByRole("columnheader", { name: "left panel width" })).toBeVisible();
			await expect(table(page).getByRole("columnheader", { name: "right panel width" })).toBeVisible();
		});

		test("a drag or key shows in settings when reopened; a slider moves the panel behind the dialog", async ({ page }) => {
			await openProject(page);
			await leftBar(page).focus();
			await page.keyboard.press("Shift+ArrowRight");
			const w = await widths(page);
			await openSettings(page);
			const field = view(page, "storytelling").locator("input[type=range]");
			near(Number(await field.inputValue()), (w.left / (await page.evaluate(() => innerWidth))) * 100);
			await field.fill("30");
			const after = await widths(page);
			near(after.left, Math.round((await page.evaluate(() => innerWidth)) * 0.3));
			expect(after.lore).toBe(after.left);
			const s = await stored(page);
			for (const v of sets.slice(1)) expect(s.sets[v].left, v).toBe(s.oldStory);
		});

		test("a slider keeps within its limits, gives its value to the screen reader, and Escape on it doesn't close the dialog", async ({ page }) => {
			await openProject(page);
			await openSettings(page);
			const win = await page.evaluate(() => innerWidth);
			for (const v of sets) {
				const field = view(page, v).locator("input[type=range]").first();
				const min = Number(await field.getAttribute("min"));
				const max = Number(await field.getAttribute("max"));
				expect(min * win / 100).toBeGreaterThanOrEqual(199);
				expect(max * win / 100).toBeLessThanOrEqual(641);
				await expect(field).toHaveAttribute("aria-valuetext", /percent of the window$/);
			}
			await view(page, "storytelling").locator("input[type=range]").press("Escape");
			await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
		});

		test("the same-width switch is per view: switching the codex row on gives it one slider, and a stored pixel width is converted once, at the first use", async ({ page }) => {
			await openProject(page);
			await page.evaluate(() => { const a = window.__app as any; a.setWidthUnit("px"); });
			await page.waitForTimeout(700);
			const before = await read(page);
			await openSettings(page);
			// nothing is written by opening Settings or reading a px width as its percentage
			expect(await page.evaluate(() => (window.__app as any).nav.widthUnit)).toBe("px");
			await view(page, "codex").getByLabel("keep panels the same width (codex)", { exact: true }).check();
			await expect(view(page, "codex").locator("input[type=range]")).toHaveCount(1);
			expect((await stored(page)).linked).toBe(true); // the storytelling set's own is untouched
			expect(await page.evaluate(() => (window.__app as any).nav.linkedViews)).toEqual({ codex: true });
			await view(page, "novel").locator("input[type=range]").first().fill("22");
			expect(await page.evaluate(() => (window.__app as any).nav.widthUnit)).toBe("percent"); // converted at the first slider use
			expect(await read(page)).toBe(before); // project.md never involved
		});

		test("changing the switches in settings writes nothing to project.md", async ({ page }) => {
			await openProject(page);
			const before = await read(page);
			await openSettings(page);
			await view(page, "storytelling").getByLabel("keep panels the same width", { exact: true }).uncheck();
			await view(page, "storytelling").locator("input[type=range]").first().fill("25");
			await page.waitForTimeout(700);
			expect(await read(page)).toBe(before);
		});
	});
});
