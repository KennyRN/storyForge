import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 11, commit 2: scrollbars hidden at rest, a thin bar while scrolling (docs/look-2.md §6).

async function withScroller(page: Page): Promise<void> {
	await openPreview(page);
	await page.evaluate(() => {
		const box = document.createElement("div");
		box.id = "test-scroller";
		box.style.cssText = "position:fixed;top:40px;left:40px;width:200px;height:100px;overflow:auto;";
		box.innerHTML = '<div style="height:1000px"></div>';
		document.body.append(box);
	});
}
const bar = (page: Page) => page.locator(".sf-scrollbar");
const opacity = (page: Page) => bar(page).evaluate((el) => parseFloat(getComputedStyle(el).opacity));

test.describe("scrollbars", () => {
	test("the native bar is gone at rest, however much there is to scroll, and no bar shows before scrolling", async ({ page }) => {
		await withScroller(page);
		const box = page.locator("#test-scroller");
		expect(await box.evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth)).toBe(0);
		expect(await box.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe("none");
		await expect(bar(page)).toHaveCount(0);
	});

	test("a thin bar shows while scrolling, sized and placed by position, and is gone a little after", async ({ page }) => {
		await withScroller(page);
		await page.locator("#test-scroller").evaluate((el) => { el.scrollTop = 450; });
		await expect.poll(() => opacity(page)).toBeGreaterThan(0.3);
		const [b, s] = await Promise.all([bar(page).boundingBox(), page.locator("#test-scroller").boundingBox()]);
		expect(b!.width).toBeLessThanOrEqual(6);
		expect(b!.height).toBeLessThan(s!.height / 2);
		expect(b!.y).toBeGreaterThan(s!.y + 20); // half way down, not at the top
		expect(await bar(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
		await expect.poll(() => opacity(page), { timeout: 4000 }).toBe(0);
	});

	test("scrolling still works by the keyboard", async ({ page }) => {
		await withScroller(page);
		const box = page.locator("#test-scroller");
		await box.evaluate((el) => { el.tabIndex = 0; el.focus(); });
		await page.keyboard.press("PageDown");
		await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	});

	test("with reduced motion the bar goes without a fade", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await withScroller(page);
		await page.locator("#test-scroller").evaluate((el) => { el.scrollTop = 100; });
		await expect.poll(() => opacity(page)).toBeGreaterThan(0.3);
		expect(await bar(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
		await expect.poll(() => opacity(page), { timeout: 4000 }).toBe(0);
	});

	test("the editor's own scroller has no native bar", async ({ page }) => {
		await openPreview(page);
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		expect(await page.locator(".sf-editor .cm-scroller").first().evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe("none");
	});
});
