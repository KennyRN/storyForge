import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import * as nodePath from "node:path";
import { openPreview, shot } from "./helpers";

// Brief 16: the start screen's project cards (docs/project-cards.md). Details come from the real Rust code through the preview's bridge.

/** A real 1 x 1 PNG (the fixtures' cover files are not real images, so a card would show the no-cover icon for them). */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const REAL_COVERS = { "_backstage/storyforge/_series/cover.jpg": PNG, "_backstage/storyforge/aaa/cover.png": PNG };

const cards = (page: Page) => page.locator("button.sf-project-card");
const card = (page: Page, i: number) => page.locator(`button.sf-project-card[data-recent='${i}']`);
const state = (page: Page) => page.evaluate(() => window.__preview.recentState());

async function start(page: Page, entries: Parameters<Window["__preview"]["setRecent"]>[0]): Promise<string[]> {
	await openPreview(page, { recent: false });
	const paths = await page.evaluate((e) => window.__preview.setRecent(e), entries);
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	return paths;
}

test.describe("the project cards", () => {
	test("a series project: the series cover on top, the series title, and the folder under it with the home folder as ~", async ({ page }) => {
		await start(page, [{ fixture: "series", binary: REAL_COVERS }]);
		await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("The Lantern Cycle");
		await expect(card(page, 0).locator(".sf-project-card-image img")).toBeVisible(); // the fixture's series cover
		await expect(card(page, 0)).toHaveAttribute("title", /storyForge test vault$/); // the full path is the tooltip
		await expect(card(page, 0).locator(".sf-project-card-path")).toHaveText(/^~\//); // Rust shortened the "home" (the preview's own folder) to ~
		await expect(card(page, 0)).not.toHaveAttribute("title", /^~/); // the tooltip is the full path
		await shot(page, "project-cards-one");
	});

	test("with no series cover the first novel's cover is shown, and with neither the no-cover icon, named No cover", async ({ page }) => {
		await start(page, [
			// series.md records no cover;
			{ fixture: "series", binary: REAL_COVERS, files: { "_story-library/series.md": readFileSync("test/fixtures/series/_story-library/series.md", "utf8").replace("cover-image: cover.jpg\n", "") } }, // the fixture's first book (aaa) records cover.png and has the file
			// neither: no recorded cover anywhere
			{ fixture: "series", files: { "_story-library/series.md": readFileSync("test/fixtures/series/_story-library/series.md", "utf8").replace("cover-image: cover.jpg\n", "") }, remove: ["_backstage/storyforge/aaa/cover.png", "_backstage/storyforge/_series/cover.jpg"] },
		]);
		await expect(card(page, 0).locator(".sf-project-card-image img")).toBeVisible();
		await expect(card(page, 1).locator(".sf-project-card-image.is-empty")).toBeVisible();
		await expect(card(page, 1).locator('svg[aria-label="No cover"]')).toBeVisible(); // the icon is named No cover
	});

	test("a recorded cover whose file is missing counts as no cover, quietly", async ({ page }) => {
		await start(page, [{ fixture: "series", remove: ["_backstage/storyforge/_series/cover.jpg", "_backstage/storyforge/aaa/cover.png"] }]);
		await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("The Lantern Cycle");
		await expect(card(page, 0).locator(".sf-project-card-image.is-empty")).toBeVisible();
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("a cover the browser can't draw is a red box with the exclamation mark cut out, quietly", async ({ page }) => {
		// The fixture's cover files are not real images, so the browser can't draw them (a real project's are).
		await start(page, [{ fixture: "series" }]);
		// Tweaks 1, §1.8: a recorded cover that can't be drawn, with nothing to fall back to, is the red box with the "!" cut out (still quiet: no report here).
		await expect(card(page, 0).locator(".sf-project-card-image.is-error")).toBeVisible();
		await expect(card(page, 0).locator('svg[aria-label="The cover could not be shown"]')).toBeVisible();
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("a single-novel project asks for its novel (its title) even when the series has a cover, and shows the series cover; a series with a cover doesn't ask", async ({ page }) => {
		await start(page, [{ fixture: "series", binary: REAL_COVERS, files: { "_backstage/storyforge/project.md": "---\nformat-version: 1\nstory-kind: standalone\n---\n" } }]);
		await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("Book 1: The Harbour Wakes");
		await expect(card(page, 0).locator(".sf-project-card-image img")).toBeVisible(); // the series cover, not the icon
		expect((await state(page)).peekBookCalls).toBe(1);
		await start(page, [{ fixture: "series", binary: REAL_COVERS }]);
		await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("The Lantern Cycle");
		await expect(card(page, 0).locator(".sf-project-card-image img")).toBeVisible();
		await page.waitForTimeout(300);
		expect((await state(page)).peekBookCalls).toBe(0); // a series with its own cover never asks for a book
	});

	test("a series cover that can't be drawn moves on to the first novel's cover, as a missing one does", async ({ page }) => {
		// The series cover (the fixture's own file) is not a real image; the first book's is.
		await start(page, [{ fixture: "series", binary: { "_backstage/storyforge/aaa/cover.png": PNG } }]);
		const img = card(page, 0).locator(".sf-project-card-image img");
		await expect(img).toBeVisible();
		await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBe(1); // it really drew
		await expect(card(page, 0).locator(".sf-project-card-image.is-empty")).toHaveCount(0);
		expect((await state(page)).peekBookCalls).toBe(1);
		// Both undrawable: the red box with the "!", quietly.
		await start(page, [{ fixture: "series" }]);
		await expect(card(page, 0).locator(".sf-project-card-image.is-error")).toBeVisible();
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test.describe("a peek that never answers (an offline drive) holds nothing up", () => {
		test("the card stays drawn and clickable, and opens the project", async ({ page }) => {
			await openPreview(page, { recent: false });
			await page.evaluate(() => window.__preview.hangPeeks(true));
			await page.evaluate(() => window.__preview.setRecent([{ fixture: "series", folder: "Slow Drive" }]));
			await page.reload();
			await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
			await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("Slow Drive"); // drawn at once from the list, as the folder's name
			await page.waitForTimeout(1500); // longer than any peek would take; it is still waiting
			await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("Slow Drive");
			expect(await card(page, 0).getAttribute("aria-disabled")).not.toBe("true");
			await card(page, 0).click();
			await expect(page.getByRole("heading", { name: "Slow Drive" })).toBeVisible(); // open_recent was not held up
		});

		test("forget_recent, Clear Menu and the other buttons work while a peek hangs", async ({ page }) => {
			await openPreview(page, { recent: false });
			await page.evaluate(() => window.__preview.hangPeeks(true));
			await page.evaluate(() => window.__preview.setRecent([{ fixture: "series", folder: "One" }, { fixture: "series", folder: "Two" }, { fixture: "series", folder: "Three" }]));
			await page.reload();
			await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
			await expect(cards(page)).toHaveCount(3);
			await card(page, 0).focus();
			await page.keyboard.press("Delete"); // forget_recent while three peeks are still pending
			await expect(cards(page)).toHaveCount(2);
			await expect(page.getByRole("button", { name: "Open Project…" })).toBeEnabled();
			await page.evaluate(() => window.__preview.emit("menu", "clear-recent")); // the menu's own item, still answered
			await expect(cards(page)).toHaveCount(0);
		});

		test("Back Up and the menus work in a project opened while another card's peek still hangs", async ({ page }) => {
			await openPreview(page, { recent: false });
			await page.evaluate(() => window.__preview.hangPeeks(true));
			await page.evaluate(() => window.__preview.setRecent([{ fixture: "series", folder: "Opens" }, { fixture: "series", folder: "Never Answers" }]));
			await page.reload();
			await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
			await card(page, 0).click();
			await page.waitForFunction(() => !!window.__app?.editors);
			await page.evaluate(() => window.__preview.emit("menu", "backup-now"));
			await expect(page.getByRole("status").filter({ hasText: /^Backed up \d+ files/ })).toBeVisible();
			await page.evaluate(() => window.__preview.emit("menu", "flip-face"));
			await expect(page.locator('.sf-left[data-face="storyforge"]')).toBeVisible();
		});
	});

	test("a single-novel project is named by its book's title", async ({ page }) => {
		await start(page, [{ fixture: "series", files: { "_backstage/storyforge/project.md": "---\nformat-version: 1\nstory-kind: standalone\n---\n" } }]);
		await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("Book 1: The Harbour Wakes");
	});

	test("an unreadable series.md gives the folder's name and no image, never a failure", async ({ page }) => {
		await start(page, [{ fixture: "series", folder: "Mystery", files: { "_story-library/series.md": "---\nseries-title: [unclosed\n---\n" } }]);
		await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("Mystery");
		await expect(card(page, 0).locator(".sf-project-card-image.is-empty")).toBeVisible();
	});

	test("Not found and Not a project say so in words, are dimmed, heard by the screen reader, and do nothing when clicked", async ({ page }) => {
		await start(page, [{ missing: true, folder: "Old Draft" }, { fixture: "empty", folder: "Notes" }]);
		await expect(card(page, 0).locator(".sf-project-card-state")).toHaveText("Not found");
		await expect(card(page, 1).locator(".sf-project-card-state")).toHaveText("Not a project");
		await expect(page.getByRole("button", { name: "Old Draft, Not found" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Notes, Not a project" })).toBeVisible();
		expect(Number(await card(page, 0).evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(1);
		await card(page, 0).click({ force: true }); // forced: Playwright won't click an aria-disabled button, and a person can
		await card(page, 1).click({ force: true });
		await expect(page.getByRole("button", { name: "Open Project…" })).toBeVisible(); // still the start screen
		expect((await state(page)).recent).toHaveLength(2);
		await shot(page, "project-cards-states");
	});

	test("one click opens the project", async ({ page }) => {
		await start(page, [{ fixture: "series" }]);
		await card(page, 0).click();
		await expect(page.getByRole("heading", { name: "storyForge test vault" })).toBeVisible();
	});

	test("arrows move between cards, Return opens, and the focus ring shows only after a key", async ({ page }) => {
		await start(page, [{ fixture: "series", folder: "One" }, { fixture: "series", folder: "Two" }, { fixture: "series", folder: "Three" }]);
		await expect(cards(page)).toHaveCount(3);
		await card(page, 0).focus();
		await page.keyboard.press("ArrowRight");
		await expect(card(page, 1)).toBeFocused();
		await page.keyboard.press("ArrowRight");
		await expect(card(page, 2)).toBeFocused();
		await page.keyboard.press("ArrowLeft");
		await expect(card(page, 1)).toBeFocused();
		expect(await page.evaluate(() => document.documentElement.dataset.input)).toBe("keyboard");
		await expect(card(page, 1)).toHaveCSS("outline-style", "solid"); // after a key the ring shows
		await page.mouse.move(5, 5);
		await page.mouse.down();
		await page.mouse.up();
		await expect(card(page, 1)).toHaveCSS("outline-style", "none"); // after a pointer it does not
		await card(page, 1).focus();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("heading", { name: "Two" })).toBeVisible(); // the second card's project (named by its folder)
	});

	test("hover turns the edge green, as a border that was already there", async ({ page }) => {
		await start(page, [{ fixture: "series" }]);
		const before = await card(page, 0).boundingBox();
		await card(page, 0).hover();
		await expect(card(page, 0)).toHaveCSS("border-top-color", "rgb(167, 192, 128)");
		expect(await card(page, 0).boundingBox()).toEqual(before); // nothing moved
	});

	test("Remove from List: context menu, Shift-F10, Control-Return and Delete take only the entry, with no confirmation, and the project is left alone", async ({ page }) => {
		const paths = await start(page, [{ fixture: "series", folder: "One" }, { fixture: "series", folder: "Two" }, { fixture: "series", folder: "Three" }, { fixture: "series", folder: "Four" }]);
		const read = (p: string) => readFileSync(nodePath.join(p, "_story-library/series.md"), "utf8");
		const before = paths.map(read);
		await card(page, 0).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Remove from List" }).click();
		await expect(cards(page)).toHaveCount(3);
		await card(page, 0).focus(); // Two
		await page.keyboard.press("Shift+F10");
		await page.getByRole("menuitem", { name: "Remove from List" }).click();
		await expect(cards(page)).toHaveCount(2);
		await card(page, 0).focus(); // Three
		await page.keyboard.press("Control+Enter");
		await expect(page.getByRole("menuitem", { name: "Remove from List" })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menuitem", { name: "Remove from List" })).toHaveCount(0);
		await expect(cards(page)).toHaveCount(2);
		await card(page, 0).focus();
		await page.keyboard.press("Delete");
		await expect(cards(page)).toHaveCount(1);
		await expect(card(page, 0)).toBeFocused(); // focus moved on to the next card
		expect((await state(page)).recent).toEqual([paths[3]]);
		expect(paths.map(read)).toEqual(before); // every project folder is as it was
		for (const p of paths) expect(existsSync(p)).toBe(true);
	});

	test("Clear Menu (File ▸ Open Recent) empties the list and the cards, and touches no project", async ({ page }) => {
		const paths = await start(page, [{ fixture: "series", folder: "One" }, { fixture: "series", folder: "Two" }]);
		await expect(cards(page)).toHaveCount(2);
		await page.evaluate(() => window.__preview.emit("menu", "clear-recent"));
		await expect(cards(page)).toHaveCount(0);
		expect((await state(page)).recent).toEqual([]);
		for (const p of paths) expect(existsSync(nodePath.join(p, "_story-library/series.md"))).toBe(true);
	});

	test("the Open Recent menu is given the cards' names, by position", async ({ page }) => {
		await start(page, [{ fixture: "series", folder: "One" }, { missing: true, folder: "Old Draft" }]);
		await expect(card(page, 0).locator(".sf-project-card-name")).toHaveText("The Lantern Cycle");
		await expect.poll(async () => (await state(page)).names).toEqual([["One", "The Lantern Cycle"], ["Old Draft", "Old Draft"]]);
	});

	test("Open Project and New Project stay in place while the cards scroll", async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 400 });
		await start(page, Array.from({ length: 10 }, (_, i) => ({ fixture: "series", folder: `Project ${i}` })));
		await expect(cards(page)).toHaveCount(10);
		const open = page.getByRole("button", { name: "Open Project…" });
		const top = (await open.boundingBox())!.y;
		await page.locator(".sf-start-scroll").evaluate((e) => (e.scrollTop = 400));
		expect((await open.boundingBox())!.y).toBe(top);
		await expect(open).toBeVisible();
		expect(await page.locator(".sf-start-scroll").evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
	});

	test("the screen is bg_dim and the cards are bg0 with 10 px corners and no border at rest", async ({ page }) => {
		await start(page, [{ fixture: "series" }]);
		await expect(page.locator(".sf-start")).toHaveCSS("background-color", "rgb(41, 49, 54)"); // bg_dim
		await expect(card(page, 0)).toHaveCSS("background-color", "rgb(51, 60, 67)"); // bg0
		await expect(card(page, 0)).toHaveCSS("border-top-left-radius", "10px");
		await expect(card(page, 0)).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
	});

	test("the image fills the card's frame, cropped and centred", async ({ page }) => {
		await start(page, [{ fixture: "series", binary: REAL_COVERS }]);
		const img = card(page, 0).locator(".sf-project-card-image img");
		await expect(img).toHaveCSS("object-fit", "cover");
		await expect(img).toHaveCSS("object-position", "50% 50%");
	});
});
