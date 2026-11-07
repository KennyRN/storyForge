import { expect, test, type Locator, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 17 (decision 122): the colour round. The selection (the bug and the setting), find matches, the Text colours in Settings.

const SETTINGS = "_backstage/storyforge/project.md";
const BLUE = "rgb(63, 88, 101)"; // the default selection (round two)
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
		expect(await bg(sel)).toBe(BLUE);
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
		expect(await pixels(page, text, [63, 88, 101])).toBeGreaterThan(300); // the blue fill behind the selected line
		expect(await pixels(page, text, [215, 212, 240])).toBe(0); // never CodeMirror's
		// A plot note draws the browser's own selection (it has no selection layer): the page's ::selection.
		const line = page.locator(".sf-chapter-context .sf-note-field .cm-line").first();
		await line.click({ clickCount: 3 });
		expect(await line.evaluate((e) => getComputedStyle(e, "::selection").backgroundColor)).toBe(BLUE);
	});

	test("each choice applies with focus in every surface; an unknown or excluded value draws blue", async ({ page }) => {
		await openProject(page);
		const choices: Record<string, string> = { plum: PLUM, green: "rgb(72, 88, 78)", yellow: "rgb(85, 84, 74)", grey: "rgb(77, 89, 96)" };
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
			await expect.poll(() => bg(sel)).toBe(BLUE);
		}
	});

	test("page text and text boxes take the chosen colour through ::selection, and with the window not active it is bg2", async ({ page }) => {
		await openProject(page);
		const selectionOf = () => page.evaluate(() => getComputedStyle(document.querySelector(".sf-nav-lead") ?? document.body, "::selection").backgroundColor);
		await page.evaluate(() => { document.documentElement.dataset.window = "active"; });
		expect(await selectionOf()).toBe(BLUE);
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
		expect(await bg(others)).not.toBe(BLUE);
	});
});

test.describe("Settings ▸ Appearance ▸ Text colours", () => {
	test("five rows with a sample line; a choice is written as a role name and applied at once", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const d = page.getByRole("dialog");
		await d.getByRole("tab", { name: "Appearance", exact: true }).click();
		await d.getByRole("tab", { name: "writing", exact: true }).click();
		const group = d.locator('section[aria-label="Text colours"]');
		await expect(group.getByRole("group", { name: "Sample of the text colours" })).toBeVisible();
		for (const name of ["Selection colour", "Bold colour", "Italic colour", "Bold italic colour"]) await expect(group.getByRole("radiogroup", { name, exact: true })).toBeVisible();
		// names its group first (decision 117): the Codex and data groups have swatches of the same names
		await group.getByRole("radiogroup", { name: "Selection colour", exact: true }).getByRole("radio", { name: "Green" }).click();
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p).catch(() => ""), SETTINGS)).toContain("selection-colour: green");
		await expect(page.locator("html")).toHaveAttribute("data-selection-colour", "green");
		await group.getByRole("radiogroup", { name: "Bold colour", exact: true }).getByRole("radio", { name: "Aqua" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-bold-colour", "aqua");
		expect(await page.evaluate((p) => window.__preview.read(p), SETTINGS)).toContain("bold-colour: aqua");
		// the choices of each row: red and green are never offered
		const names = async (n: string) => group.getByRole("radiogroup", { name: n, exact: true }).getByRole("radio").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
		expect(await names("Selection colour")).toEqual(["Plum", "Blue", "Green", "Yellow", "Grey"]);
		// unnamed squares: no visible name, the name kept for the screen reader and as a tooltip; the chosen one has a ring
		const swatch = group.getByRole("radiogroup", { name: "Italic colour", exact: true }).getByRole("radio", { name: "Text colour" });
		expect(((await swatch.textContent()) ?? "").trim()).toBe("");
		await expect(swatch).toHaveAttribute("title", "Text colour");
		expect(await swatch.evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height])).toEqual([24, 24]);
		await group.getByRole("radiogroup", { name: "Italic colour", exact: true }).getByRole("radio", { name: "Orange" }).click(); // the default: nothing to write
		const chosen = group.getByRole("radiogroup", { name: "Italic colour", exact: true }).getByRole("radio", { checked: true });
		await expect.poll(() => chosen.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid"); // waits for the focus ring to be drawn after the click (decision 108)
		expect(await names("Italic colour")).toEqual(["Text colour", "Yellow", "Aqua", "Blue", "Orange", "Purple"]);
	});
});

