import { expect, test, type Page } from "@playwright/test";
import { openPreview, shot } from "./helpers";

// Brief 10, commit 5: the context panel's card and bottom row (docs/look.md §3.3).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const panel = (page: Page) => page.locator(".sf-slot--lore");
const card = (page: Page) => page.locator(".sf-lore-host > .sf-editor-pane");
const row = (page: Page) => page.locator(".sf-context-row");
const openNote = async (page: Page, name = "Jane") => {
	await page.locator(".sf-codex-tree [data-key]").filter({ hasText: name }).first().click();
	await expect(card(page)).toBeVisible();
	await expect(page.locator(".sf-slot--lore .cm-content")).toBeVisible();
};
const rect = (loc: ReturnType<typeof panel>) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });

test.describe("the context panel's card", () => {
	test("a note sits on a card: the editor's own background, rounded corners, inside the panel's", async ({ page }) => {
		await openProject(page);
		await openNote(page);
		const c = await card(page).evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius), overflow: s.overflow }; });
		const [panelBg, editorBg] = await Promise.all([panel(page).evaluate((el) => getComputedStyle(el).backgroundColor), page.locator(".sf-slot--centre").evaluate((el) => getComputedStyle(el).backgroundColor)]);
		expect(c.bg).toBe(editorBg);
		expect(c.bg).not.toBe(panelBg);
		expect(c.radius).toBeGreaterThanOrEqual(6);
		expect(c.overflow).toBe("hidden"); // the corners clip the note
		await shot(page, "look-card");
	});

	test("the margin is 10% of the panel's width on the left, right and top, and follows a resize; the bottom row sits directly beneath the card, which ends 12px above where the stats section starts (decision 93)", async ({ page }) => {
		await openProject(page);
		await openNote(page);
		for (const grow of [0, 60]) {
			if (grow) {
				const bar = page.getByRole("separator", { name: "Resize the context panel" });
				await bar.focus();
				for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowLeft"); // wider (the bar is on the panel's left)
			}
			const [p, c, r] = await Promise.all([rect(panel(page)), rect(card(page)), rect(row(page))]);
			const m = Math.max(12, p.w * 0.1);
			expect(c.x - p.x, "left").toBeCloseTo(m, 0);
			expect(p.r - c.r, "right").toBeCloseTo(m, 0);
			expect(c.y - p.y, "top").toBeCloseTo(m, 0);
			expect(r.y - c.b, "the bottom row is directly beneath the card").toBeCloseTo(0, 0);
			expect(p.b - c.b, "bottom: the stats section's height and 12px").toBeCloseTo(64 + 12, 0);
		}
	});

	test("a narrow panel keeps a margin of 12px, not 10%", async ({ page }) => {
		await openProject(page);
		await openNote(page);
		await panel(page).evaluate((el) => ((el as HTMLElement).style.width = "100px")); // narrower than the panel can be dragged: the rule itself
		const [p, c] = await Promise.all([rect(panel(page)), rect(card(page))]);
		expect(p.w).toBeCloseTo(100, 0);
		expect(c.x - p.x).toBeCloseTo(12, 0);
		expect(p.r - c.r).toBeCloseTo(12, 0);
	});

	test("with no note open there is no card, and the bottom row is still there", async ({ page }) => {
		await openProject(page);
		await expect(card(page)).toHaveCount(0);
		await expect(page.locator(".sf-lore-host")).toBeEmpty();
		await expect(row(page)).toBeVisible();
		await openNote(page);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click(); // a second click closes it
		await expect(card(page)).toHaveCount(0);
		await expect(row(page)).toBeVisible();
		const [p, r] = await Promise.all([rect(panel(page)), rect(row(page))]);
		expect(p.b - r.b).toBeLessThanOrEqual(1); // the row is the foot of the panel
	});

	test("the bottom row is below the card and the button is in it", async ({ page }) => {
		await openProject(page);
		const button = page.getByRole("button", { name: "Special characters", exact: true });
		await expect(button).toBeVisible();
		const [r, b] = await Promise.all([rect(row(page)), button.boundingBox()]);
		expect(b!.y).toBeGreaterThanOrEqual(r.y);
		expect(b!.y + b!.height).toBeLessThanOrEqual(r.b + 1);
		await openNote(page);
		const [c, r2] = await Promise.all([rect(card(page)), rect(row(page))]);
		expect(c.b).toBeLessThanOrEqual(r2.y);
	});

	test("the note scrolls inside the card, which keeps its size, and its text wraps to the card's width", async ({ page }) => {
		await openProject(page);
		await openNote(page);
		const before = await rect(card(page));
		const content = page.locator(".sf-slot--lore .cm-content");
		await content.click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.insertText(`\n${"A_very_long_unbroken_word_that_has_to_wrap_somewhere ".repeat(4)}\n${"line\n".repeat(80)}`);
		const m = await page.locator(".sf-slot--lore .cm-scroller").evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight + 50, wide: el.scrollWidth > el.clientWidth + 1 }));
		expect(m.scrolls).toBe(true);
		expect(m.wide).toBe(false); // wrapped, not sideways
		expect(await rect(card(page))).toEqual(before);
	});

	test("a read-only note (a project made by a newer storyForge) keeps its banner, inside the card", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await openNote(page);
		await expect(card(page).locator(".sf-editor-banner")).toBeVisible();
		await expect(page.locator(".sf-slot--lore .cm-content")).toHaveAttribute("contenteditable", "false");
		const [c, b] = await Promise.all([rect(card(page)), card(page).locator(".sf-editor-banner").evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.y, x: r.x, r: r.right }; })]);
		expect(b.y).toBeGreaterThanOrEqual(c.y);
		expect(b.x).toBeGreaterThanOrEqual(c.x - 1);
		expect(b.r).toBeLessThanOrEqual(c.r + 1);
	});
});
