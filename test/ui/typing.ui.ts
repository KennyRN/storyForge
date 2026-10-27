import { expect, test, type Page } from "@playwright/test";
import { openPreview, shot } from "./helpers";

const PROJECT_MD = "_backstage/storyforge/project.md";
const dialog = (page: Page) => page.getByRole("dialog");
const projectMd = (page: Page) => page.evaluate((p) => window.__preview.read(p), PROJECT_MD).catch(() => "");

async function openTypingSettings(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	await expect(dialog(page).getByRole("heading", { name: "Settings" })).toBeVisible();
}

test.describe("the Typing settings", () => {
	test("every aid is on, the starting lists show, and opening them writes nothing", async ({ page }) => {
		await openTypingSettings(page);
		const d = dialog(page);
		const group = d.locator('section[aria-label="Typing"]');
		for (const label of ["Curly quotes, dashes and ellipses as you type", "Correct Codex names as you type them", "Shortcodes (~ then Tab)", "Offer Codex names after ~", "Special-characters button in the context panel"]) {
			await expect(group.getByLabel(label)).toBeChecked();
		}
		await expect(group.getByRole("list", { name: "Words that begin with an apostrophe" })).toContainText("tis");
		await expect(group.getByRole("list", { name: "Special characters" })).toContainText("æ");
		await expect(group).toContainText("The Mac's own smart quotes");
		await group.getByRole("heading", { name: "Typing" }).scrollIntoViewIfNeeded();
		await shot(page, "typing-settings");
		await d.getByRole("button", { name: "Done" }).click();
		expect(await projectMd(page)).toBe("");
	});

	test("a switch is saved to project.md and only that key is written", async ({ page }) => {
		await openTypingSettings(page);
		const group = dialog(page).locator('section[aria-label="Typing"]');
		await group.getByLabel("Curly quotes, dashes and ellipses as you type").uncheck();
		await expect.poll(() => projectMd(page)).toContain("typing-smart-punctuation: false");
		expect(await projectMd(page)).not.toContain("typing-elisions");
	});

	test("lists: add and remove an elision, a name and a special character; the old English group; a shortcode", async ({ page }) => {
		await openTypingSettings(page);
		const group = dialog(page).locator('section[aria-label="Typing"]');
		await group.getByLabel("Add to Words that begin with an apostrophe").fill("ere");
		await group.getByLabel("Add to Words that begin with an apostrophe").press("Enter");
		await expect(group.getByRole("list", { name: "Words that begin with an apostrophe" })).toContainText("ere");
		await expect.poll(() => projectMd(page)).toContain("ere");
		await group.getByRole("button", { name: "Remove cause" }).click();
		await expect(group.getByRole("list", { name: "Words that begin with an apostrophe" })).not.toContainText("cause");

		await group.getByLabel("Add to Names that are also ordinary words").fill("Red Blossom");
		await group.getByLabel("Add to Names that are also ordinary words").press("Enter");
		await expect.poll(() => projectMd(page)).toContain("Red Blossom");

		await group.getByRole("button", { name: "Add the Old English group" }).click();
		await expect(group.getByRole("list", { name: "Special characters" })).toContainText("ƿ");
		await group.getByRole("button", { name: "Move ð earlier", exact: true }).click();
		await expect(group.getByRole("list", { name: "Special characters" }).locator("li").nth(3)).toContainText("ð"); // the screen has redrawn
		await expect.poll(() => projectMd(page)).toMatch(/typing-special-characters:[\s\S]*ð[\s\S]*Œ/);

		await group.getByLabel("Shortcode letters").fill("~th");
		await group.getByLabel("Shortcode full text").fill("the Right Honourable");
		await group.getByLabel("Shortcode full text").press("Enter");
		await expect(group.getByRole("list", { name: "Shortcodes" })).toContainText("~th");
		await expect.poll(() => projectMd(page)).toContain("th: the Right Honourable");
		await shot(page, "typing-settings-lists");
	});

	test("an entry that can't be used is refused with a reason, and nothing is written", async ({ page }) => {
		await openTypingSettings(page);
		const group = dialog(page).locator('section[aria-label="Typing"]');
		await group.getByLabel("Add to Special characters").fill("ae");
		await group.getByLabel("Add to Special characters").press("Enter");
		await expect(page.getByRole("status").filter({ hasText: "single visible character" })).toBeVisible();
		await group.getByLabel("Shortcode letters").fill("t1");
		await group.getByLabel("Shortcode full text").fill("x");
		await group.getByLabel("Shortcode full text").press("Enter");
		await expect(page.getByRole("status").filter({ hasText: "letters after ~" })).toBeVisible();
		expect(await projectMd(page)).toBe("");
	});
});
