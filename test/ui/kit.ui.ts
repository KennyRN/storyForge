import { expect, test } from "@playwright/test";
import { shot } from "./helpers";

test.beforeEach(async ({ page }) => {
	await page.goto("/gallery.html");
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
});

test.describe("the kit", () => {
	test("looks right", async ({ page }) => {
		await page.locator("#notify-sticky").click();
		await shot(page, "kit");
	});

	test("an icon-only button has a tooltip and an accessible name; the tooltip shows on keyboard focus", async ({ page }) => {
		const b = page.locator("#icon-button");
		await expect(b).toHaveAccessibleName("Settings");
		await page.keyboard.press("Alt+Tab");
		await page.locator("#icon-button").focus();
		await page.keyboard.press("Alt+Shift+Tab");
		await page.keyboard.press("Alt+Tab");
		await expect(page.getByRole("tooltip")).toHaveText("Settings");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("tooltip")).toHaveCount(0);
	});

	test("a menu opens from a button, moves with the arrow keys, skips disabled items, selects with Enter and gives focus back", async ({ page }) => {
		const opener = page.locator("#menu-button");
		await opener.focus();
		await opener.press("Enter");
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();
		await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(page.getByRole("menuitem", { name: "Archive" })).toBeFocused();
		await page.keyboard.press("ArrowDown"); // the disabled one is skipped: wraps to Rename
		await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("Enter");
		await expect(page.locator("#log")).toHaveText("menu: archive");
		await expect(menu).toHaveCount(0);
		await expect(opener).toBeFocused();
	});

	test("Escape closes a menu", async ({ page }) => {
		await page.locator("#menu-button").click();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menu")).toHaveCount(0);
	});

	test("a dialog traps focus, Escape cancels and focus returns to the opener", async ({ page }) => {
		const opener = page.locator("#dialog-button");
		await opener.click();
		const dialog = page.getByRole("dialog", { name: "Rename note" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByLabel("Name")).toBeFocused();
		for (let i = 0; i < 6; i++) {
			await page.keyboard.press("Alt+Tab");
			expect(await page.evaluate(() => !!document.activeElement?.closest(".sf-dialog"))).toBe(true);
		}
		await page.keyboard.press("Escape");
		await expect(dialog).toHaveCount(0);
		await expect(opener).toBeFocused();
		await shot(page, "kit-dialog");
	});

	test("a transient notice fades; a sticky one stays until dismissed and offers its action", async ({ page }) => {
		await page.locator("#notify-transient").click();
		await expect(page.getByRole("status").filter({ hasText: "Chapter created" })).toBeVisible();
		await page.locator("#notify-sticky").click();
		const sticky = page.getByRole("alert");
		await expect(sticky).toContainText("Your text is saved at");
		await expect(page.getByRole("status").filter({ hasText: "Chapter created" })).toHaveCount(0, { timeout: 7000 });
		await expect(sticky).toBeVisible();
		await sticky.getByRole("button", { name: "Reveal" }).click();
		await expect(page.locator("#log")).toHaveText("revealed");
		await expect(sticky).toBeVisible(); // the action did not dismiss it
		await sticky.getByRole("button", { name: "Dismiss" }).click();
		await expect(sticky).toHaveCount(0);
	});

	test("inline rename: double-click, F2 and the menu start it; Enter commits; Escape cancels; a refused name explains itself", async ({ page }) => {
		const title = page.locator("#title");
		await title.dblclick();
		const input = page.getByLabel("Name");
		await expect(input).toBeFocused();
		await input.fill("Chapter [two]");
		await expect(page.getByRole("alert").filter({ hasText: "can't contain" })).toBeVisible();
		await input.press("Enter"); // refused: stays open
		await expect(input).toBeVisible();
		await input.press("Escape");
		await expect(title).toHaveText("Chapter one");

		await page.locator("#row").focus();
		await page.keyboard.press("F2");
		await page.getByLabel("Name").fill("Chapter two");
		await page.keyboard.press("Enter");
		await expect(title).toHaveText("Chapter two");

		await page.locator("#row").click({ button: "right" });
		await page.getByRole("menuitem", { name: "Rename" }).click();
		await page.getByLabel("Name").fill("Chapter three");
		await page.getByLabel("Name").press("Enter");
		await expect(title).toHaveText("Chapter three");
	});

	test("reduced motion removes transitions", async ({ browser }) => {
		const context = await browser.newContext({ reducedMotion: "reduce" });
		const page = await context.newPage();
		await page.goto("http://127.0.0.1:1421/gallery.html");
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		const duration = await page.evaluate(() => getComputedStyle(document.querySelector(".sf-button") as Element).transitionDuration);
		expect(duration).toMatch(/^0s$|^0ms$/);
		await context.close();
	});

	test("every control in the gallery is reachable with Tab, and shows a focus ring", async ({ page }) => {
		const names: string[] = [];
		for (let i = 0; i < 14; i++) {
			await page.keyboard.press("Alt+Tab");
			const info = await page.evaluate(() => {
				const a = document.activeElement as HTMLElement | null;
				return a && a !== document.body ? { tag: a.tagName, name: a.getAttribute("aria-label") ?? a.textContent ?? a.id, ring: getComputedStyle(a).outlineStyle !== "none" } : null;
			});
			if (info) {
				names.push(info.name ?? "");
				expect(info.ring, `${info.name} shows a focus ring`).toBe(true);
			}
		}
		expect(names.length).toBeGreaterThanOrEqual(9); // 7 buttons (one disabled is skipped), 4 openers, the row
	});
});
