import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPreview, shot, flipFace, openSettingsDialog } from "./helpers";

// Brief 10, commit 2: SN Pro in every place the author writes and in the Codex list, and nowhere else. The browser preview
// serves no security policy, so what the built app really loads is checked by `npm run test:look` (Mac, built app).

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const flipSide = (page: Page) => flipFace(page);

/** What a surface is really drawn in: the computed family, and the faces the page has actually loaded. */
async function style(el: Locator) {
	return el.evaluate((node) => {
		const s = getComputedStyle(node);
		return { family: s.fontFamily, ligatures: s.fontVariantLigatures, features: s.fontFeatureSettings, synthesis: s.fontSynthesis, size: s.fontSize, line: s.lineHeight };
	});
}
async function expectSnPro(el: Locator, what: string): Promise<void> {
	const s = await style(el);
	expect(s.family, `${what}: family`).toMatch(/^"?SN Pro"?/);
	expect(s.ligatures, `${what}: ligatures`).toBe("none");
	expect(s.features, `${what}: features`).toContain('"liga" 0');
	expect(s.features, `${what}: features`).toContain('"calt" 0');
	expect(s.features, `${what}: features`).toContain('"ss01" 0');
	expect(s.synthesis, `${what}: synthesis`).toContain("none");
}

test.describe("SN Pro", () => {
	test("both faces load from the app, upright and italic, with the whole weight axis, and no request leaves it", async ({ page }) => {
		const outside: string[] = [];
		const fontFiles: string[] = [];
		page.on("request", (r) => {
			if (/\.woff2(\?|$)/.test(r.url())) fontFiles.push(r.url().replace(/.*\//, "").replace(/\?.*/, ""));
			const u = new URL(r.url());
			if (!/^(data|blob):/.test(r.url()) && u.origin !== "http://127.0.0.1:1421") outside.push(r.url());
		});
		await openProject(page);
		const faces = await page.evaluate(async () => {
			await Promise.all([document.fonts.load('17px "SN Pro"'), document.fonts.load('italic 17px "SN Pro"'), document.fonts.load('700 17px "SN Pro"')]);
			return [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "SN Pro").map((f) => `${f.style} ${f.weight} ${f.status}`).sort();
		});
		expect(faces).toEqual(["italic 200 900 loaded", "normal 200 900 loaded"]);
		expect([...new Set(fontFiles)].sort()).toEqual(["SNPro-VariableItalic.woff2", "SNPro-VariableRegular.woff2"]);
		expect(outside, "requests outside the app").toEqual([]);
	});

	test("the chapter editor and a Codex note in the context panel are in SN Pro at 20 px / 1.6, ligatures off, and a typed arrow stays as typed", async ({ page }) => {
		await openProject(page);
		const chapter = page.locator(".sf-slot--centre .cm-scroller");
		await expectSnPro(chapter, "the chapter");
		const content = page.locator(".sf-slot--centre .cm-content");
		expect((await style(content)).size).toBe("20px");
		expect(parseFloat((await style(content)).line)).toBeCloseTo(20 * 1.6, 1);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await expect(page.locator(".sf-slot--lore .cm-content")).toBeVisible();
		await expectSnPro(page.locator(".sf-slot--lore .cm-scroller"), "the Codex note");
		await shot(page, "look-chapter-and-note");
		// The text on disk is what is on screen: the characters are the typed ones (the drawing is the font's, the text is not).
		await content.click();
		await page.keyboard.type("a -> b ✓✓");
		await expect(content).toContainText("a -> b ✓✓");
	});

	test("the Codex list, on the storytelling side and on the library side", async ({ page }) => {
		await openProject(page);
		// The Codex list is the author's choice (default Atkinson Hyperlegible Next, decision 84), on both sides (the library side took the storytelling side's settings in Fix 7 polish).
		expect(await page.getByRole("tree", { name: "Codex" }).evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Atkinson Hyperlegible Next");
		await flipSide(page);
		await page.getByRole("tab", { name: "codex" }).click();
		expect(await page.getByRole("tree", { name: "Codex" }).evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Atkinson Hyperlegible Next");
		await shot(page, "look-codex-library");
	});

	for (const [name, tab, box] of [
		["a plot note", "novel", (page: Page) => page.getByRole("textbox", { name: "Plot note for Chapter 1" })], // in the context panel (Brief 14): the chosen chapter's
		["the synopsis", "novel", (page: Page) => page.getByRole("region", { name: "Novel overview" }).getByRole("textbox", { name: /^Synopsis of / })],
		["the series description", "series", (page: Page) => page.getByRole("region", { name: "Series overview" }).getByRole("textbox", { name: "Series description" })],
	] as const) {
		test(`${name} is in SN Pro`, async ({ page }) => {
			await openProject(page);
			await flipSide(page);
			await page.getByRole("tab", { name: tab }).click();
			const field = box(page);
			await expect(field).toBeVisible();
			await expectSnPro(field.locator("xpath=ancestor::*[contains(@class,'sf-note-field')][1]"), name);
			await expectSnPro(field.locator("xpath=ancestor::*[contains(@class,'cm-scroller')][1]"), `${name} scroller`);
		});
	}

	test("the rest of the interface keeps the system sans-serif", async ({ page }) => {
		await openProject(page);
		for (const [what, loc] of [
			["the body", page.locator("body")],
			["the stats", page.locator(".sf-stats")],
			["the stats", page.locator(".sf-stats-value")],
					] as [string, Locator][]) {
			expect((await style(loc.first())).family, what).not.toContain("SN Pro");
		}
		await openSettingsDialog(page);
		const dlg = page.getByRole("dialog");
		await expect(dlg).toBeVisible();
		expect((await style(dlg)).family).not.toContain("SN Pro");
	});
});
