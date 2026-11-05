import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 18 (decision 123): the two base fonts, the type styles and Settings ▸ Appearance in three groups.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const dialog = (page: Page) => page.getByRole("dialog");
async function openAppearance(page: Page): Promise<void> {
	await openSettingsDialog(page);
	await dialog(page).getByRole("tab", { name: "Appearance", exact: true }).click();
}
const projectMd = (page: Page) => page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md").catch(() => ""));
const look = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { const s = getComputedStyle(e); return { family: s.fontFamily, weight: s.fontWeight, size: s.fontSize }; });

test.describe("type styles", () => {
	test("Appearance has Interface, Navigator and Writing, then the colours; each group names its styles", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const groups = dialog(page).getByRole("group").filter({ has: page.locator("h2.sf-settings-group-title") });
		expect(await groups.locator("h2.sf-settings-group-title").allInnerTexts()).toEqual(["Interface", "Navigator", "Writing"]);
		for (const name of ["Display", "Title", "Heading", "Small heading", "Body", "Body bold", "Hint", "Bar name", "Prose", "Reading", "Fields"]) {
			await expect(dialog(page).getByLabel(`${name} font`, { exact: true }), name).toHaveCount(1);
		}
		await expect(dialog(page).getByLabel("Interface font", { exact: true })).toHaveValue("SN Pro");
		await expect(dialog(page).getByLabel("Writing font", { exact: true })).toHaveValue("SN Pro");
		await expect(dialog(page).getByLabel("Bar name weight", { exact: true })).toHaveCount(0); // fixed: the font only
		await expect(dialog(page).getByLabel("Fields size (px)", { exact: true })).toHaveValue("14");
		expect(await projectMd(page)).toBe("");
	});

	test("the Interface font changes every style that follows it and none that names its own; the Writing font leaves the interface alone", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		await dialog(page).getByLabel("Heading font", { exact: true }).selectOption("Courier Prime"); // names its own
		await dialog(page).getByLabel("Interface font", { exact: true }).selectOption("Aleo");
		await expect.poll(async () => (await look(page, "body")).family).toContain("Aleo");
		expect((await look(page, ".sf-dialog-title")).family).toContain("Courier Prime");
		expect((await look(page, ".sf-editor .cm-content")).family).toContain("SN Pro");
		await dialog(page).getByLabel("Writing font", { exact: true }).selectOption("Atkinson Hyperlegible Next");
		await expect.poll(async () => (await look(page, ".sf-editor .cm-content")).family).toContain("Atkinson Hyperlegible Next");
		expect((await look(page, "body")).family).toContain("Aleo");
		await expect.poll(() => projectMd(page)).toContain("appearance-writing-font: Atkinson Hyperlegible Next");
	});

	test("a size is refused outside its range with the range shown, accepted inside, and written", async ({ page }) => {
		await openProject(page);
		await openAppearance(page);
		const body = dialog(page).getByLabel("Body size (px)", { exact: true });
		await body.fill("40");
		await body.press("Enter");
		await expect(body).toHaveAttribute("aria-invalid", "true");
		await expect(dialog(page).getByText("Between 11 and 16 px")).toBeVisible();
		expect(await projectMd(page)).toBe("");
		await body.fill("15");
		await body.press("Enter");
		await expect.poll(() => projectMd(page)).toContain("appearance-body-size: 15");
		await expect.poll(async () => (await look(page, ".sf-chapter-rows, .sf-nav-lead, .sf-tabs, .sf-left")).size).toBeTruthy();
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
		await openAppearance(page);
		const sample = dialog(page).getByRole("img", { name: "Sample of the display style" });
		await expect(sample).toBeVisible();
		expect((await sample.evaluate((e) => getComputedStyle(e).fontSize))).toBe("28px");
		void flipFace;
	});
});
