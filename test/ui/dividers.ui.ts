import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

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
	test("neither side has a header (the project's name is in the navigate menu)", async ({ page }) => {
		await openProject(page);
		await expect(page.locator(".sf-left-header")).toHaveCount(0);
		await flipFace(page);
		await expect(page.locator(".sf-left-header")).toHaveCount(0);
	});

	test("none between the navigator, the Codex, the stats and the left panel's header", async ({ page }) => {
		await openProject(page);
		for (const sel of [".sf-navigator", ".sf-stats"]) expect(await lines(page, sel), sel).toEqual([]);
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

	test("the library's tab row has no dividing line, and the left rail is gone", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		const rail = page.locator(".sf-rail");
		await expect(rail).toBeVisible();
		const c = await rail.evaluate((el) => { const s = getComputedStyle(el); return { w: parseFloat(s.borderRightWidth) + parseFloat(s.borderBottomWidth), flex: s.flexDirection }; });
		expect(c.w).toBe(0);
		expect(c.flex).toBe("row");
	});
});
