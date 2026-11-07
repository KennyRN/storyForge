import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 13, commit 4: the settings sections and the Appearance page (decisions 79 to 83).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const dialog = (page: Page) => page.getByRole("dialog");
async function openSettings(page: Page, section?: string, sub = section === "Appearance" ? "storytelling mode" : ""): Promise<void> {
	await openSettingsDialog(page);
	await expect(dialog(page)).toBeVisible();
	if (section) await dialog(page).getByRole("tab", { name: section, exact: true }).click();
	if (sub) await dialog(page).getByRole("tab", { name: sub, exact: true }).click(); // the sub-pages of Appearance (round two) and General (round five)
}
const projectMd = (page: Page) => page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md").catch(() => ""));
const style = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { const s = getComputedStyle(e); return { family: s.fontFamily, weight: s.fontWeight, size: s.fontSize, variation: s.fontVariationSettings }; });
const font = (page: Page, part: string) => dialog(page).getByLabel(`${part.toLowerCase()} font`);
const size = (page: Page, part: string) => dialog(page).getByLabel(`${part.toLowerCase()} size (rem)`);

test.describe("settings sections", () => {
	test("a list of sections down the side, one page at a time, and opening settings writes nothing", async ({ page }) => {
		await openProject(page);
		await openSettings(page);
		const tabs = dialog(page).locator(".sf-settings-tabs").getByRole("tab");
		expect(await tabs.allInnerTexts()).toEqual(["General", "Appearance", "Writing", "Sessions", "Backups"]);
		expect(await dialog(page).locator(".sf-settings-subtabs").getByRole("tab").allInnerTexts()).toEqual(["general", "sidebar widths"]); // General is one entry with three sub-pages
		await expect(dialog(page).getByRole("tab", { name: "General", exact: true })).toHaveAttribute("aria-selected", "true");
		await expect(dialog(page).getByRole("tabpanel")).toHaveCount(1);
		await expect(dialog(page).getByLabel("Opens in")).toBeVisible();
		await expect(dialog(page).getByLabel("Series numbering")).toBeVisible(); // general and story are one sub-page (Brief 19)
		await dialog(page).getByRole("tab", { name: "General", exact: true }).focus();
		await page.keyboard.press("ArrowDown");
		await expect(dialog(page).getByRole("tab", { name: "Appearance" })).toHaveAttribute("aria-selected", "true");
		await expect(dialog(page).getByRole("tab", { name: "Appearance" })).toBeFocused();
		expect(await projectMd(page)).toBe("");
	});

	test("the general sub-page holds the series-or-standalone choice and Numbering; choosing standalone writes story-kind and drops the series line", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "General", "general");
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
		await expect(dialog(page).getByRole("radiogroup", { name: "codex colour" })).toHaveCount(0);
		await dialog(page).getByRole("tab", { name: "Appearance" }).click();
		await dialog(page).getByRole("tab", { name: "storytelling mode", exact: true }).click();
		await dialog(page).getByRole("radiogroup", { name: "codex colour" }).getByRole("radio", { name: "Purple" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-codex-colour", "purple");
		expect(await projectMd(page)).toContain("codex-colour: purple");
	});
});

