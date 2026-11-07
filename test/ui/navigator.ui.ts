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
	// Fix 7 (decision 97): the selector has no chevron and no fill at rest; a bg1 fill on hover and while open, on the Codex card's edges.
	test("the selector has no chevron, no fill at rest, and a bg1 fill with the cards' corners on hover and while open, lined up with the Codex card", async ({ page }) => {
		await openProject(page);
		const cur = page.locator(".sf-select--chapters .sf-select-current");
		const fill = () => cur.evaluate((e) => getComputedStyle(e).backgroundColor);
		const clear = "rgba(0, 0, 0, 0)";
		const bg1 = await colour(page, "--purpose-raised-bg").then(async () => page.evaluate(() => { const d = document.createElement("i"); d.style.background = "var(--purpose-raised-bg)"; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }));
		await expect(cur.locator("svg")).toHaveCount(0);
		expect(await fill()).toBe(clear);
		await page.mouse.move(600, 600);
		await cur.hover();
		expect(await fill()).toBe(bg1);
		expect(await cur.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("10px");
		await page.mouse.move(600, 600);
		expect(await fill()).toBe(clear);
		const edges = async (s: string) => page.locator(s).first().evaluate((e) => { const b = e.getBoundingClientRect(); return [b.left, b.right]; });
		const card = await edges(".sf-left[data-face='storytelling'] .sf-codex-tree");
		await cur.click();
		await page.mouse.move(600, 600);
		expect(await fill()).toBe(bg1);
		expect(await cur.evaluate((e) => getComputedStyle(e).borderBottomLeftRadius)).toBe("0px");
		expect(await cur.evaluate((e) => getComputedStyle(e).borderTopRightRadius)).toBe("10px");
		const list = page.locator(".sf-select-list");
		expect(await list.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(bg1);
		expect(await list.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("0px");
		expect(await list.evaluate((e) => getComputedStyle(e).borderBottomRightRadius)).toBe("10px");
		// Tweaks 2, §1.6 (restoring decision 97 on this side): box on box, so the fill and the list are the Codex card's own edges; the text is on the entries' text (the card's 6px plus a row's 8px).
		for (const e of [await edges(".sf-select--chapters .sf-select-current"), await edges(".sf-select-list")]) {
			expect(Math.abs(e[0] - card[0])).toBeLessThan(1);
			expect(Math.abs(e[1] - card[1])).toBeLessThan(1);
		}
		expect(Math.abs((await edges(".sf-select--chapters .sf-select-current-title"))[0] - (card[0] + 14))).toBeLessThan(1);
		await expect(cur).toHaveAttribute("aria-expanded", "true");
	});

	test("keyboard focus alone gives the selector the green ring and no fill", async ({ page }) => {
		await openProject(page);
		await page.mouse.move(600, 600);
		await page.locator(".sf-select--novelname .sf-select-current").focus(); // the novel selector first, then the chapter selector
		await page.keyboard.press("Alt+Tab");
		const cur = page.locator(".sf-select--chapters .sf-select-current");
		await expect(cur).toBeFocused();
		expect(await cur.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
		expect(await cur.evaluate((e) => getComputedStyle(e).outlineColor)).toBe(await colour(page, "--purpose-accent"));
		expect(await cur.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
	});

	test("shows the series name, the novel's name and the chapter selector, in that order, with no header and no Flip side", async ({ page }) => {
		await openProject(page);
		const tops = await Promise.all([".sf-nav-series", ".sf-nav-novel", ".sf-select--chapters .sf-select-current"].map((s) => page.locator(s).evaluate((e) => e.getBoundingClientRect().top)));
		expect(tops[0]).toBeLessThan(tops[1]);
		expect(tops[1]).toBeLessThan(tops[2]);
		await expect(page.locator(".sf-left-header")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Flip side" })).toHaveCount(0);
		const green = await colour(page, "--purpose-accent");
		expect(await colourOf(page.locator(".sf-nav-series"))).toBe(green);
		expect(await colourOf(page.locator(".sf-nav-novel"))).toBe(green);
		expect(await colourOf(page.locator(".sf-select--chapters .sf-select-current"))).toBe(green);
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
		const novel = page.getByRole("button", { name: "Novels" }); // a selector since Tweaks 1 part 2 (§6.1): it opens a list, not the novel tab
		await expect.poll(() => series.evaluate((e) => getComputedStyle(e).cursor), { message: "the stylesheet has been applied" }).toBe("pointer"); // read once styled: once a full run read it empty
		await page.locator(".cm-content").first().click();
		await page.keyboard.type(" unsaved words");
		await series.click();
		await expect(page.getByRole("tab", { name: "series", selected: true })).toBeVisible();
		await expect(page.locator(".sf-overview")).toBeVisible();
		await expect(page.getByRole("button", { name: "Flip side" })).toHaveCount(0); // gone: the navigate menu and ⌘\\ flip
		await flipFace(page);
		await expect(page.locator(".sf-nav-series")).toBeVisible();
		await expect(page.locator(".cm-content").first()).toContainText("unsaved words");
		await novel.click();
		await expect(page.locator(".sf-select-list")).toBeVisible();
		await page.keyboard.press("Escape");
		await page.evaluate(() => (window.__app as any).openLibraryTab("novel", { resetChoice: true }));
		await expect(page.getByRole("tab", { name: "novel", selected: true })).toBeVisible();
		await expect(page.locator(".sf-left-name")).toHaveCount(0); // the library side's header is gone too
	});

	test.describe("the chapter dropdown", () => {
		test("covers the Codex list without moving it, on the Codex card's edges, with no border; the Codex can't be clicked and a click outside only closes it", async ({ page }) => {
			await openProject(page);
			const codexTop = () => page.locator("section[aria-label='Codex']").evaluate((e) => e.getBoundingClientRect().top);
			const before = await codexTop();
			await selector(page).click();
			const list = page.getByRole("list", { name: "Chapters of this novel" });
			await expect(list).toBeVisible();
			expect(await codexTop()).toBe(before);
			// Decision 97: the list's edges are the Codex card's, not the panel's.
			const [l, card] = await Promise.all([list.boundingBox(), page.locator(".sf-left[data-face='storytelling'] .sf-codex-tree").boundingBox()]);
			// Tweaks 2, §1.6 (restoring decision 97): the list is the card's width, box on box; the text is on the entries' text.
			expect(l!.x).toBeCloseTo(card!.x, 0);
			expect(l!.x + l!.width).toBeCloseTo(card!.x + card!.width, 0);
			expect(await list.evaluate((e) => { const s = getComputedStyle(e); return [s.borderTopWidth, s.borderBottomWidth, s.backgroundColor]; })).toEqual(["0px", "0px", await colour(page, "--purpose-raised-bg")]);
			const covered = await page.evaluate(() => { const r = document.querySelector(".sf-select-list")!.getBoundingClientRect(); const c = document.querySelector("section[aria-label='Codex']")!.getBoundingClientRect(); return r.bottom > c.top; });
			expect(covered).toBe(true);
			expect(await page.locator("section[aria-label='Codex']").evaluate((e) => (e as HTMLElement).inert)).toBe(true);
			await page.locator("section[aria-label='Codex'] [role='treeitem']").first().click({ force: true });
			await expect(list).toBeHidden(); // closed by the click
			expect(await page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBeFalsy(); // and nothing opened beneath it
			expect(await page.locator("section[aria-label='Codex']").evaluate((e) => (e as HTMLElement).inert)).toBe(false);
		});

		test("holds the placed chapters only, in order, then 'Add the next chapter'; the selected chapter is a highlighted row (rule 1), the rest muted, hover looks the same, the focus ring shows", async ({ page }) => {
			await openProject(page);
			await selector(page).click();
			const rows = page.locator(".sf-select-list .sf-select-row");
			expect(await rows.allInnerTexts()).toEqual(["Chapter 1", "The Storm: Part Two", "Chapter 2", ""]);
			await expect(rows.nth(3)).toHaveAttribute("aria-label", "Add the next chapter");
			await expect(rows.nth(3).locator("svg")).toHaveCount(1);
			await expect(page.locator(".sf-select-list")).not.toContainText("Unplaced idea");
			const raised = await page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--purpose-raised-bg)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
			const blockOf = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
			// rule 1: the selected chapter is a row in the accent with the list's own colour on it, as a hovered one is
			expect(await blockOf(rows.nth(0))).toBe(await colour(page, "--purpose-accent"));
			expect(await colourOf(rows.nth(0))).toBe(raised);
			expect(await colourOf(rows.nth(1))).toBe(await colour(page, "--purpose-text-muted"));
			expect(await blockOf(rows.nth(1))).toBe("rgba(0, 0, 0, 0)");
			await expect(rows.nth(0)).toHaveAttribute("aria-current", "true");
			await rows.nth(1).hover();
			expect(await colourOf(rows.nth(1))).toBe(raised); // hover: a block in the selected chapter's colour, the list's colour on it
			expect(await blockOf(rows.nth(1))).toBe(await colour(page, "--purpose-accent"));
			expect(await colourOf(rows.nth(3))).toBe(await colour(page, "--purpose-text-muted"));
			await rows.nth(3).hover();
			expect(await colourOf(rows.nth(3))).toBe(raised);
			expect(await blockOf(rows.nth(3))).toBe(await colour(page, "--purpose-accent"));
			await expect(page.getByText("add the next chapter", { exact: true })).toBeVisible(); // its tooltip
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
			await page.locator(".sf-select-row", { hasText: "The Storm" }).click();
			await expect(page.getByRole("list", { name: "Chapters of this novel" })).toHaveCount(0);
			await expect(page.locator(".sf-select--chapters .sf-select-current-title")).toHaveText("The Storm: Part Two");
			await selector(page).click();
			await page.locator(".sf-select-row").first().focus();
			await page.keyboard.press("Escape");
			await expect(page.getByRole("list", { name: "Chapters of this novel" })).toHaveCount(0);
			await expect(selector(page)).toBeFocused();
		});

		test("'Add the next chapter' is last, appends at the end whichever chapter is open, opens it and closes the list", async ({ page }) => {
			await openProject(page);
			await selector(page).click();
			await page.locator(".sf-select-row", { hasText: "The Storm" }).click();
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
			expect(await colourOf(page.locator(".sf-select--chapters .sf-select-current"))).toBe(await colour(page, "--purpose-text-muted"));
			await selector(page).click();
			await expect(page.locator(".sf-select-row.is-active")).toHaveCount(0);
		});

		test("a stored 'highlight-active-chapter: false' (the retired setting) is never read: the selected chapter is a highlighted row here", async ({ page }) => {
			await openPreview(page);
			await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nhighlight-active-chapter: false\n---\n"));
			await page.reload();
			await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
			await page.locator("[data-recent='0']").click();
			await page.waitForFunction(() => !!window.__app?.editors);
			await selector(page).click();
			expect(await page.locator(".sf-select-row").first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await colour(page, "--purpose-accent"));
		});

		test("reduced motion: nothing animates", async ({ page }) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			await openProject(page);
			await selector(page).click();
			expect(await page.locator(".sf-select-list").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
		});
	});
});
