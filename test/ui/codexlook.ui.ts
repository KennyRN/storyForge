import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 11, commit 4: the Codex list refined (docs/look-2.md, decisions 62 and 65), on both sides. The fixture's Codex: Cast
// (Jane, Sam), Places (a folder that is also the note Harbour, and whose own order also lists Harbour), Windows, and others.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const SIDES = [
	{ name: "storytelling side", show: async (_p: Page) => {} },
	{ name: "library side", show: async (p: Page) => { await p.getByRole("button", { name: "Flip side" }).click(); await p.getByRole("tab", { name: "codex" }).click(); } },
];
const tree = (p: Page) => p.locator(".sf-codex-tree");
const row = (p: Page, name: string) => tree(p).locator('[role="treeitem"]').filter({ has: p.locator(".sf-codex-name", { hasText: new RegExp(`^${name}$`) }) });
const box = (l: Locator) => l.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width }; });

for (const side of SIDES) {
	test.describe(`the Codex list, ${side.name}`, () => {
		test.beforeEach(async ({ page }) => { await openProject(page); await side.show(page); });

		test("a note that is also a folder appears once, as the folder's row, and the folder then reads Empty", async ({ page }) => {
			await expect(row(page, "Harbour")).toHaveCount(1);
			await expect(row(page, "Harbour")).toHaveAttribute("aria-expanded", "true");
			await expect(tree(page).locator(".sf-codex-folder-empty")).toHaveCount(1);
		});

		test("no heading; the list is still named Codex", async ({ page }) => {
			await expect(page.locator(".sf-pane-title", { hasText: /codex/i })).toHaveCount(0);
			await expect(page.getByRole("tree", { name: "Codex" })).toBeVisible();
		});

		test("16 px text; icons are the text's colour", async ({ page }) => {
			expect(await tree(page).evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
			const [text, icon] = await row(page, "Jane").evaluate((e) => [getComputedStyle(e.querySelector(".sf-codex-name")!).color, getComputedStyle(e.querySelector("svg")!).color]);
			expect(icon).toBe(text);
		});

		test("the highlight is a block in the Codex colour with the panel's colour on it, for hover and selected alike", async ({ page }) => {
			const [codex, panel] = await tree(page).evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e.closest(".sf-left")!).backgroundColor]);
			const jane = row(page, "Jane");
			expect(await jane.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
			await jane.hover();
			const hovered = await jane.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color, getComputedStyle(e.querySelector("svg")!).color]);
			expect(hovered).toEqual([codex, panel, panel]);
			await jane.click();
			await page.mouse.move(0, 0);
			await expect(jane).toHaveAttribute("aria-selected", "true");
			expect(await jane.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color])).toEqual([codex, panel]);
		});

		test("a folder's line is flush with its name, and a nested row's highlight starts at that line", async ({ page }) => {
			const cast = row(page, "Cast");
			const nameX = (await box(cast.locator(".sf-codex-name"))).x;
			const lineLeft = await cast.locator("xpath=..").locator(".sf-codex-children").evaluate((e) => e.getBoundingClientRect().x + parseFloat(getComputedStyle(e, "::before").left));
			expect(lineLeft).toBeCloseTo(nameX, 0);
			const jane = (await box(row(page, "Jane"))).x;
			expect(jane - lineLeft).toBeGreaterThanOrEqual(0);
			expect(jane - lineLeft).toBeLessThanOrEqual(3);
			// a top-level row highlights from the list's own left edge
			expect((await box(row(page, "Windows"))).x).toBeCloseTo((await box(cast)).x, 0);
		});
	});
}
