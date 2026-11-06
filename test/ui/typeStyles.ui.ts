import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 18 (decision 123): the two base fonts, the type styles and Settings ▸ Appearance in three groups.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const dialog = (page: Page) => page.getByRole("dialog");
const subtab = (page: Page, name: string) => dialog(page).locator(".sf-settings-subtabs").getByRole("tab", { name, exact: true });
async function openAppearance(page: Page, sub?: string): Promise<void> {
	await openSettingsDialog(page);
	await dialog(page).getByRole("tab", { name: "Appearance", exact: true }).click();
	if (sub) await subtab(page, sub).click();
}
const projectMd = (page: Page) => page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md").catch(() => ""));
const look = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { const s = getComputedStyle(e); return { family: s.fontFamily, weight: s.fontWeight, size: s.fontSize }; });

test.describe("type styles", () => {
	test("Appearance is one entry with five sub-pages, opening on Interface: System; each names its styles", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const subs = dialog(page).locator(".sf-settings-subtabs").getByRole("tab");
		expect(await subs.allInnerTexts()).toEqual(["Interface: System", "Interface: Display text", "Navigator", "Writing", "Text colours"]);
		await expect(subtab(page, "Interface: System")).toHaveAttribute("aria-selected", "true");
		await expect(dialog(page).getByRole("tab", { name: "Appearance", exact: true })).toHaveCount(1);
		const wanted: Record<string, string[]> = {
			"Interface: System": ["Body", "Body bold", "Small heading", "Hint"],
			"Interface: Display text": ["Title", "Heading", "Bar name"],
			Writing: ["Prose", "Reading", "Fields"],
		};
		for (const [sub, names] of Object.entries(wanted)) {
			await subtab(page, sub).click();
			for (const name of names) await expect(dialog(page).getByLabel(`${name} font`, { exact: true }), `${sub}: ${name}`).toHaveCount(1);
			await expect(dialog(page).getByLabel("Display font", { exact: true })).toHaveCount(0); // the start screen only: no project is open there
		}
		await subtab(page, "Interface: System").click();
		await expect(dialog(page).getByLabel("Interface font", { exact: true })).toHaveValue("SN Pro");
		await subtab(page, "Writing").click();
		await expect(dialog(page).getByLabel("Writing font", { exact: true })).toHaveValue("SN Pro");
		await expect(dialog(page).getByLabel("Fields size (px)", { exact: true })).toHaveValue("14");
		await subtab(page, "Interface: Display text").click();
		await expect(dialog(page).getByLabel("Bar name weight", { exact: true })).toHaveCount(0); // fixed: the font only
		expect(await projectMd(page)).toBe("");
	});

	test("the arrow keys move between the sub-page buttons; choosing one starts it at the top; the row stays put while the page scrolls", async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 520 });
		await openProject(page);
		await openAppearance(page);
		const first = subtab(page, "Interface: System");
		await first.focus();
		await page.keyboard.press("ArrowRight");
		await expect(subtab(page, "Interface: Display text")).toBeFocused();
		await expect(subtab(page, "Interface: Display text")).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ArrowLeft");
		await expect(subtab(page, "Text colours")).toBeFocused(); // wraps
		await subtab(page, "Writing").click();
		const pane = dialog(page).locator(".sf-settings-page");
		await pane.evaluate((e) => (e.scrollTop = 200));
		const row = dialog(page).locator(".sf-settings-subtabs");
		const top = (await row.boundingBox())!.y;
		await pane.evaluate((e) => (e.scrollTop = 250));
		expect((await row.boundingBox())!.y).toBe(top);
		await subtab(page, "Navigator").click();
		expect(await dialog(page).locator(".sf-settings-page").evaluate((e) => e.scrollTop)).toBe(0);
	});

	test("each style's sample sits in its own column, to the right of its controls", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const controls = (await dialog(page).locator(".sf-style-controls").first().boundingBox())!;
		const sample = (await dialog(page).getByRole("img", { name: "Sample of the body style" }).boundingBox())!;
		expect(sample.x).toBeGreaterThanOrEqual(controls.x + controls.width);
		expect(sample.y).toBeGreaterThanOrEqual(controls.y - 1);
		expect(sample.y + sample.height).toBeLessThanOrEqual(controls.y + controls.height + 1);
	});

	test("the Interface font changes every style that follows it and none that names its own; the Writing font leaves the interface alone", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		await subtab(page, "Interface: Display text").click();
		await dialog(page).getByLabel("Heading font", { exact: true }).selectOption("Courier Prime"); // names its own
		await subtab(page, "Interface: System").click();
		await dialog(page).getByLabel("Interface font", { exact: true }).selectOption("Aleo");
		await expect.poll(async () => (await look(page, "body")).family).toContain("Aleo");
		expect((await look(page, ".sf-dialog-title")).family).toContain("Courier Prime");
		expect((await look(page, ".sf-editor .cm-content")).family).toContain("SN Pro");
		await subtab(page, "Writing").click();
		await dialog(page).getByLabel("Writing font", { exact: true }).selectOption("Atkinson Hyperlegible Next");
		await expect.poll(async () => (await look(page, ".sf-editor .cm-content")).family).toContain("Atkinson Hyperlegible Next");
		expect((await look(page, "body")).family).toContain("Aleo");
		await expect.poll(() => projectMd(page)).toContain("appearance-writing-font: Atkinson Hyperlegible Next");
	});

	test("a size is a slider over its style's range: a drag previews and writes nothing, release writes once", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const body = dialog(page).getByLabel("Body size (px)", { exact: true });
		await expect(body).toHaveAttribute("min", "11");
		await expect(body).toHaveAttribute("max", "16");
		const value = dialog(page).locator('section[aria-label="Appearance: Body"]').getByText(/ px$/);
		await expect(value).toHaveText("13 px");
		await body.evaluate((e: HTMLInputElement) => { e.value = "15"; e.dispatchEvent(new Event("input", { bubbles: true })); });
		await expect(value).toHaveText("15 px");
		expect((await look(page, ".sf-settings-tab")).size).toBe("15px"); // the page previews
		expect(await projectMd(page)).toBe("");
		await body.evaluate((e: HTMLInputElement) => e.dispatchEvent(new Event("change", { bubbles: true })));
		await expect.poll(() => projectMd(page)).toContain("appearance-body-size: 15");
		await body.evaluate((e: HTMLInputElement) => { e.value = "40"; });
		expect(await body.inputValue()).toBe("16"); // nothing outside the range can be set
	});

	test("the weights offered are the resolved family's own, and Body bold is its own style", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		await expect(dialog(page).getByLabel("Body bold weight", { exact: true })).toHaveValue("600");
		await dialog(page).getByLabel("Body bold font", { exact: true }).selectOption("Courier Prime");
		await expect.poll(async () => dialog(page).getByLabel("Body bold weight", { exact: true }).locator("option").allInnerTexts()).toEqual(["Regular (400)", "Bold (700)"]);
	});

	test("a sample of each style is drawn as it will be", async ({ page }) => {
		await openProject(page);
		await openAppearance(page, "Interface: Display text");
		const sample = dialog(page).getByRole("img", { name: "Sample of the title style" });
		await expect(sample).toBeVisible();
		expect((await sample.evaluate((e) => getComputedStyle(e).fontSize))).toBe("20px");
		void flipFace;
	});

	test("Settings scrolls on the right only; the page keeps its place through a redraw and a new section starts at the top", async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 520 });
		await openProject(page);
		await openAppearance(page);
		const pane = dialog(page).locator(".sf-settings-page");
		const tabs = dialog(page).locator(".sf-settings-tabs");
		expect(await pane.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
		expect(await dialog(page).locator(".sf-dialog-body").evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
		const tabTop = (await tabs.boundingBox())!.y;
		await pane.evaluate((e) => (e.scrollTop = 300));
		const held = await pane.evaluate((e) => e.scrollTop);
		expect(held).toBeGreaterThan(0);
		expect((await tabs.boundingBox())!.y).toBe(tabTop);
		await expect(dialog(page).getByRole("button", { name: "Done" })).toBeInViewport();
		// not fill(): Playwright scrolls the control into view first, which would move the page
		await dialog(page).getByLabel("Body size (px)", { exact: true }).evaluate((e: HTMLInputElement) => { e.value = "14"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); });
		await expect.poll(() => projectMd(page)).toContain("appearance-body-size: 14");
		expect(await pane.evaluate((e) => e.scrollTop)).toBe(held);
		await subtab(page, "Writing").click();
		expect(await dialog(page).locator(".sf-settings-page").evaluate((e) => e.scrollTop)).toBe(0);
	});
});
