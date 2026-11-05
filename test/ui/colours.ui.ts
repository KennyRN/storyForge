import { expect, test, type Locator, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 17 (decision 122): the colour round. The selection (the bug and the setting), find matches, the Text colours in Settings.

const SETTINGS = "_backstage/storyforge/project.md";
const PLUM = "rgb(92, 63, 79)";
const BG2 = "rgb(67, 79, 85)";
const CM_FOCUSED_BUG = "rgb(215, 212, 240)"; // CodeMirror's own, #d7d4f0

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
async function toContextPanel(page: Page): Promise<void> {
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await page.locator('.sf-card[data-chapter="ch-a1.md"] .sf-bar').click();
	await expect(page.locator(".sf-chapter-context .sf-chapter-text .cm-content")).toBeVisible();
}
const outside = (page: Page, text: string) =>
	page.evaluate(
		async ({ path, text }) => {
			await window.__preview.touch(path, text);
			window.__preview.emit("watch-batch", { paths: [path], rescan: false });
		},
		{ path: SETTINGS, text },
	);
/** How many pixels of `loc` are (within 4 of) a colour: the browser's own selection has no element to measure. */
async function pixels(page: Page, loc: Locator, rgb: [number, number, number]): Promise<number> {
	const png = await loc.screenshot();
	return page.evaluate(async ([b64, want]) => {
		const img = new Image();
		img.src = "data:image/png;base64," + b64;
		await img.decode();
		const c = document.createElement("canvas");
		c.width = img.width;
		c.height = img.height;
		const g = c.getContext("2d")!;
		g.drawImage(img, 0, 0);
		const d = g.getImageData(0, 0, img.width, img.height).data;
		let n = 0;
		for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - (want as number[])[0]) < 4 && Math.abs(d[i + 1] - (want as number[])[1]) < 4 && Math.abs(d[i + 2] - (want as number[])[2]) < 4) n++;
		return n;
	}, [png.toString("base64"), rgb] as const);
}
const bg = (loc: Locator) => loc.first().evaluate((e) => getComputedStyle(e).backgroundColor);

test.describe("the selection", () => {
	test("in the chapter editor, with focus, it is the app's colour, not CodeMirror's #d7d4f0 (the regression); without focus it is neutral bg2", async ({ page }) => {
		await openProject(page);
		const sel = page.locator(".sf-slot--centre .cm-selectionBackground");
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press("Meta+a");
		await expect(sel.first()).toBeVisible();
		expect(await bg(sel)).toBe(PLUM);
		expect(await bg(sel)).not.toBe(CM_FOCUSED_BUG);
		await page.locator(".sf-slot--centre .cm-content").evaluate((e) => (e as HTMLElement).blur());
		await expect.poll(() => bg(sel)).toBe(BG2);
	});

	test("in the context panel's read-only chapter text, the same, measured in pixels; and a plot note's own selection is the page's ::selection, the app's colour", async ({ page }) => {
		await openProject(page);
		await toContextPanel(page);
		const text = page.locator(".sf-chapter-context .sf-chapter-text");
		await text.locator(".cm-content").click({ clickCount: 3 }); // a triple click selects a line (this text has no select-all key)
		await page.waitForTimeout(200);
		expect(await pixels(page, text, [92, 63, 79])).toBeGreaterThan(300); // the plum fill behind the selected line
		expect(await pixels(page, text, [215, 212, 240])).toBe(0); // never CodeMirror's
		// A plot note draws the browser's own selection (it has no selection layer): the page's ::selection.
		const line = page.locator(".sf-chapter-context .sf-note-field .cm-line").first();
		await line.click({ clickCount: 3 });
		expect(await line.evaluate((e) => getComputedStyle(e, "::selection").backgroundColor)).toBe(PLUM);
	});

	test("each choice applies with focus in every surface; an unknown or excluded value draws plum", async ({ page }) => {
		await openProject(page);
		const choices: Record<string, string> = { blue: "rgb(63, 88, 101)", green: "rgb(72, 88, 78)", yellow: "rgb(85, 84, 74)", grey: "rgb(77, 89, 96)" };
		const sel = page.locator(".sf-slot--centre .cm-selectionBackground");
		await page.locator(".sf-slot--centre .cm-content").click();
		for (const [name, rgb] of Object.entries(choices)) {
			await outside(page, `---\nformat-version: 1\nselection-colour: ${name}\n---\n`);
			await expect(page.locator("html")).toHaveAttribute("data-selection-colour", name);
			await page.locator(".sf-slot--centre .cm-content").click();
			await page.keyboard.press("Meta+a");
			await expect.poll(() => bg(sel)).toBe(rgb);
		}
		for (const bad of ["red", "orange", "text"]) {
			await outside(page, `---\nformat-version: 1\nselection-colour: ${bad}\n---\n`);
			await page.locator(".sf-slot--centre .cm-content").click();
			await page.keyboard.press("Meta+a");
			await expect.poll(() => bg(sel)).toBe(PLUM);
		}
	});

	test("page text and text boxes take the chosen colour through ::selection, and with the window not active it is bg2", async ({ page }) => {
		await openProject(page);
		const selectionOf = () => page.evaluate(() => getComputedStyle(document.querySelector(".sf-nav-lead") ?? document.body, "::selection").backgroundColor);
		await page.evaluate(() => { document.documentElement.dataset.window = "active"; });
		expect(await selectionOf()).toBe(PLUM);
		await outside(page, "---\nformat-version: 1\nselection-colour: green\n---\n");
		await expect.poll(selectionOf).toBe("rgb(72, 88, 78)");
		// The app marks the page when the window loses or gets focus; inactive, the same text draws neutral bg2.
		await page.evaluate(() => window.dispatchEvent(new Event("blur")));
		await expect(page.locator("html")).toHaveAttribute("data-window", /active|inactive/);
		await page.evaluate(() => { document.documentElement.dataset.window = "inactive"; });
		expect(await selectionOf()).toBe(BG2);
		await page.evaluate(() => { document.documentElement.dataset.window = "active"; });
		expect(await selectionOf()).toBe("rgb(72, 88, 78)");
	});
});

