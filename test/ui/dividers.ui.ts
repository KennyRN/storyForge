import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 11, commit 3: no dividing lines between the app's parts (decision 62, rulings in decision 64).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const sides = ["Top", "Right", "Bottom", "Left"] as const;
const lines = (page: Page, sel: string) =>
	page.locator(sel).first().evaluate((el, s) => { const c = getComputedStyle(el); return s.filter((x) => parseFloat((c as any)[`border${x}Width`]) > 0 && (c as any)[`border${x}Style`] !== "none" && (c as any)[`border${x}Color`] !== "rgba(0, 0, 0, 0)"); }, [...sides]);

test.describe("no dividing lines", () => {
	test("none between the navigator, the Codex, the stats and the left panel's header", async ({ page }) => {
		await openProject(page);
		for (const sel of [".sf-navigator", ".sf-stats", ".sf-left-header"]) expect(await lines(page, sel), sel).toEqual([]);
	});

	test("the splitters draw no line at rest or on hover, only the resize cursor; the green line is for the keyboard", async ({ page }) => {
		await openProject(page);
		const bar = page.getByRole("separator", { name: "Resize the left panel" });
		const bg = () => bar.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(await bg()).toBe("rgba(0, 0, 0, 0)");
		const box = (await bar.boundingBox())!;
		await page.mouse.move(box.x, box.y + 200);
		expect(await bg()).toBe("rgba(0, 0, 0, 0)");
		expect(await bar.evaluate((el) => getComputedStyle(el).cursor)).toBe("col-resize");
		await bar.focus();
		await page.keyboard.press("ArrowRight");
		expect(await bg()).not.toBe("rgba(0, 0, 0, 0)");
	});

	test("the library rail's edge is transparent but keeps its width, so the ink indicator stays put", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: /flip side/i }).first().click();
		const rail = page.locator(".sf-rail");
		await expect(rail).toBeVisible();
		const c = await rail.evaluate((el) => { const s = getComputedStyle(el); return { w: parseFloat(s.borderRightWidth), color: s.borderRightColor }; });
		expect(c.w).toBe(1);
		expect(c.color).toBe("rgba(0, 0, 0, 0)");
	});
});
