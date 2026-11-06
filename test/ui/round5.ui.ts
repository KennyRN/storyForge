import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Look round five (1.10.0): General's sub-pages, Appearance's one-row-per-style layout, the rail's radius, no focus ring on the novel tab's writing fields, the Backups icon.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const dialog = (page: Page) => page.getByRole("dialog");
const sub = (page: Page, name: string) => dialog(page).locator(".sf-settings-subtabs").getByRole("tab", { name, exact: true });

test("Settings opens on General's first sub-page; General has general, story and this computer; each starts at the top", async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 440 });
	await openProject(page);
	await openSettingsDialog(page);
	await expect(sub(page, "general")).toHaveAttribute("aria-selected", "true");
	await expect(dialog(page).getByLabel("Opens in")).toBeVisible();
	expect(await dialog(page).locator(".sf-settings-subtabs").getByRole("tab").allInnerTexts()).toEqual(["general", "story", "this computer"]);
	await sub(page, "this computer").click();
	await expect(dialog(page).locator("section[aria-label='This computer, this project']")).toBeVisible();
	await dialog(page).locator(".sf-settings-page").evaluate((e) => (e.scrollTop = 50));
	await sub(page, "story").click();
	await expect(dialog(page).getByLabel("Series numbering")).toBeVisible();
	expect(await dialog(page).locator(".sf-settings-page").evaluate((e) => e.scrollTop)).toBe(0);
	// leaving General and coming back lands on its first sub-page again
	await dialog(page).getByRole("tab", { name: "Backups", exact: true }).click();
	await dialog(page).getByRole("tab", { name: "General", exact: true }).click();
	await expect(sub(page, "general")).toHaveAttribute("aria-selected", "true");
});

test("each Appearance style is one row of three columns aligned to the top: name, options (font and weight on one line, the size, the colours) and the preview", async ({ page }) => {
	await openProject(page);
	await openSettingsDialog(page);
	await dialog(page).getByRole("tab", { name: "Appearance", exact: true }).click();
	const y = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!;
	const d = dialog(page);
	const name = d.locator(".sf-grid-name", { hasText: /^small heading$/ });
	const options = d.getByLabel("small heading font", { exact: true }).locator("xpath=ancestor::div[contains(@class,'sf-grid-options')]");
	const prev = d.getByRole("img", { name: "Sample of the small heading style" });
	const [n, o, p] = [await y(name), await y(options), await y(prev)];
	expect(Math.abs(n.y - o.y)).toBeLessThan(10); // the name's text sits beside the first line of the options
	expect(Math.abs(p.y - o.y)).toBeLessThan(10);
	expect(p.x).toBeGreaterThan(o.x + o.width - 1); // the preview beside the whole stack
	const font = await y(d.getByLabel("small heading font", { exact: true }));
	const weight = await y(d.getByLabel("small heading weight", { exact: true }));
	const size = await y(d.getByLabel("small heading size (px)", { exact: true }));
	const swatches = await y(d.getByRole("radiogroup", { name: "small heading colour", exact: true }));
	expect(Math.abs(font.y - weight.y)).toBeLessThan(2); // font and weight on one line
	expect(size.y).toBeGreaterThan(font.y + font.height - 1);
	expect(swatches.y).toBeGreaterThan(size.y + size.height - 1);
	expect(Math.abs(swatches.x - font.x)).toBeLessThan(8);
	// no row for the dialog heading any more
	await expect(d.getByLabel("dialog heading font", { exact: true })).toHaveCount(0);
});