test.describe("bold, italic and bold italic colours", () => {
	const FG = "rgb(211, 198, 170)";
	const MUTED = "rgb(157, 169, 160)";
	const COLOURS: Record<string, string> = { yellow: "rgb(219, 188, 127)", aqua: "rgb(131, 192, 146)", blue: "rgb(127, 187, 179)", orange: "rgb(230, 152, 117)", purple: "rgb(214, 153, 182)" };
	const css = (loc: Locator, prop: string) => loc.first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);
	async function write(page: Page, text: string): Promise<Locator> {
		const content = page.locator(".sf-slot--centre .cm-content");
		await content.click();
		await page.keyboard.press("Meta+a");
		await page.keyboard.type(text);
		return content;
	}

	test('"Text colour" draws as before: fg, a real 700 and a real italic', async ({ page }) => {
		await openProject(page);
		await outside(page, "---\nformat-version: 1\nbold-colour: text\nitalic-colour: text\nbold-italic-colour: text\n---\n");
		await expect(page.locator("html")).toHaveAttribute("data-bold-italic-colour", "text");
		const content = await write(page, "a **bold** and *italic* and ***both*** x\nplain");
		for (const [sel, weight, style] of [[".sf-strong:not(.sf-em)", "700", "normal"], [".sf-em:not(.sf-strong)", "400", "italic"], [".sf-strong.sf-em", "700", "italic"]] as const) {
			const span = content.locator(sel);
			expect(await css(span, "color"), sel).toBe(FG);
			expect(await css(span, "font-weight"), sel).toBe(weight);
			expect(await css(span, "font-style"), sel).toBe(style);
			expect(await css(span, "font-synthesis-weight"), sel).toBe("none"); // nothing is synthesised
			expect(await css(span, "font-synthesis-style"), sel).toBe("none");
		}
	});

	for (const [key, selector, other] of [["bold-colour", ".sf-strong:not(.sf-em)", ".sf-em:not(.sf-strong)"], ["italic-colour", ".sf-em:not(.sf-strong)", ".sf-strong:not(.sf-em)"], ["bold-italic-colour", ".sf-strong.sf-em", ".sf-strong:not(.sf-em)"]] as const) {
		test(`${key}: each of the five colours applies to its own kind only; red, green and unknown draw the default orange; weight and italic are unchanged`, async ({ page }) => {
			await openProject(page);
			const content = await write(page, "a **bold** and *italic* and ***both*** x\nplain");
			for (const [name, rgb] of Object.entries(COLOURS)) {
				await outside(page, `---\nformat-version: 1\n${key}: ${name}\n---\n`);
				await expect(page.locator("html")).toHaveAttribute(`data-${key}`, name);
				await expect.poll(() => css(content.locator(selector), "color")).toBe(rgb);
				expect(await css(content.locator(other), "color")).toBe(COLOURS.orange); // the other kinds keep their own (the default, orange): no mixing
			}
			for (const bad of ["red", "green", "grey"]) {
				await outside(page, `---\nformat-version: 1\n${key}: ${bad}\n---\n`);
				await expect.poll(() => css(content.locator(selector), "color")).toBe(COLOURS.orange); // draws the default
			}
			expect(await css(content.locator(".sf-strong:not(.sf-em)"), "font-weight")).toBe("700");
			expect(await css(content.locator(".sf-em:not(.sf-strong)"), "font-style")).toBe("italic");
		});
	}

	test("the markers stay muted, upright and at weight 400 whatever the colours; selected text keeps its colour", async ({ page }) => {
		await openProject(page);
		await outside(page, "---\nformat-version: 1\nbold-colour: yellow\nitalic-colour: aqua\nbold-italic-colour: purple\n---\n");
		const content = await write(page, "a **bold** and *italic* and ***both*** x");
		for (const sel of [".sf-marker.sf-strong:not(.sf-em)", ".sf-marker.sf-em:not(.sf-strong)", ".sf-marker.sf-strong.sf-em"]) {
			const marker = content.locator(sel).first();
			expect(await css(marker, "color"), sel).toBe(MUTED);
			expect(await css(marker, "font-weight"), sel).toBe("400");
			expect(await css(marker, "font-style"), sel).toBe("normal");
		}
		await page.keyboard.press("Meta+a"); // everything selected: the emphasis colours stay
		expect(await css(content.locator(".sf-strong:not(.sf-em):not(.sf-marker)"), "color")).toBe(COLOURS.yellow);
		expect(await css(content.locator(".sf-em:not(.sf-strong):not(.sf-marker)"), "color")).toBe(COLOURS.aqua);
	});
});

