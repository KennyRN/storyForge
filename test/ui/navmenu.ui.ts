import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Fix 7 polish (try-out): focus rings for the keyboard only, the chapter list's row shape, the add button, the invisible title bar,
// the one top line, and the left panel's navigate menu (decisions 104, 105).

async function openProject(page: Page, readOnly = false): Promise<void> {
	await openPreview(page);
	if (readOnly) {
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	}
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const chevron = (page: Page) => page.getByRole("button", { name: "Navigate" });
const menu = (page: Page) => page.getByRole("menu", { name: "Navigate" });
const item = (page: Page, name: string) => menu(page).getByRole("menuitem", { name, exact: true });
const accent = (page: Page) => page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--purpose-accent)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
const outline = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => getComputedStyle(e).outlineStyle);

test.describe("the navigate menu", () => {
	test("the chevron is in the left panel's top band, at its right end, on both sides, named Navigate, and follows a resize", async ({ page }) => {
		await openProject(page);
		for (const side of ["storytelling", "storyforge"]) {
			if (side === "storyforge") await flipFace(page);
			const [b, p] = await Promise.all([chevron(page).boundingBox(), page.locator(".sf-left").boundingBox()]);
			expect(b!.y).toBeLessThan(28);
			expect(b!.y + b!.height).toBeLessThanOrEqual(28.5);
			expect(p!.x + p!.width - (b!.x + b!.width)).toBeLessThan(16);
			await expect(chevron(page).locator("svg")).toHaveCount(1);
		}
		const bar = page.getByRole("separator", { name: "Resize the left panel" });
		await bar.focus();
		const before = (await chevron(page).boundingBox())!.x;
		for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
		expect((await chevron(page).boundingBox())!.x).toBeGreaterThan(before + 20);
	});

	test("the menu holds the project's name (quiet, not a control), Storytelling, the four tabs, a gap, Back Up Now and Change Project", async ({ page }) => {
		await openProject(page);
		await chevron(page).click();
		await expect(menu(page)).toBeVisible();
		const rows = await menu(page).getByRole("menuitem").allInnerTexts();
		expect(rows).toEqual(["Storytelling", "Codex", "Series", "Novel", "Archive", "Back Up Now", "Change Project"]);
		await expect(menu(page).locator(".sf-navmenu-name")).not.toHaveText("");
		await expect(menu(page).getByRole("separator")).toHaveCount(1);
		expect(await menu(page).evaluate((e) => { const s = getComputedStyle(e); return [s.borderTopWidth, s.backgroundColor]; })).toEqual(["0px", await page.evaluate(() => { const d = document.createElement("i"); d.style.background = "var(--purpose-raised-bg)"; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; })]);
	});

	test("where you are is green, on each side and each tab; every item does its job from both sides", async ({ page }) => {
		await openProject(page);
		const green = await accent(page);
		await chevron(page).click();
		await expect(item(page, "Storytelling")).toHaveCSS("color", green);
		await expect(item(page, "Codex")).not.toHaveCSS("color", green);
		await item(page, "Series").click();
		await expect(page.getByRole("tab", { name: "series", selected: true })).toBeVisible();
		await expect(page.locator(".sf-overview")).toBeVisible();
		await chevron(page).click();
		await expect(item(page, "Series")).toHaveCSS("color", green);
		await expect(item(page, "Storytelling")).not.toHaveCSS("color", green);
		await item(page, "Codex").click();
		await expect(page.getByRole("tab", { name: "codex", selected: true })).toBeVisible();
		await chevron(page).click();
		await item(page, "Archive").click();
		await expect(page.getByRole("tab", { name: "archive", selected: true })).toBeVisible();
		await chevron(page).click();
		await item(page, "Novel").click();
		await expect(page.getByRole("tab", { name: "novel", selected: true })).toBeVisible();
		await chevron(page).click();
		await item(page, "Storytelling").click();
		await expect(page.locator(".sf-nav-novel")).toBeVisible();
		await chevron(page).click(); // from the storytelling side to a tab
		await item(page, "Archive").click();
		await expect(page.getByRole("tab", { name: "archive", selected: true })).toBeVisible();
	});

	test("Back Up Now does what File's does; Change Project closes through the normal close and reaches the start screen", async ({ page }) => {
		await openProject(page);
		await chevron(page).click();
		await item(page, "Back Up Now").click();
		await expect(page.getByText(/Backed up \d+ files/)).toBeVisible();
		await chevron(page).click();
		await item(page, "Change Project").click();
		await expect(page.getByRole("button", { name: "Open Project…" })).toBeVisible();
		await expect(page.locator(".sf-left")).toHaveCount(0);
	});

	test("in a read-only project Back Up Now is greyed out with the reason", async ({ page }) => {
		await openProject(page, true);
		await chevron(page).click();
		await expect(item(page, "Back Up Now")).toBeDisabled();
		await expect(item(page, "Back Up Now")).toHaveAttribute("title", "This project is open read-only.");
		await expect(item(page, "Change Project")).toBeEnabled();
	});

	test("keys: ↓ and ↑ move, Return chooses, Escape closes and returns focus to the chevron, with its ring", async ({ page }) => {
		await openProject(page);
		await chevron(page).focus();
		await page.keyboard.press("Enter");
		await expect(item(page, "Storytelling")).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(item(page, "Codex")).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await expect(item(page, "Storytelling")).toBeFocused();
		await page.keyboard.press("End");
		await expect(item(page, "Change Project")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(menu(page)).toHaveCount(0);
		await expect(chevron(page)).toBeFocused();
		expect(await outline(chevron(page))).not.toBe("none");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await expect(page.getByRole("tab", { name: "codex", selected: true })).toBeVisible();
	});

	test("a click outside closes it", async ({ page }) => {
		await openProject(page);
		await chevron(page).click();
		await page.locator(".sf-slot--centre").click({ position: { x: 300, y: 300 } });
		await expect(menu(page)).toHaveCount(0);
	});
});

test.describe("focus rings are for the keyboard", () => {
	test("clicking the chevron, the selector, a chapter and a Codex row shows no ring; Tab and Escape do", async ({ page }) => {
		await openProject(page);
		const selector = page.getByRole("button", { name: "Chapters" });
		await selector.click();
		expect(await outline(selector)).toBe("none");
		await page.locator(".sf-nav-row", { hasText: "Chapter 2" }).click();
		await expect(page.locator(".sf-nav-current-title")).toHaveText("Chapter 2");
		expect(await outline(selector)).toBe("none"); // the redraw gave it focus again after the click
		await selector.click();
		await page.keyboard.press("Escape");
		await expect(selector).toBeFocused();
		expect(await outline(selector)).not.toBe("none"); // Escape is the keyboard
		await page.locator(".sf-codex-file").first().click();
		expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe("none");
		await chevron(page).click();
		expect(await outline(chevron(page))).toBe("none");
		await page.keyboard.press("Escape");
		expect(await outline(chevron(page))).not.toBe("none");
	});
});

test.describe("the chapter list's rows, the add button and the title bar", () => {
	test("rows are 6px in from the dropdown's edges with 4px corners and a Codex row's 3px padding; the add row is centred, its icon 1em", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).click();
		const list = page.locator(".sf-nav-list");
		const row = page.locator(".sf-nav-row").first();
		const [l, r] = await Promise.all([list.boundingBox(), row.boundingBox()]);
		expect(r!.x - l!.x).toBeCloseTo(6, 0);
		expect(l!.x + l!.width - (r!.x + r!.width)).toBeCloseTo(6, 0);
		const s = await row.evaluate((e) => { const c = getComputedStyle(e); return [c.paddingTop, c.paddingBottom, c.borderTopLeftRadius]; });
		expect(s).toEqual(["3px", "3px", "4px"]);
		const add = page.getByRole("button", { name: "Add the next chapter" });
		const [a, i, size] = await Promise.all([add.boundingBox(), add.locator("svg").boundingBox(), add.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))]);
		expect(i!.width).toBeCloseTo(size, 0);
		expect(i!.x + i!.width / 2).toBeCloseTo(a!.x + a!.width / 2, 0);
	});

	test("the title bar is an empty draggable band the traffic lights sit in; the panels run to the top; nothing interactive sits under it", async ({ page }) => {
		await openProject(page);
		const bar = page.locator(".sf-titlebar");
		await expect(bar).toHaveAttribute("data-tauri-drag-region", "");
		const b = (await bar.boundingBox())!;
		expect([b.x, b.y, b.height]).toEqual([0, 0, 28]);
		expect(b.width).toBe(1280);
		for (const sel of [".sf-left", ".sf-slot--lore", ".sf-centre-wrap"]) expect((await page.locator(sel).boundingBox())!.y, sel).toBe(0);
		expect(await bar.evaluate((e) => e.children.length)).toBe(0);
		const under = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("button, [tabindex], input, textarea, .cm-content, a")).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top < 28 && !e.classList.contains("sf-navmenu-button") && !e.classList.contains("sf-splitter") && !e.closest(".sf-notice,.sf-visually-hidden"); }).map((e) => e.className));
		expect(under).toEqual([]);
	});

	test("one top line: the series name, the context card, the workspace's first line and (on the library side) its first tab start at the same height", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await expect(page.locator(".sf-lore-host > .sf-editor-pane")).toBeVisible();
		const top = (sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top);
		const want = await top(".sf-nav-series");
		expect(want).toBeCloseTo(48, 0);
		expect(await top(".sf-lore-host > .sf-editor-pane")).toBeCloseTo(want, 0);
		expect(await top(".sf-slot--centre .cm-line")).toBeCloseTo(want, 0);
		await flipFace(page);
		expect(await top(".sf-tab")).toBeCloseTo(want, 0);
	});
});
