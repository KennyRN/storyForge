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
	test("Appearance is one entry with four sub-pages, opening on interface; each names its styles; Body bold has only a weight, Bar name only a font", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const subs = dialog(page).locator(".sf-settings-subtabs").getByRole("tab");
		expect(await subs.allInnerTexts()).toEqual(["interface", "library mode", "storytelling mode", "writing"]);
		await expect(subtab(page, "interface")).toHaveAttribute("aria-selected", "true");
		await expect(dialog(page).getByRole("tab", { name: "Appearance", exact: true })).toHaveCount(1);
		const wanted: Record<string, string[]> = {
			interface: ["Body", "Small heading", "Hint", "Dialog heading"],
			"library mode": ["Title", "Bar name"],
			"storytelling mode": ["Series name", "Novel title", "Selected chapter", "Codex list"],
			writing: ["chapter", "read-only context fields", "context and library fields"],
		};
		for (const [sub, names] of Object.entries(wanted)) {
			await subtab(page, sub).click();
			for (const name of names) await expect(dialog(page).getByLabel(`${name} font`, { exact: true }), `${sub}: ${name}`).toHaveCount(1);
			await expect(dialog(page).getByLabel("Display font", { exact: true })).toHaveCount(0); // the start screen only: no project is open there
		}
		await subtab(page, "interface").click();
		await expect(dialog(page).getByLabel("Interface font", { exact: true })).toHaveValue("SN Pro");
		await expect(dialog(page).getByLabel("Body bold weight", { exact: true })).toHaveValue("600");
		await expect(dialog(page).getByLabel("Body bold font", { exact: true })).toHaveCount(0); // Body's font and size
		await expect(dialog(page).getByLabel("Body bold size (px)", { exact: true })).toHaveCount(0);
		await expect(dialog(page).getByLabel("Small heading size (px)", { exact: true })).toHaveAttribute("max", "18");
		await expect(dialog(page).getByRole("radiogroup", { name: "Small heading colour", exact: true })).toBeVisible();
		await subtab(page, "writing").click();
		await expect(dialog(page).getByLabel("Writing font", { exact: true })).toHaveValue("SN Pro");
		await expect(dialog(page).getByLabel("context and library fields size (px)", { exact: true })).toHaveValue("14");
		await subtab(page, "library mode").click();
		await expect(dialog(page).getByLabel("Bar name weight", { exact: true })).toHaveCount(0); // fixed: the font only
		await expect(dialog(page).getByRole("radiogroup", { name: "Data colour", exact: true })).toBeVisible();
		await subtab(page, "storytelling mode").click();
		await expect(dialog(page).getByRole("radiogroup", { name: "Codex colour", exact: true })).toBeVisible();
		expect(await projectMd(page)).toBe("");
	});

	test("the arrow keys move between the sub-page buttons; choosing one starts it at the top; the row stays put while the page scrolls", async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 520 });
		await openProject(page);
		await openAppearance(page);
		await subtab(page, "interface").focus();
		await page.keyboard.press("ArrowRight");
		await expect(subtab(page, "library mode")).toBeFocused();
		await expect(subtab(page, "library mode")).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("ArrowLeft");
		await expect(subtab(page, "interface")).toBeFocused();
		await page.keyboard.press("ArrowLeft");
		await expect(subtab(page, "writing")).toBeFocused(); // wraps
		await subtab(page, "writing").click();
		await subtab(page, "interface").click();
		const pane = dialog(page).locator(".sf-settings-page");
		await pane.evaluate((e) => (e.scrollTop = 200));
		const row = dialog(page).locator(".sf-settings-subtabs");
		const top = (await row.boundingBox())!.y;
		await pane.evaluate((e) => (e.scrollTop = 250));
		expect((await row.boundingBox())!.y).toBe(top);
		await subtab(page, "storytelling mode").click();
		expect(await dialog(page).locator(".sf-settings-page").evaluate((e) => e.scrollTop)).toBe(0);
	});

	test("the grid: a column per kind of control lined up down the page, a preview beside each row, previews dropping below in a narrow window", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const x = async (label: string) => (await dialog(page).getByLabel(label, { exact: true }).boundingBox())!;
		expect((await x("Body font")).x).toBeCloseTo((await x("Hint font")).x, 0);
		expect((await x("Body weight")).x).toBeCloseTo((await x("Small heading weight")).x, 0);
		expect((await x("Body size (px)")).x).toBeCloseTo((await x("Hint size (px)")).x, 0);
		const fontBox = await x("Body font");
		const sample = (await dialog(page).getByRole("img", { name: "Sample of the body style" }).boundingBox())!;
		expect(sample.x).toBeGreaterThan(fontBox.x + fontBox.width);
		expect(Math.abs(sample.y + sample.height / 2 - (fontBox.y + fontBox.height / 2))).toBeLessThan(12); // lined up with its row
		await page.setViewportSize({ width: 800, height: 700 });
		const narrow = (await dialog(page).getByRole("img", { name: "Sample of the body style" }).boundingBox())!;
		const dlg = (await dialog(page).boundingBox())!;
		expect(narrow.x + narrow.width).toBeLessThanOrEqual(dlg.x + dlg.width); // never overflowing
		expect(narrow.y).toBeGreaterThan((await x("Body font")).y + 10); // dropped below its row
	});

	test("the previews show each style as it really appears: its colour on its background, in text of its own kind", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const colour = (name: string) => dialog(page).getByRole("img", { name }).evaluate((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor]; });
		const token = (v: string) => page.evaluate((n) => { const i = document.createElement("i"); i.style.color = `var(${n})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }, v);
		expect(await colour("Sample of the hint style")).toEqual([await token("--purpose-text-muted"), await token("--purpose-panel-bg")]);
		expect(await colour("Sample of the small heading style")).toEqual([await token("--purpose-text"), await token("--purpose-panel-bg")]);
		expect(await dialog(page).getByRole("img", { name: "Sample of the dialog heading style" }).textContent()).toBe("Settings");
		expect(await dialog(page).getByRole("img", { name: "Sample of the body style" }).textContent()).toBe("Back Up Now · Open Project… · Hide the series pane");
		await subtab(page, "library mode").click();
		expect(await colour("Sample of the bar name style")).toEqual([await token("--purpose-text-on-data"), await token("--purpose-data-fill")]);
		await subtab(page, "storytelling mode").click();
		const series = dialog(page).getByRole("img", { name: "Sample of the series name" }).locator(".sf-preview-accent");
		expect(await series.evaluate((e) => getComputedStyle(e).color)).toBe(await token("--purpose-accent"));
		const codex = dialog(page).getByRole("img", { name: "Sample of the codex list" }).locator(".sf-preview-codex");
		expect(await codex.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor])).toEqual([await token("--purpose-codex"), await token("--purpose-editor-bg")]);
	});

	test("Small heading has a colour: written as a role name, applied to the page's small headings; the default is the text colour", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const group = dialog(page).getByRole("radiogroup", { name: "Small heading colour", exact: true });
		expect(await group.getByRole("radio").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Text colour", "Yellow", "Aqua", "Blue", "Orange", "Purple"]);
		await expect(group.getByRole("radio", { name: "Text colour" })).toHaveAttribute("aria-checked", "true");
		await group.getByRole("radio", { name: "Aqua" }).click();
		await expect.poll(() => projectMd(page)).toContain("small-heading-colour: aqua");
		await expect(page.locator("html")).toHaveAttribute("data-small-heading-colour", "aqua");
		const token = await page.evaluate(() => { const i = document.createElement("i"); i.style.color = "var(--purpose-colour-choice-aqua)"; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; });
		await expect.poll(() => dialog(page).getByRole("img", { name: "Sample of the small heading style" }).evaluate((e) => getComputedStyle(e).color)).toBe(token);
	});

	test("the Interface font changes every style that follows it and none that names its own; the Writing font leaves the interface alone", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		await dialog(page).getByLabel("Dialog heading font", { exact: true }).selectOption("Courier Prime"); // names its own
		await dialog(page).getByLabel("Interface font", { exact: true }).selectOption("Aleo");
		await expect.poll(async () => (await look(page, "body")).family).toContain("Aleo");
		expect((await look(page, ".sf-dialog-title")).family).toContain("Courier Prime");
		expect((await look(page, ".sf-editor .cm-content")).family).toContain("SN Pro");
		await subtab(page, "writing").click();
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
		await expect(body).toHaveAttribute("aria-valuetext", "13 px");
		await body.evaluate((e: HTMLInputElement) => { e.value = "15"; e.dispatchEvent(new Event("input", { bubbles: true })); });
		await expect(body).toHaveAttribute("aria-valuetext", "15 px");
		expect((await look(page, ".sf-settings-tab")).size).toBe("15px"); // the page previews
		expect(await projectMd(page)).toBe("");
		await body.evaluate((e: HTMLInputElement) => e.dispatchEvent(new Event("change", { bubbles: true })));
		await expect.poll(() => projectMd(page)).toContain("appearance-body-size: 15");
		await body.evaluate((e: HTMLInputElement) => { e.value = "40"; });
		expect(await body.inputValue()).toBe("16"); // nothing outside the range can be set
	});

	test("the weights offered are the resolved family's own; Body bold follows Body's font", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		await expect(dialog(page).getByLabel("Body bold weight", { exact: true })).toHaveValue("600");
		await dialog(page).getByLabel("Body font", { exact: true }).selectOption("Courier Prime");
		await expect.poll(async () => dialog(page).getByLabel("Body bold weight", { exact: true }).locator("option").allInnerTexts()).toEqual(["Regular (400)", "Bold (700)"]);
	});

	test("a sample of each style is drawn as it will be", async ({ page }) => {
		await openProject(page);
		await openAppearance(page, "library mode");
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
		await subtab(page, "writing").click();
		expect(await dialog(page).locator(".sf-settings-page").evaluate((e) => e.scrollTop)).toBe(0);
	});

	test("a colour sits directly under its style with no name repeated; no size readout or source text; the Codex preview shows the real entries; text colours follow the writing styles", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const below = async (style: string, group: string) => {
			const a = (await dialog(page).getByLabel(`${style} size (px)`, { exact: true }).or(dialog(page).getByLabel(`${style} size (rem)`, { exact: true })).boundingBox())!;
			const g = (await dialog(page).getByRole("radiogroup", { name: group, exact: true }).boundingBox())!;
			expect(g.y).toBeGreaterThan(a.y);
			expect(g.y - a.y).toBeLessThan(70); // the next row down, not further
		};
		await below("Small heading", "Small heading colour");
		await expect(dialog(page).getByText("Small heading colour", { exact: true })).toHaveCount(0); // no heading or name repeated
		await expect(dialog(page).getByText("default", { exact: true })).toHaveCount(0);
		expect(await dialog(page).getByLabel("Body size (px)", { exact: true }).locator("xpath=following-sibling::*").count()).toBe(0); // no readout beside the slider
		await subtab(page, "library mode").click();
		const barFont = (await dialog(page).getByLabel("Bar name font", { exact: true }).boundingBox())!;
		const data = (await dialog(page).getByRole("radiogroup", { name: "Data colour", exact: true }).boundingBox())!;
		expect(data.y - barFont.y).toBeLessThan(70); // directly under Bar name
		await subtab(page, "storytelling mode").click();
		await below("Codex list", "Codex colour");
		const rows = await dialog(page).getByRole("img", { name: "Sample of the codex list" }).locator(".sf-preview-codex-row").allInnerTexts();
		expect(rows.length).toBeGreaterThan(0);
		expect(rows).toContain("Harbour"); // the fixture's own entry, not an example name
		await subtab(page, "writing").click();
		await expect(dialog(page).getByRole("radiogroup", { name: "Selection colour", exact: true })).toBeVisible();
		const lastStyle = (await dialog(page).getByLabel("context and library fields size (px)", { exact: true }).boundingBox())!;
		expect((await dialog(page).getByRole("radiogroup", { name: "Selection colour", exact: true }).boundingBox())!.y).toBeGreaterThan(lastStyle.y);
	});
});
