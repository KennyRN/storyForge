import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 13, commit 4: the settings sections and the Appearance page (decisions 79 to 83).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const dialog = (page: Page) => page.getByRole("dialog");
async function openSettings(page: Page, section?: string): Promise<void> {
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	await expect(dialog(page)).toBeVisible();
	if (section) await dialog(page).getByRole("tab", { name: section, exact: true }).click();
}
const projectMd = (page: Page) => page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md").catch(() => ""));
const style = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { const s = getComputedStyle(e); return { family: s.fontFamily, weight: s.fontWeight, size: s.fontSize, variation: s.fontVariationSettings }; });
const font = (page: Page, part: string) => dialog(page).getByLabel(`${part} font`);
const size = (page: Page, part: string) => dialog(page).getByLabel(`${part} size (rem)`);

test.describe("settings sections", () => {
	test("a list of sections down the side, one page at a time, and opening settings writes nothing", async ({ page }) => {
		await openProject(page);
		await openSettings(page);
		const tabs = dialog(page).getByRole("tab");
		expect(await tabs.allInnerTexts()).toEqual(["General", "Story", "Appearance", "Writing", "Sessions", "Backups", "This Mac"]);
		await expect(dialog(page).getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
		await expect(dialog(page).getByRole("tabpanel")).toHaveCount(1);
		await expect(dialog(page).getByLabel("Opens in")).toBeVisible();
		await expect(dialog(page).getByLabel("Series numbering")).toHaveCount(0); // that's the Story page
		await dialog(page).getByRole("tab", { name: "Story" }).focus();
		await page.keyboard.press("ArrowDown");
		await expect(dialog(page).getByRole("tab", { name: "Appearance" })).toHaveAttribute("aria-selected", "true");
		await expect(dialog(page).getByRole("tab", { name: "Appearance" })).toBeFocused();
		expect(await projectMd(page)).toBe("");
	});

	test("Story holds the series-or-standalone choice and Numbering; choosing standalone writes story-kind and drops the series line", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Story");
		await expect(dialog(page).getByLabel("Series numbering")).toBeVisible();
		await expect(dialog(page).getByLabel("Chapter numbering")).toBeVisible();
		await expect(page.locator(".sf-nav-series")).toBeVisible();
		await dialog(page).getByRole("radio", { name: "One standalone novel" }).click();
		await expect.poll(() => projectMd(page)).toContain("story-kind: standalone");
		await expect(page.locator(".sf-nav-series")).toHaveCount(0);
		await dialog(page).getByRole("radio", { name: "A series" }).click();
		await expect(page.locator(".sf-nav-series")).toBeVisible();
	});

	test("Codex colour is on the Appearance page, not General, and works from there", async ({ page }) => {
		await openProject(page);
		await openSettings(page);
		await expect(dialog(page).getByRole("radiogroup", { name: "Codex colour" })).toHaveCount(0);
		await dialog(page).getByRole("tab", { name: "Appearance" }).click();
		await dialog(page).getByRole("radio", { name: "Purple" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-codex-colour", "purple");
		expect(await projectMd(page)).toContain("codex-colour: purple");
	});
});

test.describe("Appearance", () => {
	test("four parts, each with a font, a weight and a size, starting as the author's defaults (decision 84); no 'current look'; opening writes nothing", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		const want: [string, string, string, string][] = [["Codex list", "Atkinson Hyperlegible Next", "400", "1"], ["Novel title", "Inter", "900", "1"], ["Series name", "Inter", "600", "0.75"], ["Selected chapter", "SN Pro", "300", "1.375"]];
		for (const [part, f, w, z] of want) {
			await expect(font(page, part)).toHaveValue(f);
			await expect(dialog(page).getByLabel(`${part} weight`)).toHaveValue(w);
			await expect(size(page, part)).toHaveValue(z);
			expect(await font(page, part).locator("option").allInnerTexts()).toEqual(["SN Pro", "Aleo", "Atkinson Hyperlegible Next", "Courier Prime", "Fraunces", "Inter"]);
		}
		expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ap-chapter-size"))).toBe("22px"); // 1.375 rem against the one 16 px base
		expect(await style(page, ".sf-nav-novel")).toMatchObject({ weight: "900", size: "16px" });
		expect((await style(page, ".sf-nav-novel")).family).toContain("Inter");
		expect(await style(page, ".sf-nav-series")).toMatchObject({ weight: "600", size: "12px" });
		expect(await projectMd(page)).toBe("");
	});

	test("a font changes only its own part, at once, and is written to project.md; the library side's Codex list keeps SN Pro at 16 px", async ({ page }) => {
		await openProject(page);
		const chapterBefore = await style(page, ".sf-nav-current");
		await openSettings(page, "Appearance");
		await font(page, "Novel title").selectOption("Aleo");
		await expect.poll(async () => (await style(page, ".sf-nav-novel")).family).toContain("Aleo");
		expect((await style(page, ".sf-nav-novel")).weight).toBe("900"); // the weight goes with the author to the new font
		expect(await style(page, ".sf-nav-current")).toEqual(chapterBefore);
		expect((await style(page, ".sf-nav-series")).family).toContain("Inter"); // the series name is its own part
		await expect.poll(() => projectMd(page)).toContain("appearance-novel-font: Aleo");
		await font(page, "Codex list").selectOption("Aleo");
		await size(page, "Codex list").fill("1.5");
		await size(page, "Codex list").press("Enter");
		await expect.poll(async () => (await style(page, ".sf-codex-tree")).size).toBe("24px");
		expect((await style(page, ".sf-codex-tree")).family).toContain("Aleo");
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		const lib = await style(page, ".sf-codex-tree");
		expect(lib.family).toContain("SN Pro");
		expect(lib.size).toBe("16px");
	});

	test("weights: Courier Prime offers regular and bold only; changing font keeps the weight where the font has it, else the nearest", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		const weight = dialog(page).getByLabel("Selected chapter weight");
		await font(page, "Selected chapter").selectOption("Inter");
		await weight.selectOption("800");
		await font(page, "Selected chapter").selectOption("Atkinson Hyperlegible Next");
		await expect(weight).toHaveValue("800");
		await font(page, "Selected chapter").selectOption("Courier Prime");
		await expect(weight).toHaveValue("700");
		expect(await weight.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).toEqual(["400", "700"]);
		await expect.poll(() => projectMd(page)).toContain("appearance-chapter-weight: 700");
	});

	test("Fraunces shows Softness and Wonk, starting at 0 and off; they reach the drawing; other fonts hide them", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		await expect(dialog(page).getByLabel("Series name Softness (0 to 100)")).toHaveCount(0);
		await font(page, "Series name").selectOption("Fraunces");
		const soft = dialog(page).getByLabel("Series name Softness (0 to 100)");
		const wonk = dialog(page).getByLabel("Series name Wonk");
		await expect(soft).toHaveValue("0");
		await expect(wonk).not.toBeChecked();
		await expect.poll(async () => (await style(page, ".sf-nav-series")).variation).toMatch(/"SOFT" 0, "WONK" 0/);
		await soft.fill("50");
		await soft.press("Tab");
		await dialog(page).getByLabel("Series name Wonk").check();
		await expect.poll(async () => (await style(page, ".sf-nav-series")).variation).toMatch(/"SOFT" 50, "WONK" 1/);
		await font(page, "Series name").selectOption("Inter");
		await expect(dialog(page).getByLabel("Series name Softness (0 to 100)")).toHaveCount(0);
		expect(await projectMd(page)).toContain("appearance-series-soft: 50"); // kept, unused
	});

	test("size: rounded to the nearest 0.125 rem at once, refused with its range outside it, Escape restores, arrows step 0.125 and Shift 0.25", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		const input = size(page, "Novel title");
		await input.fill("1.3");
		await input.press("Enter");
		await expect(input).toHaveValue("1.25");
		await expect(dialog(page).getByText("1.25 rem (20 px)")).toBeVisible();
		await expect.poll(() => projectMd(page)).toContain("appearance-novel-size: 1.25");
		await input.fill("2.5");
		await input.press("Enter");
		await expect(input).toHaveValue("1.25"); // put back, never clamped
		await expect(dialog(page).getByRole("alert")).toHaveText("Between 0.75 and 2 rem");
		await input.fill("1.9");
		await input.press("Escape");
		await expect(dialog(page)).toBeVisible(); // Escape didn't close the dialog
		await expect(input).toHaveValue("1.25");
		await input.press("ArrowUp");
		await expect(size(page, "Novel title")).toHaveValue("1.375");
		await size(page, "Novel title").press("Shift+ArrowUp");
		await expect(size(page, "Novel title")).toHaveValue("1.625");
		// the chapter and Codex ranges stop at 1.75
		await font(page, "Selected chapter").selectOption("Aleo");
		await expect.poll(() => projectMd(page)).toContain("appearance-chapter-font: Aleo"); // the page is drawn again once it has landed
		await size(page, "Selected chapter").fill("1.8");
		await size(page, "Selected chapter").press("Enter");
		await expect(dialog(page).getByRole("alert")).toHaveText("Between 0.75 and 1.75 rem");
	});

	test("a sample line per part follows its font, weight and size; the real title follows too", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		await font(page, "Series name").selectOption("Courier Prime");
		const sample = dialog(page).getByRole("img", { name: "Sample of the series name" });
		await expect.poll(() => sample.evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Courier Prime");
		expect(await sample.evaluate((e) => getComputedStyle(e).fontSize)).toBe("12px"); // 0.75 rem, the series name's default
		expect((await style(page, ".sf-nav-series")).family).toContain("Courier Prime");
	});

	test("an unknown font or size in project.md is the default and isn't rewritten", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nappearance-novel-font: Comic Sans\nappearance-novel-size: 9\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ap-novel-family"))).toContain("Inter"); // the default
		await openSettings(page, "Appearance");
		await expect(font(page, "Novel title")).toHaveValue("Inter");
		await expect(size(page, "Novel title")).toHaveValue("1");
		expect(await projectMd(page)).toContain("appearance-novel-font: Comic Sans");
	});
});
