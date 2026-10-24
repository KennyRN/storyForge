import { expect, test, type Page } from "@playwright/test";
import { openPreview, shot } from "./helpers";

const SERIES = "_story-library/series.md";
const BOOK_A = "_story-library/novel-aaa.md";

async function openProject(page: Page, options: Parameters<typeof openPreview>[1] = {}, before?: () => Promise<void>): Promise<void> {
	await openPreview(page, options);
	if (before) {
		await before();
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	}
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const flip = (page: Page) => page.getByRole("button", { name: "Flip face" }).click();
const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const onDisk = (page: Page, path: string) => page.evaluate((p) => window.__preview.read(p), path);
const centre = (page: Page) => page.locator(".sf-slot--centre .cm-content");
const rowOf = (page: Page, text: string) => page.locator(".sf-row").filter({ hasText: text }).first();
async function drag(page: Page, from: ReturnType<typeof rowOf>, to: ReturnType<typeof rowOf>, where: "above" | "below" = "above"): Promise<void> {
	const handle = from.locator(".sf-drag-handle");
	const h = (await handle.boundingBox())!;
	const t = (await to.boundingBox())!;
	await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
	await page.mouse.down();
	await page.mouse.move(h.x + h.width / 2, h.y - 6, { steps: 3 });
	await page.mouse.move(t.x + 60, where === "above" ? t.y - 2 : t.y + t.height - 2, { steps: 8 });
	await page.mouse.up();
}

test.describe("the storyForge face", () => {
	test("one control flips between the faces; the lore slot and the chapter stay put", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-codex-file", { hasText: "Jane" }).click();
		await expect(page.locator(".sf-slot--lore .cm-content")).toBeVisible();
		await flip(page);
		await expect(page.getByRole("tablist", { name: "Library" })).toBeVisible();
		await expect(page.locator(".sf-slot--lore .cm-content")).toBeVisible();
		await expect(centre(page)).toContainText("Synthetic sentence number 1");
		await expect(page.getByRole("button", { name: "Flip face" })).toHaveAttribute("aria-pressed", "true");
		await flip(page);
		await expect(page.locator(".sf-nav-novel")).toBeVisible();
		await expect(page.locator(".sf-slot--lore .cm-content")).toBeVisible();
	});

	test("four tabs in order, the novel tab first by default, with an ink indicator that follows the choice", async ({ page }) => {
		await openProject(page);
		await flip(page);
		const tabs = page.getByRole("tab");
		await expect(tabs).toHaveCount(4);
		await expect(tabs.nth(0)).toHaveAttribute("aria-label", "codex");
		await expect(tabs.nth(1)).toHaveAttribute("aria-label", "series");
		await expect(tabs.nth(2)).toHaveAttribute("aria-label", "novel");
		await expect(tabs.nth(3)).toHaveAttribute("aria-label", "archive");
		await expect(tab(page, "novel")).toHaveAttribute("aria-selected", "true");
		await expect(page.locator(".sf-rail .sf-ink-bar")).toBeAttached();
		const before = (await page.locator(".sf-rail .sf-ink-bar").evaluate((e) => e.getBoundingClientRect().top));
		await tab(page, "archive").click();
		await expect.poll(() => page.locator(".sf-rail .sf-ink-bar").evaluate((e) => e.getBoundingClientRect().top)).toBeGreaterThan(before);
		await shot(page, "storyforge-archive");
	});

	test("the tabs are reachable with the keyboard (arrows move between them)", async ({ page }) => {
		await openProject(page);
		await flip(page);
		await tab(page, "novel").focus();
		await page.keyboard.press("ArrowUp");
		await expect(tab(page, "series")).toBeFocused();
		await expect(tab(page, "series")).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("ArrowUp");
		await expect(tab(page, "codex")).toBeFocused();
		await page.keyboard.press("ArrowUp"); // wraps
		await expect(tab(page, "archive")).toBeFocused();
	});

	test.describe("opening in the face the project asks for", () => {
		test("auto-focus off opens on the storyForge face; the layout names the tab; an old layout reads as the novel tab", async ({ page }) => {
			await openProject(page, {}, async () => void (await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nauto-focus: false\nlayout: seriesBrowse\n---\n"))));
			await expect(page.getByRole("tablist")).toBeVisible();
			await expect(tab(page, "series")).toHaveAttribute("aria-selected", "true");
			await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nauto-focus: false\nlayout: hybrid\n---\n"));
			await page.reload();
			await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
			await page.locator("[data-recent='0']").click();
			await expect(tab(page, "novel")).toHaveAttribute("aria-selected", "true");
		});
	});

	test.describe("the codex tab", () => {
		test("is the whole Codex pane", async ({ page }) => {
			await openProject(page);
			await flip(page);
			await tab(page, "codex").click();
			await expect(page.locator(".sf-codex-tree .sf-codex-file", { hasText: "Jane" })).toBeVisible();
			await page.getByRole("button", { name: "New file" }).click();
			await expect(page.locator(".sf-slot--lore .cm-content")).toBeVisible();
		});
	});

	test.describe("the series tab", () => {
		test.beforeEach(async ({ page }) => {
			await openProject(page);
			await flip(page);
			await tab(page, "series").click();
		});

		test("shows the series title, the placed novels in order and the unplaced ones", async ({ page }) => {
			await expect(page.locator(".sf-series-title")).toHaveText("The Lantern Cycle");
			await expect(page.getByRole("list", { name: "Novels in the series" }).locator(".sf-row")).toHaveCount(2);
			await expect(page.getByRole("list", { name: "Novels in the series" }).locator(".sf-row").nth(0)).toContainText("Book 1");
			await expect(page.getByRole("list", { name: "Unplaced novels" }).locator(".sf-row")).toContainText("Spare Draft");
			await shot(page, "storyforge-series");
		});

		test("the series title is renamed inline, here", async ({ page }) => {
			await page.locator(".sf-series-title").click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename" }).click();
			await page.getByLabel("Name").fill("The Lamp Cycle");
			await page.keyboard.press("Enter");
			await expect(page.locator(".sf-series-title")).toHaveText("The Lamp Cycle");
			expect(await onDisk(page, SERIES)).toContain("series-title: The Lamp Cycle");
			expect(await onDisk(page, SERIES)).toContain("x-unknown-note: kept by every rewrite");
		});

		test("clicking a novel selects it and shows its chapters on the novel tab", async ({ page }) => {
			await page.locator(".sf-row", { hasText: "Book 2" }).click();
			await expect(tab(page, "novel")).toHaveAttribute("aria-selected", "true");
			await expect(page.locator(".sf-row")).toHaveCount(1);
			await expect(centre(page)).toContainText(/\S/);
			expect(await page.evaluate(() => window.__app.nav.book)).toBe("bbb");
		});

		test("a novel is renamed inline and a new one is created among the unplaced", async ({ page }) => {
			await page.locator(".sf-row", { hasText: "Spare Draft" }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename" }).click();
			await page.getByLabel("Name").fill("Spare Draft Two");
			await page.keyboard.press("Enter");
			await expect(page.locator(".sf-row", { hasText: "Spare Draft Two" })).toBeVisible();
			await page.getByRole("button", { name: "New novel" }).click();
			await expect(page.getByRole("list", { name: "Unplaced novels" }).locator(".sf-row")).toHaveCount(2);
		});

		test("dragging an unplaced novel into the list places it", async ({ page }) => {
			await drag(page, page.locator(".sf-row", { hasText: "Spare Draft" }), page.locator(".sf-row", { hasText: "Book 2" }), "below");
			await expect.poll(async () => /order:\n  - aaa\n  - bbb\n  - ccc\n/.test(await onDisk(page, SERIES))).toBe(true);
		});

		test("the unplaced list folds", async ({ page }) => {
			await page.getByRole("button", { name: "Unplaced Novels" }).click();
			await expect(page.getByRole("list", { name: "Unplaced novels" })).toHaveCount(0);
		});
	});

	test.describe("the novel tab", () => {
		test.beforeEach(async ({ page }) => {
			await openProject(page);
			await flip(page);
		});

		test("lists placed and unplaced chapters, the default PoV and the planned lengths", async ({ page }) => {
			await expect(page.getByRole("list", { name: "Placed chapters", exact: true }).locator(".sf-row")).toHaveCount(3);
			await expect(page.getByRole("list", { name: "Unplaced chapters", exact: true }).locator(".sf-row")).toHaveCount(1);
			await expect(page.locator(".sf-meta-row", { hasText: "Default PoV" })).toContainText("Jane");
			await expect(page.locator(".sf-meta-row", { hasText: "Novel Length" })).toContainText("of 80,000");
			await expect(page.locator(".sf-meta-row", { hasText: "Chapter Length" })).toContainText("2,500");
			await shot(page, "storyforge-novel");
		});

		test("clicking a chapter opens it in the centre without flipping faces", async ({ page }) => {
			await rowOf(page, "The Storm").click();
			await expect(centre(page)).toContainText("Opening line of a second chapter");
			await expect(page.getByRole("tablist")).toBeVisible();
		});

		test("a planned length is edited in place; empty clears it", async ({ page }) => {
			await page.locator(".sf-meta-row", { hasText: "Chapter Length" }).getByRole("button").click();
			await expect(page.locator(".sf-meta-row", { hasText: "Average" })).toBeVisible();
			await page.getByLabel("Chapter Length").fill("3500");
			await expect(page.getByLabel("Chapter Length")).toHaveValue("3,500");
			await page.keyboard.press("Enter");
			await expect.poll(() => onDisk(page, BOOK_A)).toContain("planned-chapter-length: 3500");
			await page.locator(".sf-meta-row", { hasText: "Chapter Length" }).getByRole("button").click();
			await page.getByLabel("Chapter Length").fill("");
			await page.keyboard.press("Enter");
			await expect.poll(async () => (await onDisk(page, BOOK_A)).includes("planned-chapter-length")).toBe(false);
		});

		test("the default PoV is chosen from the Codex's people, and cleared", async ({ page }) => {
			await page.locator(".sf-meta-row", { hasText: "Default PoV" }).getByRole("button").click();
			await page.getByRole("menuitem", { name: "Sam" }).click();
			await expect.poll(() => onDisk(page, BOOK_A)).toContain("default-pov-name: Sam");
			await page.locator(".sf-meta-row", { hasText: "Default PoV" }).getByRole("button").click();
			await page.getByRole("menuitem", { name: "Clear" }).click();
			await expect(page.locator(".sf-meta-row", { hasText: "Default PoV" })).toContainText("None");
			expect(await onDisk(page, BOOK_A)).not.toContain("default-pov-name: Sam");
		});

		test("dragging an unplaced chapter into the placed list changes chapter-order", async ({ page }) => {
			await drag(page, rowOf(page, "Unplaced idea"), rowOf(page, "Chapter 2"), "above");
			await expect.poll(async () => /chapter-order:\n  - ch-a1\.md\n  - ch-a2\.md\n  - ch-a3\.md\n  - ch-a5\.md\n/.test(await onDisk(page, BOOK_A))).toBe(true);
		});

		test("a chapter is renamed inline and its '#' is numbered from its place", async ({ page }) => {
			await rowOf(page, "Chapter 1").click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename" }).click();
			await page.getByLabel("Name").fill("Chapter # // The Beginning");
			await page.keyboard.press("Enter");
			await expect(rowOf(page, "Chapter 1")).toContainText("The Beginning");
			expect(await onDisk(page, BOOK_A)).toContain('chapter-title: "Chapter # // The Beginning"');
		});

		test("New chapter creates an unplaced chapter", async ({ page }) => {
			await page.getByRole("button", { name: "New chapter" }).click();
			await expect(page.getByRole("list", { name: "Unplaced chapters", exact: true }).locator(".sf-row")).toHaveCount(2);
		});

		test("archiving closes the chapter's editor first, moves on, and the archive tab lists it", async ({ page }) => {
			await rowOf(page, "Chapter 1").click({ button: "right" });
			await page.getByRole("menuitem", { name: "Archive" }).click();
			await expect(page.locator('.sf-row[data-key="ch-a1.md"]')).toHaveCount(0);
			expect(await page.evaluate(() => window.__app.editors!.pathIn("centre"))).not.toBe("_story-library/aaa/ch-a1.md");
			await tab(page, "archive").click();
			await expect(page.getByRole("listitem").filter({ hasText: "Chapter #" })).toBeVisible();
		});

		test("folding the placed list keeps its order safe when an unplaced chapter is dragged", async ({ page }) => {
			await page.getByRole("button", { name: "Placed Chapters", exact: true }).click();
			await expect(page.getByRole("list", { name: "Placed chapters", exact: true })).toHaveCount(0);
			await page.getByRole("button", { name: "New chapter" }).click();
			const book = await onDisk(page, BOOK_A);
			expect(book).toContain("  - ch-a1.md\n  - ch-a2.md\n  - ch-a5.md");
		});

		test("keyboard: a row opens with Enter and moves with the arrow keys", async ({ page }) => {
			await rowOf(page, "Chapter 2").focus();
			await page.keyboard.press("Enter");
			await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("centre"))).toBe("_story-library/aaa/ch-a5.md");
			await rowOf(page, "The Storm").locator(".sf-drag-handle").focus();
			await page.keyboard.press("ArrowDown");
			await expect.poll(async () => /ch-a1\.md\n  - ch-a5\.md\n  - ch-a2\.md/.test(await onDisk(page, BOOK_A))).toBe(true);
		});
	});

	test.describe("the archive tab", () => {
		test.beforeEach(async ({ page }) => {
			await openProject(page);
			await flip(page);
			await tab(page, "archive").click();
		});

		test("lists archived chapters (by novel) and Codex items", async ({ page }) => {
			await expect(page.getByRole("region", { name: /Archived chapters of/ })).toContainText("日本語の章");
			await expect(page.getByRole("region", { name: "Archived Codex items" })).toContainText("Retired");
		});

		test("unarchive returns a chapter to its novel and a note to the Codex", async ({ page }) => {
			await page.getByRole("button", { name: /Unarchive 日本語の章/ }).click();
			await expect(page.getByRole("region", { name: /Archived chapters of/ })).toHaveCount(0);
			expect(await onDisk(page, BOOK_A)).not.toMatch(/archive:\n  - ch-a4\.md/);
			await page.getByRole("button", { name: /Unarchive Retired/ }).click();
			await expect(page.getByText("Nothing is archived.")).toBeVisible();
			await tab(page, "codex").click();
			await expect(page.locator(".sf-codex-file", { hasText: "Retired" })).toBeVisible();
		});

		test("clicking an archived chapter shows it read-only with its banner", async ({ page }) => {
			await page.getByRole("button", { name: "日本語の章", exact: true }).click();
			await expect(page.getByRole("note")).toHaveText("Archived. Unarchive it to edit.");
			await expect(centre(page)).toHaveAttribute("contenteditable", "false");
		});
	});

	test("a project made by a newer storyForge: nothing in the faces can write", async ({ page }) => {
		await openProject(page, {}, async () => void (await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"))));
		await flip(page);
		await expect(page.getByRole("button", { name: "New chapter" })).toBeDisabled();
		await tab(page, "series").click();
		await expect(page.getByRole("button", { name: "New novel" })).toBeDisabled();
		await tab(page, "archive").click();
		await expect(page.getByRole("button", { name: /Unarchive/ }).first()).toBeDisabled();
	});
});
