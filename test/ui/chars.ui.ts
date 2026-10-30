import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 10, commit 6: the special-characters button always shows (the bottom row of the context panel) and puts its
// character in the editor the author last wrote in: the chapter, a Codex note, a plot note, the synopsis or the series
// description. It goes in as typing, the caret ends up just after it, one ⌘Z takes it back, a click on the button never
// takes the focus out of a field (so the field is not committed by it), and it is greyed when there is nowhere safe.

const MOD = "ControlOrMeta";
const BOOK = "_story-library/novel-aaa.md";
const SERIES = "_story-library/series.md";
const CHARS = (page: Page) => page.getByRole("button", { name: "Special characters", exact: true });
const palette = (page: Page) => page.getByRole("group", { name: "Special characters" });
const ash = (page: Page) => palette(page).getByRole("button", { name: "ash", exact: true });
const centre = (page: Page) => page.locator(".sf-slot--centre .cm-content");
const lore = (page: Page) => page.locator(".sf-slot--lore .cm-content");
const flipSide = (page: Page) => page.getByRole("button", { name: "Flip side" }).click();
const onDisk = (page: Page, path: string): Promise<string> => page.evaluate((p) => window.__preview.read(p), path);
const lines = (box: Locator): Promise<string> => box.evaluate((el) => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"));

async function openProject(page: Page, options: Parameters<typeof openPreview>[1] = {}): Promise<void> {
	await openPreview(page, options);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
/** The whole of it, with the mouse: open the palette, choose ash. The editor keeps its focus throughout. */
async function pressAsh(page: Page): Promise<void> {
	await CHARS(page).click();
	await ash(page).click();
}
const endOf = async (box: Locator, page: Page) => {
	await box.click();
	await page.keyboard.press(`${MOD}+ArrowDown`);
};

test.describe("the special-characters button: where it puts the character", () => {
	test("in the chapter, as typing, with the caret just after it, and one ⌘Z takes it back", async ({ page }) => {
		await openProject(page);
		await endOf(centre(page), page);
		await pressAsh(page);
		await expect(centre(page)).toBeFocused();
		expect(await lines(centre(page))).toMatch(/anything\.\s*$|anything\.æ$/m);
		expect((await lines(centre(page))).endsWith("æ")).toBe(true);
		await page.keyboard.type("Z"); // the caret was just after it
		expect((await lines(centre(page))).endsWith("æZ")).toBe(true);
		await page.keyboard.press(`${MOD}+z`); // takes back the Z, only
		expect((await lines(centre(page))).endsWith("æ")).toBe(true);
		await page.keyboard.press(`${MOD}+z`); // one more takes back the character, only
		expect((await lines(centre(page))).endsWith("æ")).toBe(false);
		expect((await lines(centre(page))).endsWith("anything.")).toBe(true);
	});

	test("in a Codex note open in the context panel, and not the chapter", async ({ page }) => {
		await openProject(page);
		const chapterBefore = await lines(centre(page));
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await expect(lore(page)).toBeVisible();
		await endOf(lore(page), page);
		await pressAsh(page);
		await expect(lore(page)).toBeFocused();
		expect((await lines(lore(page))).endsWith("æ")).toBe(true);
		expect(await lines(centre(page))).toBe(chapterBefore);
		await page.keyboard.press(`${MOD}+z`);
		expect((await lines(lore(page))).endsWith("æ")).toBe(false);
	});

	test("the editor last written in wins: chapter, then the note, then the chapter again", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await endOf(lore(page), page);
		await endOf(centre(page), page); // the chapter is last
		await pressAsh(page);
		expect((await lines(centre(page))).endsWith("æ")).toBe(true);
		expect((await lines(lore(page))).endsWith("æ")).toBe(false);
		await endOf(lore(page), page);
		await pressAsh(page);
		expect((await lines(lore(page))).endsWith("æ")).toBe(true);
	});

	test("it goes in at the selection, replacing it, wherever the caret was left", async ({ page }) => {
		await openProject(page);
		await centre(page).click();
		await page.keyboard.press(`${MOD}+ArrowUp`);
		await page.keyboard.press("Shift+ArrowRight");
		await page.keyboard.press("Shift+ArrowRight"); // "Sy" is selected
		await pressAsh(page);
		expect((await lines(centre(page))).startsWith("ænthetic")).toBe(true);
	});
});

const FIELDS = [
	{ name: "a plot note", file: BOOK, tab: "novel", box: (p: Page) => p.getByRole("textbox", { name: "Plot note for Chapter 2" }) },
	{ name: "the synopsis", file: BOOK, tab: "novel", box: (p: Page) => p.getByRole("region", { name: "Novel overview" }).getByRole("textbox", { name: /^Synopsis of / }), },
	{ name: "the series description", file: SERIES, tab: "series", box: (p: Page) => p.getByRole("region", { name: "Series overview" }).getByRole("textbox", { name: "Series description" }) },
] as const;

for (const f of FIELDS) {
	test.describe(`the special-characters button in ${f.name}`, () => {
		test("goes in at the caret, keeps the focus in the field, commits nothing by itself, and one ⌘Z takes it back", async ({ page }) => {
			await openProject(page);
			await flipSide(page);
			await page.getByRole("tab", { name: f.tab }).click();
			const box = f.box(page);
			await expect(box).toBeVisible();
			await endOf(box, page);
			await page.keyboard.type("x ");
			const before = await onDisk(page, f.file);
			await CHARS(page).click();
			await expect(box).toBeFocused(); // clicking the button takes nothing from the field
			await ash(page).click();
			await expect(box).toBeFocused();
			expect((await lines(box)).endsWith("x æ")).toBe(true);
			await page.keyboard.type("Z");
			expect((await lines(box)).endsWith("x æZ")).toBe(true);
			expect(await onDisk(page, f.file)).toBe(before); // still only in the field: nothing was committed by the button
			await page.keyboard.press(`${MOD}+z`); // the Z
			await page.keyboard.press(`${MOD}+z`); // one more: the character, and nothing else
			expect((await lines(box)).endsWith("x æ")).toBe(false);
			expect((await lines(box)).endsWith("x ")).toBe(true);
			// put it back and leave the field: now it is committed, as any typing is
			await pressAsh(page);
			await page.locator(".sf-overview-title").first().click();
			await expect.poll(async () => (await onDisk(page, f.file)).includes("æ")).toBe(true);
		});
	});
}

test.describe("the special-characters button: when it is greyed out", () => {
	const off = async (page: Page, reason: RegExp) => {
		await expect(CHARS(page)).toHaveClass(/is-off/);
		await CHARS(page).click();
		await expect(palette(page)).toContainText(reason);
		await expect(ash(page)).toBeDisabled();
		await page.keyboard.press("Escape");
	};

	test("it is there with no note open, and ready: the chapter is the target", async ({ page }) => {
		await openProject(page);
		await expect(CHARS(page)).toBeVisible();
		await expect(CHARS(page)).not.toHaveClass(/is-off/);
		await expect(page.locator(".sf-lore-host")).toBeEmpty();
	});

	test("before any editor has been focused: the open chapter is the target; with no chapter open it is greyed", async ({ page }) => {
		await openProject(page);
		// forget where the author was (what a newly opened project starts with); the chapter is open and visible
		const module = `/@fs${process.cwd()}/src/ui/editor/lastWriting.ts`; // the preview's own copy of the module the app loaded
		const forget = () => page.evaluate(async (m) => (await import(/* @vite-ignore */ m)).resetWriting(), module);
		await forget();
		await expect(CHARS(page)).not.toHaveClass(/is-off/);
		await pressAsh(page);
		expect((await lines(centre(page))).includes("æ")).toBe(true); // at the chapter's own caret
		// with the chapter closed as well there is nowhere
		await page.evaluate(() => window.__app.editors!.close("centre"));
		await forget();
		await off(page, /Open a chapter/);
	});

	test("the chapter is covered by an overview", async ({ page }) => {
		await openProject(page);
		await endOf(centre(page), page);
		await expect(CHARS(page)).not.toHaveClass(/is-off/);
		await flipSide(page);
		await page.getByRole("tab", { name: "series" }).click();
		await off(page, /Close the overview/);
	});

	test("a note that is read-only", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await expect(lore(page)).toBeVisible();
		await off(page, /read-only/);
	});

	test("the note was closed", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await endOf(lore(page), page);
		await expect(CHARS(page)).not.toHaveClass(/is-off/);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click(); // closes it
		await expect(lore(page)).toHaveCount(0);
		await off(page, /closed/);
	});

	test("the field's card was unmounted", async ({ page }) => {
		await openProject(page);
		await flipSide(page);
		await page.getByRole("tab", { name: "novel" }).click();
		await endOf(FIELDS[0].box(page), page);
		await expect(CHARS(page)).not.toHaveClass(/is-off/);
		await page.getByRole("tab", { name: "series" }).click(); // the novel overview goes
		await expect(FIELDS[0].box(page)).toHaveCount(0);
		await off(page, /closed/);
	});
});

test("from the keyboard: the button takes the focus, and the character goes into the last editor, which gets it back", async ({ page }) => {
	await openProject(page);
	await endOf(centre(page), page);
	await CHARS(page).focus();
	await page.keyboard.press("Enter");
	await expect(ash(page)).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(centre(page)).toBeFocused();
	expect((await lines(centre(page))).endsWith("æ")).toBe(true);
});