test.describe("the field editors (plot note, synopsis, description) get the dressing", () => {
	const BOOK_A = "_story-library/novel-aaa.md";
	const note = (page: Page) => page.locator(".sf-chapter-context .sf-note-field .cm-content");

	test("emphasis, highlights and their colours show, the markers hide away from the caret; the saved text is the typed text, byte for byte", async ({ page }) => {
		await openProject(page);
		await outside(page, "---\nformat-version: 1\nbold-colour: aqua\nhighlight-colour: orange\n---\n");
		await toContextPanel(page);
		const typed = "Jane finds the **lantern** and *quietly* ==checks the ledger==\nthen leaves";
		await note(page).click();
		await page.keyboard.press("Meta+a");
		await page.keyboard.type(typed);
		await expect(note(page).locator(".sf-strong")).toHaveText("lantern");
		await expect(note(page).locator(".sf-em")).toHaveText("quietly");
		await expect(note(page).locator(".sf-highlight")).toHaveCount(0); // ==x== is plain text now (decision 157); the stored highlight-colour is never read
		expect(await note(page).locator(".sf-strong").evaluate((e) => getComputedStyle(e).color)).toBe("rgb(131, 192, 146)"); // aqua
		// The caret is on line 2: line 1's markers are hidden; on line 1 they show.
		await expect(note(page).locator(".cm-line").first()).toHaveText("Jane finds the lantern and quietly ==checks the ledger==");
		await page.keyboard.press("ArrowUp");
		await expect(note(page).locator(".cm-line").first()).toHaveText(typed.split("\n")[0]);
		// Commit on blur: the file holds exactly what was typed, markers and all (the dressing is display only).
		await page.locator(".sf-chapter-context .sf-chapter-text .cm-content").click();
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p), BOOK_A)).toContain("**lantern** and *quietly* ==checks the ledger==");
		expect(await page.evaluate((p) => window.__preview.read(p), BOOK_A)).toContain("then leaves");
		// The field's own text (what FieldState holds) is the raw text, not the dressed one.
		expect(await note(page).evaluate((e) => [...e.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n"))).toContain("then leaves");
	});

	test("the typing aids and the commit on blur still work in a dressed field", async ({ page }) => {
		await openProject(page);
		await toContextPanel(page);
		await note(page).click();
		await page.keyboard.press("Meta+a");
		await page.keyboard.type("He said \"hello\" -- then *left*");
		await expect.poll(() => note(page).evaluate((e) => e.textContent)).toContain("“hello”"); // smart quotes
		await page.locator(".sf-chapter-context .sf-chapter-text .cm-content").click();
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p), BOOK_A)).toContain("“hello”");
		expect(await page.evaluate((p) => window.__preview.read(p), BOOK_A)).toContain("*left*");
	});
});
