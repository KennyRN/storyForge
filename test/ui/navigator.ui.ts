import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 13, commit 3: the navigator (decisions 79 to 81).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const colour = (page: Page, purpose: string) => page.evaluate((p) => { const d = document.createElement("i"); d.style.color = `var(${p})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, purpose);
const colourOf = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => getComputedStyle(e).color);
const selector = (page: Page) => page.getByRole("button", { name: "Chapters" });

test.describe("the navigator", () => {
	test("shows the series name, the novel's name and the chapter selector, in that order, with no header and no Flip side", async ({ page }) => {
		await openProject(page);
		const tops = await Promise.all([".sf-nav-series", ".sf-nav-novel", ".sf-nav-current"].map((s) => page.locator(s).evaluate((e) => e.getBoundingClientRect().top)));
		expect(tops[0]).toBeLessThan(tops[1]);
		expect(tops[1]).toBeLessThan(tops[2]);
		await expect(page.locator(".sf-left-header")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Flip side" })).toHaveCount(0);
		const green = await colour(page, "--purpose-accent");
		expect(await colourOf(page.locator(".sf-nav-series"))).toBe(green);
		expect(await colourOf(page.locator(".sf-nav-novel"))).toBe(green);
		expect(await colourOf(page.locator(".sf-nav-current"))).toBe(green);
	});

	test("a standalone novel (story-kind: standalone) has no series line; an unknown value is a series and isn't rewritten", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nstory-kind: nonsense\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(page.locator(".sf-nav-series")).toBeVisible();
		expect(await page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md"))).toContain("story-kind: nonsense");
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nstory-kind: standalone\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(page.locator(".sf-nav-series")).toHaveCount(0);
		await expect(page.locator(".sf-nav-novel")).toBeVisible();
	});

	test("the series and novel names are buttons that flip to the library side's tabs, the chapter's editor and text kept; ⌘\\ flips back", async ({ page }) => {
		await openProject(page);
		const series = page.getByRole("button", { name: "Open the series on the library side" });
		const novel = page.getByRole("button", { name: "Open the novel on the library side" });
		expect(await series.evaluate((e) => getComputedStyle(e).cursor)).toBe("pointer");
		await page.locator(".cm-content").first().click();
		await page.keyboard.type(" unsaved words");
		await series.click();
		await expect(page.getByRole("tab", { name: "series", selected: true })).toBeVisible();
		await expect(page.locator(".sf-overview")).toBeVisible();
		await expect(page.getByRole("button", { name: "Flip side" })).toHaveAttribute("aria-pressed", "true"); // the library side keeps it
		await flipFace(page);
		await expect(page.locator(".sf-nav-series")).toBeVisible();
		await expect(page.locator(".cm-content").first()).toContainText("unsaved words");
		await novel.click();
		await expect(page.getByRole("tab", { name: "novel", selected: true })).toBeVisible();
		await expect(page.locator(".sf-left-name")).toBeVisible(); // the library side's header is as it was
	});

	test.describe("the chapter dropdown", () => {
		test("covers the Codex list without moving it, the panel's full width, with no border; the Codex can't be clicked and a click outside only closes it", async ({ page }) => {
			await openProject(page);
			const codexTop = () => page.locator("section[aria-label='Codex']").evaluate((e) => e.getBoundingClientRect().top);
			const before = await codexTop();
			await selector(page).click();
			const list = page.getByRole("list", { name: "Chapters of this novel" });
			await expect(list).toBeVisible();
			expect(await codexTop()).toBe(before);
			const [l, left] = await Promise.all([list.boundingBox(), page.locator(".sf-left").boundingBox()]);
			expect(l!.x).toBeCloseTo(left!.x, 0);
			expect(l!.width).toBeCloseTo(left!.width, 0);
			expect(await list.evaluate((e) => { const s = getComputedStyle(e); return [s.borderTopWidth, s.borderBottomWidth, s.backgroundColor]; })).toEqual(["0px", "0px", await colour(page, "--purpose-raised-bg")]);
			const covered = await page.evaluate(() => { const r = document.querySelector(".sf-nav-list")!.getBoundingClientRect(); const c = document.querySelector("section[aria-label='Codex']")!.getBoundingClientRect(); return r.bottom > c.top; });
			expect(covered).toBe(true);
			expect(await page.locator("section[aria-label='Codex']").evaluate((e) => (e as HTMLElement).inert)).toBe(true);
			await page.locator("section[aria-label='Codex'] [role='treeitem']").first().click({ force: true });
			await expect(list).toBeHidden(); // closed by the click
			expect(await page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBeFalsy(); // and nothing opened beneath it
			expect(await page.locator("section[aria-label='Codex']").evaluate((e) => (e as HTMLElement).inert)).toBe(false);
		});

		test("holds the placed chapters only, in order, then 'Add the next chapter'; selected is green, the rest muted, hover brightens, the focus ring shows", async ({ page }) => {
			await openProject(page);
			await selector(page).click();
			const rows = page.locator(".sf-nav-list .sf-nav-row");
			expect(await rows.allInnerTexts()).toEqual(["Chapter 1", "The Storm: Part Two", "Chapter 2", "Add the next chapter"]);
			await expect(page.locator(".sf-nav-list")).not.toContainText("Unplaced idea");
			expect(await colourOf(rows.nth(0))).toBe(await colour(page, "--purpose-accent"));
			expect(await colourOf(rows.nth(1))).toBe(await colour(page, "--purpose-text-muted"));
			await expect(rows.nth(0)).toHaveAttribute("aria-current", "true");
			await rows.nth(1).hover();
			expect(await colourOf(rows.nth(1))).toBe(await colour(page, "--purpose-text"));
			await rows.nth(2).focus();
			await page.keyboard.press("ArrowDown");
			await expect(rows.nth(3)).toBeFocused();
			await page.keyboard.press("ArrowUp");
			await expect(rows.nth(2)).toBeFocused();
			expect(await rows.nth(2).evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none");
		});

		test("choosing a chapter opens it and closes the list; Escape closes it and returns focus to the selector", async ({ page }) => {
			await openProject(page);
			await selector(page).click();
			await page.locator(".sf-nav-row", { hasText: "The Storm" }).click();
			await expect(page.getByRole("list", { name: "Chapters of this novel" })).toHaveCount(0);
			await expect(page.locator(".sf-nav-current-title")).toHaveText("The Storm: Part Two");
			await selector(page).click();
			await page.locator(".sf-nav-row").first().focus();
			await page.keyboard.press("Escape");
			await expect(page.getByRole("list", { name: "Chapters of this novel" })).toHaveCount(0);
			await expect(selector(page)).toBeFocused();
		});

		test("'Add the next chapter' is last, appends at the end whichever chapter is open, opens it and closes the list", async ({ page }) => {
			await openProject(page);
			await selector(page).click();
			await page.locator(".sf-nav-row", { hasText: "The Storm" }).click();
			await selector(page).click();
			await page.getByRole("button", { name: "Add the next chapter" }).click();
			await expect(page.getByRole("list", { name: "Chapters of this novel" })).toHaveCount(0);
			const readOrder = async () => (await page.evaluate(() => window.__preview.read("_story-library/novel-aaa.md"))).match(/chapter-order:\n((?:  - .*\n)+)/)![1].trim().split("\n");
			await expect.poll(async () => (await readOrder()).length).toBe(4);
			const order = await readOrder();
			await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("centre"))).toBe(`_story-library/aaa/${order[3].replace(/^\s*- /, "")}`);
		});

		test("an open chapter that isn't in the list shows muted with a quiet note, and no entry is green", async ({ page }) => {
			await openProject(page);
			await page.evaluate(() => window.__app.openChapter("aaa", "ch-a3.md"));
			await expect(page.locator(".sf-nav-note")).toHaveText("unplaced");
			expect(await colourOf(page.locator(".sf-nav-current"))).toBe(await colour(page, "--purpose-text-muted"));
			await selector(page).click();
			await expect(page.locator(".sf-nav-row.is-active")).toHaveCount(0);
		});

		test("with 'Highlight the active chapter' off the selected chapter is still green here", async ({ page }) => {
			await openPreview(page);
			await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nhighlight-active-chapter: false\n---\n"));
			await page.reload();
			await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
			await page.locator("[data-recent='0']").click();
			await page.waitForFunction(() => !!window.__app?.editors);
			await selector(page).click();
			expect(await colourOf(page.locator(".sf-nav-row").first())).toBe(await colour(page, "--purpose-accent"));
		});

		test("reduced motion: nothing animates", async ({ page }) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			await openProject(page);
			await selector(page).click();
			expect(await page.locator(".sf-nav-list").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
		});
	});
});