test.describe("the data colour (Brief 15)", () => {
	const group = (page: Page) => dialog(page).getByRole("radiogroup", { name: "bar colour" });

	test("five swatches on the Appearance page, blue chosen; opening writes nothing; choosing one writes its role name and recolours the bars at once", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance", "library mode");
		expect(await group(page).getByRole("radio").evaluateAll((els) => els.map((e) => [e.getAttribute("aria-label"), e.getAttribute("title"), (e.textContent ?? "").trim()]))).toEqual(["Yellow", "Aqua", "Blue", "Orange", "Purple"].map((n) => [n, n, ""])); // unnamed squares: the name is for the screen reader and the tooltip
		await expect(group(page).getByRole("radio", { name: "Blue" })).toHaveAttribute("aria-checked", "true");
		expect(await projectMd(page)).toBe("");
		await group(page).getByRole("radio", { name: "Yellow" }).click();
		await expect.poll(() => projectMd(page)).toContain("data-colour: yellow");
		await expect(page.locator("html")).toHaveAttribute("data-data-colour", "yellow");
		await expect(group(page).getByRole("radio", { name: "Yellow" })).toHaveAttribute("aria-checked", "true");
	});

	test("bg_dim on each of the five colours is 4.5:1 or more, and on the frame's grey0 3:1 or more, by measurement; the heatmap keeps blue", async ({ page }) => {
		await openProject(page);
		const lum = (c: string): number => {
			const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const ratio = (a: string, b: string): number => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
		const colours = await page.evaluate(() => {
			const probe = (v: string): string => { const i = document.createElement("i"); i.style.color = `var(${v})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
			const out: Record<string, { fill: string; text: string; frame: string; heat: string }> = {};
			for (const c of ["yellow", "aqua", "blue", "orange", "purple"]) {
				document.documentElement.dataset.dataColour = c;
				out[c] = { fill: probe("--purpose-data-fill"), text: probe("--purpose-text-on-data"), frame: probe("--purpose-data-frame"), heat: probe("--purpose-heat-d") };
			}
			return out;
		});
		expect(new Set(Object.values(colours).map((c) => c.fill)).size).toBe(5);
		for (const [name, c] of Object.entries(colours)) {
			expect(ratio(c.text, c.fill), `${name}: name on the bar`).toBeGreaterThanOrEqual(4.5);
			// Fix 11: the rail is bg2 (decision 155) and the names stay bg_dim across the fill and the rail (decision 158): 1.57:1 over the rail, accepted by Kenny
			expect(ratio(c.text, c.frame), `${name}: name on the default rail (decision 158)`).toBeCloseTo(1.57, 1);
			expect(c.heat, `${name}: the heatmap does not follow`).toBe(colours.blue.fill);
		}
	});
});

test.describe("Appearance", () => {
	test("four parts, each with a font, a weight and a size, starting as the author's defaults (decision 84); no 'current look'; opening writes nothing", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		const want: [string, string, string, string][] = [["Codex list", "Atkinson Hyperlegible Next", "400", "1"], ["Novel title", "Sofia Sans", "900", "1"], ["Series name", "Sofia Sans", "600", "0.75"], ["Selected chapter", "SN Pro", "300", "1.375"]];
		for (const [part, f, w, z] of want) {
			await expect(font(page, part)).toHaveValue(f);
			await expect(dialog(page).getByLabel(`${part.toLowerCase()} weight`)).toHaveValue(w);
			await expect(size(page, part)).toHaveValue(z);
			expect(await font(page, part).locator("option").allInnerTexts()).toEqual(["Interface font", "SN Pro", "Aleo", "Atkinson Hyperlegible Next", "Courier Prime", "Fraunces", "Sofia Sans", "Sofia Sans Semi Condensed", "Sofia Sans Condensed"]);
		}
		expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ap-chapter-size"))).toBe("22px"); // 1.375 rem against the one 16 px base
		expect(await style(page, ".sf-nav-novel")).toMatchObject({ weight: "900", size: "16px" });
		expect((await style(page, ".sf-nav-novel")).family).toContain("Sofia Sans");
		expect(await style(page, ".sf-nav-series")).toMatchObject({ weight: "600", size: "12px" });
		expect(await projectMd(page)).toBe("");
	});

	test("a font changes only its own part, at once, and is written to project.md; the library side's Codex list follows it (Fix 7 polish: it takes the storytelling list's settings)", async ({ page }) => {
		await openProject(page);
		await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--ap-chapter-size") !== ""); // the project's own choices are applied
		const chapterBefore = await style(page, ".sf-select--chapters .sf-select-current");
		await openSettings(page, "Appearance");
		await font(page, "Novel title").selectOption("Aleo");
		await expect.poll(async () => (await style(page, ".sf-nav-novel")).family).toContain("Aleo");
		expect((await style(page, ".sf-nav-novel")).weight).toBe("900"); // the weight goes with the author to the new font
		expect(await style(page, ".sf-select--chapters .sf-select-current")).toEqual(chapterBefore);
		expect((await style(page, ".sf-nav-series")).family).toContain("Sofia Sans"); // the series name is its own part
		await expect.poll(() => projectMd(page)).toContain("appearance-novel-font: Aleo");
		await font(page, "Codex list").selectOption("Aleo");
		await expect.poll(() => projectMd(page)).toContain("appearance-codex-font: Aleo"); // the page is drawn again once it has landed
		await size(page, "Codex list").fill("1.5");
		await expect.poll(async () => (await style(page, ".sf-codex-tree")).size).toBe("24px");
		expect((await style(page, ".sf-codex-tree")).family).toContain("Aleo");
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		const lib = await style(page, ".sf-codex-tree");
		expect(lib.family).toContain("Aleo");
		expect(lib.size).toBe("24px");
	});

	test("weights: Courier Prime offers regular and bold only; changing font keeps the weight where the font has it, else the nearest", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		const weight = dialog(page).getByLabel("selected chapter weight");
		await font(page, "Selected chapter").selectOption("Sofia Sans");
		await weight.selectOption("800");
		await font(page, "Selected chapter").selectOption("Atkinson Hyperlegible Next");
		await expect(weight).toHaveValue("800");
		await font(page, "Selected chapter").selectOption("Courier Prime");
		await expect(weight).toHaveValue("700");
		expect(await weight.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).toEqual(["400", "700"]);
		await expect.poll(() => projectMd(page)).toContain("appearance-chapter-weight: 700");
	});

	test("Fraunces has no Softness control (removed in 1.10.0, as Wonk was in 1.6.1) and is always drawn at Softness 0 with Wonk off", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		await font(page, "Series name").selectOption("Fraunces");
		await expect(dialog(page).getByLabel(/Softness|Wonk/)).toHaveCount(0);
		await expect.poll(async () => (await style(page, ".sf-nav-series")).variation).toMatch(/"SOFT" 0, "WONK" 0/);
		await font(page, "Series name").selectOption("Sofia Sans Condensed");
		expect((await projectMd(page)).includes("soft")).toBe(false); // nothing is written for it
	});

	test("size is a slider over the part's range: a drag previews live and saves once on release, the arrows step 0.125 and Shift 0.25, nothing outside the range can be set", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		const slider = size(page, "Novel title");
		await expect(slider).toHaveAttribute("min", "0.75");
		await expect(slider).toHaveAttribute("max", "2");
		await expect(slider).toHaveAttribute("step", "0.125");
		await expect(slider).toHaveAttribute("aria-valuetext", "1 rem (16 px)"); // the value is kept for the screen reader only
		// a drag: input events preview (the value, the sample, the page) and write nothing; release saves once
		await slider.evaluate((e: HTMLInputElement) => { e.value = "1.5"; e.dispatchEvent(new Event("input", { bubbles: true })); });
		await expect(slider).toHaveAttribute("aria-valuetext", "1.5 rem (24 px)");
		expect(await dialog(page).getByRole("img", { name: "Sample of the novel title" }).locator("div").evaluate((e) => getComputedStyle(e).fontSize)).toBe("24px");
		expect(await style(page, ".sf-nav-novel")).toMatchObject({ size: "24px" });
		expect(await projectMd(page)).toBe("");
		await slider.evaluate((e: HTMLInputElement) => e.dispatchEvent(new Event("change", { bubbles: true })));
		await expect.poll(() => projectMd(page)).toContain("appearance-novel-size: 1.5");
		// out of range: the slider holds it to its ends
		await slider.evaluate((e: HTMLInputElement) => { e.value = "5"; });
		expect(await slider.inputValue()).toBe("2");
		await slider.focus();
		await slider.press("ArrowLeft");
		await expect.poll(() => projectMd(page)).toContain("appearance-novel-size: 1.875"); // from the slider's end, 2, one step back
		await size(page, "Novel title").press("Shift+ArrowLeft");
		await expect.poll(() => projectMd(page)).toContain("appearance-novel-size: 1.625");
		await expect(size(page, "Novel title")).toBeFocused(); // a key redraws the page; focus stays on the slider
		// the chapter and Codex ranges stop at 1.75
		await expect(size(page, "Selected chapter")).toHaveAttribute("max", "1.75");
	});

	test("a sample line per part follows its font, weight and size; the real title follows too", async ({ page }) => {
		await openProject(page);
		await openSettings(page, "Appearance");
		await font(page, "Series name").selectOption("Courier Prime");
		const sample = dialog(page).getByRole("img", { name: "Sample of the series name" }).locator("div");
		await expect.poll(() => sample.evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Courier Prime");
		expect(await sample.evaluate((e) => getComputedStyle(e).fontSize)).toBe("12px"); // 0.75 rem, the series name's default
		await expect.poll(async () => (await style(page, ".sf-nav-series")).family).toContain("Courier Prime"); // the page applies it as the write lands: poll, like the sample above
	});

	test("an unknown font or size in project.md is the default and isn't rewritten", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nappearance-novel-font: Comic Sans\nappearance-novel-size: 9\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ap-novel-family"))).toContain("Sofia Sans"); // the default
		await openSettings(page, "Appearance");
		await expect(font(page, "Novel title")).toHaveValue("Sofia Sans");
		await expect(size(page, "Novel title")).toHaveValue("1");
		expect(await projectMd(page)).toContain("appearance-novel-font: Comic Sans");
	});
});