test("the rail has the bar's own corner radius, in the app and in the preview", async ({ page }) => {
	await openProject(page);
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	const radii = await page.locator(".sf-bar--chapter").first().evaluate((b) => [getComputedStyle(b.querySelector(".sf-bar-fill")!).borderTopLeftRadius, getComputedStyle(b.querySelector(".sf-bar-frame")!).borderTopLeftRadius]);
	expect(radii[1]).toBe(radii[0]);
	await openSettingsDialog(page);
	await dialog(page).getByRole("tab", { name: "Appearance", exact: true }).click();
	await sub(page, "library mode").click();
	const demo = dialog(page).getByRole("img", { name: "Sample of the data bar style" });
	const dr = await demo.evaluate((e) => [getComputedStyle(e.querySelector(".sf-bar-demo-fill")!).borderTopLeftRadius, getComputedStyle(e.querySelector(".sf-bar-demo-rail")!).borderTopLeftRadius]);
	expect(dr[1]).toBe(dr[0]);
});

test("the novel tab's plot note, synopsis and read-only chapter text draw no focus ring; the series description keeps its own", async ({ page }) => {
	await openProject(page);
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	const outline = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).outlineStyle);
	for (const [label, host, inner] of [
		["the synopsis", '[aria-label="Novel overview"] .sf-note-field', '[aria-label="Novel overview"] .sf-note-field .cm-content'],
		["the plot note", ".sf-ctx-plot .sf-note-field", ".sf-ctx-plot .sf-note-field .cm-content"],
		["the chapter's text", ".sf-chapter-text", ".sf-chapter-text .cm-content"],
	] as const) {
		await page.locator(inner).first().click();
		await expect(page.locator(host).first(), label).toBeVisible();
		expect(await outline(host), label).toBe("none");
	}
	await page.getByRole("tab", { name: "series" }).click();
	const desc = page.getByRole("region", { name: "Series overview" }).locator(".sf-note-field").first();
	await desc.locator(".cm-content").click();
	expect(await desc.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
});

test("Settings' left-hand list has Kenny's icons (Backups: the Back Up shield) before the text, in its row's colour, and the surface colour when selected", async ({ page }) => {
	await openProject(page);
	await openSettingsDialog(page);
	const tab = dialog(page).getByRole("tab", { name: "Backups", exact: true });
	await expect(tab.locator("svg")).toHaveCount(1);
	const icon = (await tab.locator("svg").boundingBox())!;
	const label = (await tab.locator(".sf-settings-tab-label").boundingBox())!;
	expect(icon.x + icon.width).toBeLessThanOrEqual(label.x + 1);
	const colour = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => getComputedStyle(e).color);
	expect(await colour(tab.locator("svg"))).toBe(await colour(tab));
	await tab.click();
	const surface = await page.evaluate(() => { const i = document.createElement("i"); i.style.color = "var(--purpose-raised-bg)"; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; });
	expect(await colour(tab.locator("svg"))).toBe(surface);
	expect(await colour(tab)).toBe(surface);
	for (const name of ["General", "Appearance", "Writing", "Sessions", "Backups"]) await expect(dialog(page).getByRole("tab", { name, exact: true }).locator("svg"), name).toHaveCount(1); // every entry has Kenny's icon
});

test("no page of Settings has a header inside it, and Writing has four sub-pages", async ({ page }) => {
	await openProject(page);
	await openSettingsDialog(page);
	const subs: Record<string, string[]> = { General: ["general", "story", "this computer"], Appearance: ["interface", "library mode", "storytelling mode", "writing"], Writing: ["typing behaviours", "names", "shortcodes", "special characters"], Sessions: [], Backups: [] };
	for (const [top, list] of Object.entries(subs)) {
		await dialog(page).getByRole("tab", { name: top, exact: true }).click();
		if (top === "Writing") expect(await dialog(page).locator(".sf-settings-subtabs").getByRole("tab").allInnerTexts()).toEqual(list);
		for (const s of list.length ? list : [""]) {
			if (s) await sub(page, s).click();
			await expect(dialog(page).locator(".sf-settings-page").getByRole("heading"), `${top} ${s}`).toHaveCount(0);
			await expect(dialog(page).locator(".sf-settings-page .sf-summary-title"), `${top} ${s}`).toHaveCount(0);
		}
	}
});
