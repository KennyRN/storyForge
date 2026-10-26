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

	test("the bar's tooltip shows on hover", async ({ page }) => {
		const bar = novelOverview(page).locator(".sf-card .sf-bar").first();
		await expect(bar).toHaveAttribute("aria-label", /\d/);
		await bar.hover();
		await expect(page.getByRole("tooltip")).toBeVisible();
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
