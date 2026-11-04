import { expect, test, type Locator, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 14, commit 3 (§1.4): the cover is a button. With a cover, it opens a small floating menu (Change Cover…, Remove Cover), by
// mouse and keyboard; with none, clicking the empty box chooses one. The "Remove cover" link is gone. The series cover works the same way.

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const BOOK_A = "_story-library/novel-aaa.md";
const SERIES = "_story-library/series.md";

async function openTab(page: Page, tab: "novel" | "series"): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await page.getByRole("tab", { name: tab }).click();
}
const novelCover = (page: Page) => page.getByRole("region", { name: "Novel overview" }).locator('[data-cover="book:aaa"]');
const seriesCover = (page: Page) => page.getByRole("region", { name: "Series overview" }).locator('[data-cover="series"]');
const menu = (page: Page) => page.getByRole("menu");
const read = (page: Page, f: string) => page.evaluate((x) => window.__preview.read(x), f);
const css = (l: Locator, props: string[]) => l.evaluate((e, p) => { const s = getComputedStyle(e); return p.map((k) => s.getPropertyValue(k)); }, props);

for (const which of ["novel", "series"] as const) {
	const cover = which === "novel" ? novelCover : seriesCover;
	const file = which === "novel" ? BOOK_A : SERIES;
	const png = which === "novel" ? "_backstage/storyforge/aaa/cover.png" : "_backstage/storyforge/_series/cover.png";
	test.describe(`the ${which} cover`, () => {
		test.beforeEach(async ({ page }) => openTab(page, which));

		test("is a button named for what it does, with a menu behind it; no Remove cover link", async ({ page }) => {
			const box = cover(page);
			await expect(box).toHaveAttribute("aria-haspopup", "menu");
			// the fixture's cover is not a picture the window can draw: a recorded cover that is not on screen says so (the cover-smoke script relies on it)
			await expect(box).toHaveAttribute("aria-label", /^Change or remove the cover of .* \(no picture is shown\)$/);
			await expect(page.getByRole("button", { name: /^Remove (the )?cover/i })).toHaveCount(0);
			await expect(page.getByText("Remove cover", { exact: true })).toHaveCount(0);
			await box.click();
			await expect(menu(page)).toBeVisible();
			await expect(menu(page).getByRole("menuitem")).toHaveText(["Change Cover…", "Remove Cover"]);
			await expect(menu(page)).toHaveAccessibleName(/^Cover of /);
		});

		test("a recorded cover that is drawn is named without the 'no picture' note", async ({ page }) => {
			await page.evaluate((b) => window.__preview.armCover(b), ONE_PIXEL_PNG);
			await cover(page).click();
			await page.getByRole("menuitem", { name: "Change Cover…" }).click();
			await expect(cover(page)).toHaveAttribute("data-state", "image");
			await expect(cover(page)).toHaveAttribute("aria-label", /^Change or remove the cover of (?!.*no picture is shown)/);
		});

		test("the menu follows the default rules: no border, the shared shadow, muted rows, the highlighted row an accent block", async ({ page }) => {
			await cover(page).click();
			const m = menu(page);
			const shadow = await page.evaluate(() => { const d = document.createElement("i"); d.style.boxShadow = "var(--floating-shadow)"; document.body.append(d); const v = getComputedStyle(d).boxShadow; d.remove(); return v; });
			const [border, boxShadow] = await css(m, ["border-top-width", "box-shadow"]);
			expect(border).toBe("0px");
			expect(boxShadow).toBe(shadow);
			const probe = (v: string, prop: string) => page.evaluate(([x, p]) => { const d = document.createElement("i"); (d.style as unknown as Record<string, string>)[p] = x; document.body.append(d); const c = getComputedStyle(d).getPropertyValue(p === "backgroundColor" ? "background-color" : "color"); d.remove(); return c; }, [v, prop]);
			const muted = await probe("var(--purpose-text-muted)", "color");
			const accent = await probe("var(--purpose-accent)", "backgroundColor");
			const surface = await probe("var(--purpose-raised-bg)", "color");
			const rows = m.getByRole("menuitem");
			await page.mouse.move(0, 0); // nothing highlighted
			await rows.nth(1).evaluate((e) => (e as HTMLElement).blur());
			expect((await css(rows.nth(1), ["color"]))[0]).toBe(muted);
			await rows.nth(1).hover();
			expect((await css(rows.nth(1), ["background-color", "color"]))).toEqual([accent, surface]);
		});

		test("by mouse: Change Cover… asks for a picture and records it, the old cover retired to .trash", async ({ page }) => {
			await page.evaluate((b) => window.__preview.armCover(b), ONE_PIXEL_PNG);
			await cover(page).click();
			await page.getByRole("menuitem", { name: "Change Cover…" }).click();
			await expect(cover(page)).toHaveAttribute("data-state", "image");
			await expect.poll(() => read(page, file)).toContain("cover-image: cover.png");
		});

		test("by mouse: Remove Cover clears the key and retires the file to .trash, with no confirmation; the empty box then chooses directly", async ({ page }) => {
			await cover(page).click();
			await page.getByRole("menuitem", { name: "Remove Cover" }).click();
			await expect(page.getByRole("dialog")).toHaveCount(0); // recoverable, so no confirmation
			await expect.poll(() => read(page, file)).not.toContain("cover-image");
			await expect(cover(page)).toHaveAttribute("aria-label", /^Choose a cover for /);
			await expect(cover(page)).not.toHaveAttribute("aria-haspopup", "menu");
			// no cover: a click chooses one through the open panel, with no menu
			await page.evaluate((b) => window.__preview.armCover(b), ONE_PIXEL_PNG);
			await cover(page).click();
			await expect(menu(page)).toHaveCount(0);
			await expect(cover(page)).toHaveAttribute("data-state", "image");
			await expect.poll(() => read(page, file)).toContain("cover-image: cover.png");
		});

		test("by keyboard: Return on the cover opens the menu on its first row, the arrows move, Escape closes and returns to the cover", async ({ page }) => {
			const box = cover(page);
			await box.focus();
			await page.keyboard.press("Enter");
			await expect(menu(page)).toBeVisible();
			await expect(menu(page).getByRole("menuitem", { name: "Change Cover…" })).toBeFocused();
			await page.keyboard.press("ArrowDown");
			await expect(menu(page).getByRole("menuitem", { name: "Remove Cover" })).toBeFocused();
			await page.keyboard.press("ArrowUp");
			await expect(menu(page).getByRole("menuitem", { name: "Change Cover…" })).toBeFocused();
			await page.keyboard.press("Escape");
			await expect(menu(page)).toHaveCount(0);
			await expect(box).toBeFocused();
			await page.keyboard.press("Space");
			await expect(menu(page)).toBeVisible(); // Space opens it too
			await page.keyboard.press("Escape");
		});

		test("by keyboard: Remove Cover with the arrows and Return", async ({ page }) => {
			await cover(page).focus();
			await page.keyboard.press("Enter");
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press("Enter");
			await expect.poll(() => read(page, file)).not.toContain("cover-image");
			await expect(page.evaluate((p) => window.__preview.readBase64(p), png).then(() => "present", () => "gone")).resolves.toBe("gone");
		});

		test("a click outside closes the menu and changes nothing", async ({ page }) => {
			const before = await read(page, file);
			await cover(page).click();
			await expect(menu(page)).toBeVisible();
			await page.mouse.click(5, 5);
			await expect(menu(page)).toHaveCount(0);
			expect(await read(page, file)).toBe(before);
		});
	});
}
