import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 11, commit 7: the project name and the novel's title in the green accent, as text only (decisions 62 and 64).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const accent = (page: Page) => page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--purpose-accent)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
const look = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => { const s = getComputedStyle(e); return { color: s.color, bg: s.backgroundColor, border: s.borderTopWidth, outline: s.outlineStyle }; });

test.describe("the titles", () => {
	test("on the storytelling side the project name and the novel's title are green text, with no border or box", async ({ page }) => {
		await openProject(page);
		const want = await accent(page);
		for (const sel of [".sf-left-name", ".sf-nav-novel"]) {
			const l = await look(page.locator(sel));
			expect(l, sel).toEqual({ color: want, bg: "rgba(0, 0, 0, 0)", border: "0px", outline: "none" });
		}
	});

	test("on the library side the project name and the other titles are as they were", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Flip side" }).click();
		await expect(page.locator(".sf-left[data-face='storyforge']")).toBeVisible();
		const want = await accent(page);
		expect((await look(page.locator(".sf-left-name"))).color).not.toBe(want);
		await page.getByRole("tab", { name: "novel" }).click();
		for (const sel of [".sf-left-body .sf-pane-title", ".sf-left-body h2", ".sf-left-body h3"]) {
			const n = await page.locator(sel).count();
			for (let i = 0; i < n; i++) expect((await look(page.locator(sel).nth(i))).color, sel).not.toBe(want);
		}
	});
});