test.describe("find matches", () => {
	test("a bg2 fill with a dashed outline; the current match an orange outline; neither is the selection's colour", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.evaluate(() => window.__preview.emit("menu", "find"));
		await page.keyboard.type("sentence");
		await page.keyboard.press("Enter");
		const match = page.locator(".sf-slot--centre .cm-searchMatch").first();
		await expect(match).toBeVisible();
		const others = page.locator(".sf-slot--centre .cm-searchMatch:not(.cm-searchMatch-selected)").first();
		const current = page.locator(".sf-slot--centre .cm-searchMatch-selected").first();
		expect(await bg(others)).toBe(BG2);
		expect(await others.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("dashed");
		expect(await current.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
		expect(await current.evaluate((e) => getComputedStyle(e).outlineColor)).toBe("rgb(230, 152, 117)"); // orange
		expect(await bg(others)).not.toBe(PLUM);
	});
});

test.describe("Settings ▸ Appearance ▸ Text colours", () => {
	test("five rows with a sample line; a choice is written as a role name and applied at once", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const d = page.getByRole("dialog");
		await d.getByRole("tab", { name: "Appearance", exact: true }).click();
		const group = d.locator('section[aria-label="Text colours"]');
		await expect(group.getByRole("group", { name: "Sample of the text colours" })).toBeVisible();
		for (const name of ["Selection colour", "Highlight colour", "Bold colour", "Italic colour", "Bold italic colour"]) await expect(group.getByRole("radiogroup", { name, exact: true })).toBeVisible();
		// names its group first (decision 117): the Codex and data groups have swatches of the same names
		await group.getByRole("radiogroup", { name: "Selection colour", exact: true }).getByRole("radio", { name: "Blue" }).click();
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p).catch(() => ""), SETTINGS)).toContain("selection-colour: blue");
		await expect(page.locator("html")).toHaveAttribute("data-selection-colour", "blue");
		await group.getByRole("radiogroup", { name: "Bold colour", exact: true }).getByRole("radio", { name: "Aqua" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-bold-colour", "aqua");
		expect(await page.evaluate((p) => window.__preview.read(p), SETTINGS)).toContain("bold-colour: aqua");
		// the choices of each row: red and green are never offered
		const names = async (n: string) => group.getByRole("radiogroup", { name: n, exact: true }).getByRole("radio").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
		expect(await names("Selection colour")).toEqual(["Plum", "Blue", "Green", "Yellow", "Grey"]);
		expect(await names("Highlight colour")).toEqual(["Yellow", "Aqua", "Blue", "Orange", "Purple"]);
		expect(await names("Italic colour")).toEqual(["Text colour", "Yellow", "Aqua", "Blue", "Orange", "Purple"]);
	});
});
