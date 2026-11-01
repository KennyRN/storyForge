import { expect, test, type Locator, type Page } from "@playwright/test";
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

// ---------------------------------------------------------------------------------------------------- the editor

const CH1 = "_story-library/aaa/ch-a1.md";
const MOD = "ControlOrMeta";
const content = (page: Page) => page.locator(".sf-slot--centre .cm-content");
/** The document as lines of text, as the editor shows them. */
const doc = (page: Page): Promise<string> => content(page).evaluate((el) => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"));
const outsideChange = async (page: Page, path: string, text: string) => {
	await page.evaluate(([p, t]) => window.__preview.touch(p, t), [path, text]);
	await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), path);
};

/** An editor holding `text`, with the caret at the very end, ready to type. */
async function editorWith(page: Page, text = "Old text.\n"): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await outsideChange(page, CH1, text);
	await page.evaluate((p) => window.__app.editors!.open("centre", p), CH1);
	await content(page).click();
	await page.keyboard.press(`${MOD}+ArrowDown`);
	if (text !== "") await page.keyboard.press("Enter"); // a new line: the typing starts a new run
}

test.describe("smart punctuation in the editor", () => {
	test("typing gives curly quotes, an en dash, an em dash and an ellipsis", async ({ page }) => {
		await editorWith(page);
		await page.keyboard.type("'Don't say \"never\" - not yet,' she said. Well--then... 'twas the '90s.");
		expect(await doc(page)).toBe("Old text.\n‘Don’t say “never” – not yet,’ she said. Well—then… ’twas the ’90s.");
		await shot(page, "typing-smart-punctuation");
	});

	test("one ⌘Z straight after a curl gives back the straight character, a second undoes the typing, ⇧⌘Z redoes the curl", async ({ page }) => {
		await editorWith(page, "");
		await page.keyboard.type("don'");
		expect(await doc(page)).toBe("don’");
		await page.keyboard.press(`${MOD}+z`);
		expect(await doc(page)).toBe("don'");
		await page.keyboard.press(`${MOD}+Shift+z`);
		expect(await doc(page)).toBe("don’");
		await page.keyboard.press(`${MOD}+z`);
		await page.keyboard.press(`${MOD}+z`); // the typing itself
		expect(await doc(page)).toBe("");
	});

	test("the same for an en dash, and for a dash and a quote together", async ({ page }) => {
		await editorWith(page, "");
		await page.keyboard.type("a - b");
		expect(await doc(page)).toBe("a – b");
		await page.keyboard.press(`${MOD}+z`);
		expect(await doc(page)).toBe("a - b");
		await page.keyboard.press(`${MOD}+z`);
		await page.keyboard.press(`${MOD}+z`);
		expect(await doc(page)).toBe("");
		await page.keyboard.type('she said--"');
		expect(await doc(page)).toBe("she said—“");
		await page.keyboard.press(`${MOD}+z`); // both changes of that keystroke go together
		expect(await doc(page)).toBe('she said--"');
	});

	test("nothing that was already there is changed, and nothing inside links, code, comments or URLs", async ({ page }) => {
		await editorWith(page, "Old 'text' -- here... and - there.\n");
		await page.keyboard.type("x ");
		expect(await doc(page)).toBe("Old 'text' -- here... and - there.\nx ");
		await page.keyboard.type("[[it's]] `don't` %% 'x' -- y %% https://a.b/it's");
		expect(await doc(page)).toBe("Old 'text' -- here... and - there.\nx [[it's]] `don't` %% 'x' -- y %% https://a.b/it's");
	});

	test("pasted text is never changed, and typing after it is", async ({ page }) => {
		await editorWith(page, "");
		await content(page).evaluate((el) => {
			const data = new DataTransfer();
			data.setData("text/plain", "'a' -- b... ");
			el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
		});
		expect(await doc(page)).toBe("'a' -- b... ");
		await page.keyboard.type("'c'");
		expect(await doc(page)).toBe("'a' -- b... ‘c’");
	});

	test("a reload from disk is never changed", async ({ page }) => {
		await editorWith(page, "Start.\n");
		await page.keyboard.type("x"); // the author types something first, as in the editor's own reload test
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p), CH1), { timeout: 4000 }).toContain("x");
		await outsideChange(page, CH1, "Straight 'quotes' -- and... more\n");
		await expect.poll(() => doc(page)).toContain("Straight 'quotes' -- and... more");
		expect(await doc(page)).not.toMatch(/[‘’“”—–…]/);
	});

	test("the switch turns smart punctuation off, and on again", async ({ page }) => {
		await editorWith(page, "");
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		const group = dialog(page).locator('section[aria-label="Typing"]');
		await group.getByLabel("Curly quotes, dashes and ellipses as you type").uncheck();
		await expect.poll(() => projectMd(page)).toContain("typing-smart-punctuation: false");
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await content(page).click();
		await page.keyboard.type("don't");
		expect(await doc(page)).toBe("don't");
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await dialog(page).locator('section[aria-label="Typing"]').getByLabel("Curly quotes, dashes and ellipses as you type").check();
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type(" can't");
		expect(await doc(page)).toBe("don't can’t");
	});

	test("the elision list is the project's: a word added to it takes the apostrophe", async ({ page }) => {
		await editorWith(page, "");
		await page.keyboard.type("'ere ");
		expect(await doc(page)).toBe("‘ere ");
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		const group = dialog(page).locator('section[aria-label="Typing"]');
		await group.getByLabel("Add to Words that begin with an apostrophe").fill("ere");
		await group.getByLabel("Add to Words that begin with an apostrophe").press("Enter");
		await expect(group.getByRole("list", { name: "Words that begin with an apostrophe" })).toContainText("ere");
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type("'ere ");
		expect(await doc(page)).toBe("‘ere ’ere ");
	});

	test("it is saved as typed: the curly characters reach the file", async ({ page }) => {
		await editorWith(page, "");
		await page.keyboard.type("It's -- well... 'tis.");
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p), CH1), { timeout: 4000 }).toContain("It’s — well… ’tis.");
	});
});

// ------------------------------------------------------------------------------------------------ name autocorrect

async function addToList(page: Page, label: string, entry: string): Promise<void> {
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	const group = dialog(page).locator('section[aria-label="Typing"]');
	await group.getByLabel(`Add to ${label}`).fill(entry);
	await group.getByLabel(`Add to ${label}`).press("Enter");
	await expect(group.getByRole("list", { name: label })).toContainText(entry);
	await dialog(page).getByRole("button", { name: "Done" }).click();
	await content(page).click();
	await page.keyboard.press(`${MOD}+ArrowDown`);
	await page.keyboard.press("Enter");
}

test.describe("name autocorrect in the editor", () => {
	test("a Codex name typed in lower case is corrected when the word is finished, and a possessive is kept", async ({ page }) => {
		await editorWith(page);
		await page.keyboard.type("jane and sam. Jane's boat; sam's.");
		expect(await doc(page)).toBe("Old text.\nJane and Sam. Jane’s boat; Sam’s.");
	});

	test("a name from the project's word list is corrected too, with its joined letters", async ({ page }) => {
		await editorWith(page, "");
		await addToList(page, "Names without a Codex note", "Ælfric");
		await page.keyboard.type("aelfric rode. Aelfric's horse ");
		expect(await doc(page)).toBe("\nÆlfric rode. Ælfric’s horse ");
	});

	test("one ⌘Z gives back what was typed, and offers to stop correcting a name that was typed in lower case", async ({ page }) => {
		await editorWith(page, "");
		await page.keyboard.type("sam ");
		expect(await doc(page)).toBe("Sam ");
		await page.keyboard.press(`${MOD}+z`);
		expect(await doc(page)).toBe("sam ");
		const offer = page.getByRole("status").filter({ hasText: "Stop correcting “Sam”" });
		await expect(offer).toBeVisible();
		await offer.getByRole("button", { name: "Stop correcting" }).click();
		await expect.poll(() => projectMd(page)).toMatch(/typing-name-opt-outs:[\s\S]*Sam/);
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type("sam, Sam, SAM ");
		expect(await doc(page)).toBe("sam sam, Sam, Sam "); // lower case left alone, an exact Sam untouched, SAM corrected
	});

	test("a name opted out of is left alone in lower case, and corrected when it has a capital but no accent", async ({ page }) => {
		await editorWith(page, "");
		await addToList(page, "Names without a Codex note", "Red Blossom");
		await addToList(page, "Names that are also ordinary words", "Red Blossom");
		await page.keyboard.type("the red blossom fell. Red blossom. ");
		expect(await doc(page)).toBe("\n\nthe red blossom fell. Red Blossom. ");
	});

	test("the switch turns it off", async ({ page }) => {
		await editorWith(page, "");
		await page.keyboard.type("jane ");
		expect(await doc(page)).toBe("Jane ");
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await dialog(page).locator('section[aria-label="Typing"]').getByLabel("Correct Codex names as you type them").uncheck();
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type("jane ");
		expect(await doc(page)).toBe("Jane jane ");
	});

	test("an alias that is a real second name is corrected, and the Codex's own text is never changed", async ({ page }) => {
		await editorWith(page, "");
		await outsideChange(page, "Codex/Ælfric.md", "---\naliases:\n  - Ælf\n---\nThe king.\n");
		await expect.poll(async () => {
			await content(page).click();
			await page.keyboard.press(`${MOD}+ArrowDown`);
			await page.keyboard.type("aelf ");
			return doc(page);
		}).toContain("Ælf ");
		expect(await page.evaluate((p) => window.__preview.read(p), "Codex/Ælfric.md")).toBe("---\naliases:\n  - Ælf\n---\nThe king.\n");
	});
});

// ------------------------------------------------------------------------------------------------------ shortcodes

async function addShortcode(page: Page, code: string, text: string): Promise<void> {
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	const group = dialog(page).locator('section[aria-label="Typing"]');
	await group.getByLabel("Shortcode letters").fill(code);
	await group.getByLabel("Shortcode full text").fill(text);
	await group.getByLabel("Shortcode full text").press("Enter");
	await expect(group.getByRole("list", { name: "Shortcodes" })).toContainText(`~${code.replace(/^~/, "")}`);
	await dialog(page).getByRole("button", { name: "Done" }).click();
	await content(page).click();
	await page.keyboard.press(`${MOD}+ArrowDown`);
	await page.keyboard.press("Enter");
}
const popup = (page: Page) => page.getByRole("listbox", { name: "Shortcodes" });

test.describe("shortcodes in the editor", () => {
	test("~ and the letters offer the code; Tab puts in the full text; one ⌘Z gives back what was typed", async ({ page }) => {
		await editorWith(page, "");
		await addShortcode(page, "th", "the Right Honourable");
		await page.keyboard.type("He met ~th");
		await expect(popup(page)).toBeVisible();
		await expect(popup(page).getByRole("option")).toHaveCount(1);
		await expect(popup(page).getByRole("option", { name: /~th/ })).toContainText("the Right Honourable");
		await shot(page, "typing-shortcode-popup");
		await page.keyboard.press("Tab");
		expect(await doc(page)).toContain("He met the Right Honourable");
		await expect(popup(page)).toHaveCount(0);
		await page.keyboard.press(`${MOD}+z`);
		expect(await doc(page)).toContain("He met ~th");
		expect(await doc(page)).not.toContain("Right Honourable");
		await page.keyboard.press(`${MOD}+Shift+z`);
		expect(await doc(page)).toContain("He met the Right Honourable");
	});

	test("typing after the accepted text carries on, and a name in it is not corrected behind your back", async ({ page }) => {
		await editorWith(page, "");
		await addShortcode(page, "j", "jane");
		await page.keyboard.type("~j");
		await page.keyboard.press("Tab");
		await page.keyboard.type(" smiled ");
		expect(await doc(page)).toContain("jane smiled "); // what the author defined is what goes in
	});

	test("Escape dismisses it, and the code is left as typed", async ({ page }) => {
		await editorWith(page, "");
		await addShortcode(page, "th", "the Right Honourable");
		await page.keyboard.type("~th");
		await expect(popup(page)).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(popup(page)).toHaveCount(0);
		await page.keyboard.type("x");
		await expect(popup(page)).toHaveCount(0);
		expect(await doc(page)).toContain("~thx");
	});

	test("Return always makes a new paragraph, with the popup open or not, and any other key carries on typing", async ({ page }) => {
		await editorWith(page, "");
		await addShortcode(page, "th", "the Right Honourable");
		await page.keyboard.type("~th");
		await expect(popup(page)).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(popup(page)).toHaveCount(0);
		await page.keyboard.type("next");
		expect(await doc(page)).toContain("~th\nnext");
		await page.keyboard.type(" ~t");
		await expect(popup(page)).toBeVisible();
		await page.keyboard.type("z");
		await expect(popup(page)).toHaveCount(0); // no code begins ~tz
		expect(await doc(page)).toContain("~tz");
	});

	test("~~, ~ alone, ~ and a digit, and a ~ inside a word, protected text or old text never open it", async ({ page }) => {
		await editorWith(page, "old ~t");
		await addShortcode(page, "th", "the Right Honourable");
		for (const typed of ["~~th", " ~ ", " ~9", " a~th", " [[~th", " `~th"]) {
			await page.keyboard.type(typed);
			await expect(popup(page), typed).toHaveCount(0);
		}
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type("");
		// old text that was already there: typing the rest of it doesn't open it
		await editorWith(page, "old ~t");
		await page.keyboard.type("h");
		await expect(popup(page)).toHaveCount(0);
	});

	test("the list is a listbox a screen reader can read: the highlighted entry is announced, and the arrows move it", async ({ page }) => {
		await editorWith(page, "");
		await addShortcode(page, "th", "the Right Honourable");
		await addShortcode(page, "tm", "the Master");
		await page.keyboard.type("~t");
		const options = popup(page).getByRole("option");
		await expect(options).toHaveCount(2);
		const box = page.getByRole("textbox", { name: "Text" });
		await expect(box).toHaveAttribute("aria-expanded", "true");
		await expect(box).toHaveAttribute("aria-haspopup", "listbox");
		const first = await options.nth(0).getAttribute("id");
		await expect(box).toHaveAttribute("aria-activedescendant", first!);
		await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("ArrowDown");
		const second = await options.nth(1).getAttribute("id");
		await expect(box).toHaveAttribute("aria-activedescendant", second!);
		await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
		await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");
		await page.keyboard.press("Tab");
		expect(await doc(page)).toContain("the Right Honourable".replace("Right Honourable", "Master"));
		await expect(box).not.toHaveAttribute("aria-expanded", "true");
	});

	test("Codex names are offered after ~ too, with their own switch", async ({ page }) => {
		await editorWith(page, "");
		await page.keyboard.type("~ja");
		await expect(popup(page).getByRole("option", { name: /Jane/ })).toContainText("Codex");
		await page.keyboard.press("Tab");
		expect(await doc(page)).toBe("Jane");
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await dialog(page).locator('section[aria-label="Typing"]').getByLabel("Offer Codex names after ~").uncheck();
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type(" ~sa");
		await expect(popup(page)).toHaveCount(0);
	});

	test("Tab does what it did when there is no popup, and the shortcodes switch turns the popup off", async ({ page }) => {
		await editorWith(page, "");
		await addShortcode(page, "th", "the Right Honourable");
		await page.keyboard.type("abc");
		await page.keyboard.press("Tab");
		expect(await doc(page)).toBe("\nabc"); // nothing put in (the new line is from adding the shortcode)
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await dialog(page).locator('section[aria-label="Typing"]').getByLabel("Shortcodes (~ then Tab)").uncheck();
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await content(page).click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.type(" ~th");
		await expect(popup(page)).toHaveCount(0);
	});
});

// ---------------------------------------------------------------------------------- the aids in the overview fields (decision 53)

const BOOK_A = "_story-library/novel-aaa.md";
const SERIES = "_story-library/series.md";
const flipSide = (page: Page) => page.getByRole("button", { name: "Flip side" }).click();
const lines = (box: Locator): Promise<string> => box.evaluate((el) => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"));

interface FieldKind {
	name: string;
	/** The file the field is written to. */
	file: string;
	/** Shows the field and returns its text box. */
	open: (page: Page) => Promise<Locator>;
	/** The element that, clicked, takes the focus out of the field without leaving the overview. */
	away: (page: Page) => Locator;
}
const KINDS: FieldKind[] = [
	{
		name: "a plot note",
		file: BOOK_A,
		open: async (page) => {
			await flipSide(page);
			await page.getByRole("tab", { name: "novel" }).click();
			return page.getByRole("textbox", { name: "Plot note for Chapter 2" });
		},
		away: (page) => page.getByRole("region", { name: "Novel overview" }).locator(".sf-overview-title"),
	},
	{
		name: "the novel's synopsis",
		file: BOOK_A,
		open: async (page) => {
			await flipSide(page);
			await page.getByRole("tab", { name: "novel" }).click();
			return page.getByRole("region", { name: "Novel overview" }).getByRole("textbox", { name: /^Synopsis of / });
		},
		away: (page) => page.getByRole("region", { name: "Novel overview" }).locator(".sf-overview-title"),
	},
	{
		name: "the series description",
		file: SERIES,
		open: async (page) => {
			await flipSide(page);
			await page.getByRole("tab", { name: "series" }).click();
			return page.getByRole("region", { name: "Series overview" }).getByRole("textbox", { name: "Series description" });
		},
		away: (page) => page.getByRole("region", { name: "Series overview" }).locator(".sf-overview-title"),
	},
];

/** The project open, and the typing settings changed (before any overview covers the editor). */
async function projectWith(page: Page, settings: { codes?: [string, string][]; lists?: [string, string][] } = {}): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	if (!settings.codes?.length && !settings.lists?.length) return;
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	const group = dialog(page).locator('section[aria-label="Typing"]');
	for (const [label, entry] of settings.lists ?? []) {
		await group.getByLabel(`Add to ${label}`).fill(entry);
		await group.getByLabel(`Add to ${label}`).press("Enter");
		await expect(group.getByRole("list", { name: label })).toContainText(entry);
	}
	for (const [code, text] of settings.codes ?? []) {
		await group.getByLabel("Shortcode letters").fill(code);
		await group.getByLabel("Shortcode full text").fill(text);
		await group.getByLabel("Shortcode full text").press("Enter");
		await expect(group.getByRole("list", { name: "Shortcodes" })).toContainText(`~${code}`);
	}
	await dialog(page).getByRole("button", { name: "Done" }).click();
}
/** Into the field, at the end, on a new line (so the typing is a new run). */
async function intoField(field: Locator, page: Page): Promise<void> {
	await field.click();
	await page.keyboard.press(`${MOD}+ArrowDown`);
	await page.keyboard.press("Enter");
}
const typedPart = async (field: Locator): Promise<string> => (await lines(field)).split("\n").slice(1).join("\n");

for (const kind of KINDS) {
	test.describe(`name autocorrect in ${kind.name}`, () => {
		test("a Codex name is corrected when the word is finished, a possessive is kept, a multi-word name matches whole", async ({ page }) => {
			await projectWith(page, { lists: [["Names without a Codex note", "Ælfric"], ["Names without a Codex note", "Red Blossom"]] });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("jane and sam. Jane's boat; sam's. aelfric rode. red blossom fell. ");
			expect(await typedPart(field)).toBe("Jane and Sam. Jane’s boat; Sam’s. Ælfric rode. Red Blossom fell. ");
			await shot(page, `typing-field-name-${kind.name.replace(/[^a-z]+/gi, "-")}`);
		});

		test("one ⌘Z gives back exactly what was typed, then offers to stop correcting a name typed in lower case", async ({ page }) => {
			await projectWith(page);
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("sam ");
			expect(await typedPart(field)).toBe("Sam ");
			await page.keyboard.press(`${MOD}+z`);
			expect(await typedPart(field)).toBe("sam ");
			await expect(page.getByRole("status").filter({ hasText: "Stop correcting “Sam”" })).toBeVisible();
			await page.keyboard.press(`${MOD}+Shift+z`);
			expect(await typedPart(field)).toBe("Sam ");
		});

		test("a name opted out of is left alone in lower case, and corrected when it has a capital but no accent", async ({ page }) => {
			await projectWith(page, { lists: [["Names without a Codex note", "Red Blossom"], ["Names that are also ordinary words", "Red Blossom"]] });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("the red blossom fell. Red blossom. ");
			expect(await typedPart(field)).toBe("the red blossom fell. Red Blossom. ");
		});

		test("a name inside a [[link]] is left alone, and the one after it is corrected", async ({ page }) => {
			await projectWith(page);
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("see [[jane]] and jane ");
			expect(await typedPart(field)).toBe("see [[jane]] and Jane ");
		});

		test("the switch covers the field", async ({ page }) => {
			await projectWith(page);
			await page.evaluate(() => window.__preview.emit("menu", "settings"));
			await dialog(page).locator('section[aria-label="Typing"]').getByLabel("Correct Codex names as you type them").uncheck();
			await dialog(page).getByRole("button", { name: "Done" }).click();
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("jane ");
			expect(await typedPart(field)).toBe("jane ");
		});
	});

	test.describe(`shortcodes in ${kind.name}`, () => {
		const TH: [string, string][] = [["th", "the Right Honourable"]];

		test("~ and the letters offer the code; Tab puts in the full text; one ⌘Z gives back what was typed, ⇧⌘Z puts it back", async ({ page }) => {
			await projectWith(page, { codes: TH });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("He met ~th");
			await expect(popup(page)).toBeVisible();
			await expect(popup(page).getByRole("option", { name: /~th/ })).toContainText("the Right Honourable");
			await expect(field).toHaveAttribute("aria-expanded", "true");
			await shot(page, `typing-field-shortcode-${kind.name.replace(/[^a-z]+/gi, "-")}`);
			await page.keyboard.press("Tab");
			expect(await typedPart(field)).toBe("He met the Right Honourable");
			await expect(popup(page)).toHaveCount(0);
			await expect(field).toBeFocused();
			await page.keyboard.press(`${MOD}+z`);
			expect(await typedPart(field)).toBe("He met ~th");
			await page.keyboard.press(`${MOD}+Shift+z`);
			expect(await typedPart(field)).toBe("He met the Right Honourable");
		});

		test("Codex names are offered after ~ too; ~~, ~ alone, protected text and struck text never open it", async ({ page }) => {
			await projectWith(page, { codes: TH });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("~ja");
			await expect(popup(page).getByRole("option", { name: /Jane/ })).toContainText("Codex");
			await page.keyboard.press("Tab");
			expect(await typedPart(field)).toBe("Jane");
			for (const typed of [" ~~th", " ~ ", " ~9", " a~th", " [[~th", " `~th", " ~~struck ~th"]) {
				await page.keyboard.type(typed);
				await expect(popup(page), typed).toHaveCount(0);
			}
		});

		test("Tab leaves the field when no popup shows (no trap), and puts nothing in", async ({ page }) => {
			await projectWith(page, { codes: TH });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("abc");
			await page.keyboard.press("Tab");
			await expect(field).not.toBeFocused();
			expect(await typedPart(field)).toBe("abc");
			// and with a popup that Escape has dismissed
			await intoField(field, page);
			await page.keyboard.type("~th");
			await expect(popup(page)).toBeVisible();
			await page.keyboard.press("Escape");
			await page.keyboard.press("Tab");
			await expect(field).not.toBeFocused();
			expect(await typedPart(field)).toContain("~th");
		});

		test("Escape dismisses the popup only: the field keeps its focus and its text, and the overview stays", async ({ page }) => {
			await projectWith(page, { codes: TH });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("~th");
			await expect(popup(page)).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(popup(page)).toHaveCount(0);
			await expect(field).toBeFocused();
			await page.keyboard.type("x");
			await expect(popup(page)).toHaveCount(0);
			expect(await typedPart(field)).toBe("~thx");
			await expect(kind.away(page)).toBeVisible();
		});

		test("Return makes a new line and never accepts, with the popup open or not", async ({ page }) => {
			await projectWith(page, { codes: TH });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("~th");
			await expect(popup(page)).toBeVisible();
			await page.keyboard.press("Enter");
			await expect(popup(page)).toHaveCount(0);
			await page.keyboard.type("next");
			expect(await typedPart(field)).toBe("~th\nnext");
		});

		test("the popup is drawn outside the card and the scrolling, and stays inside the window beside a field near its edge", async ({ page }) => {
			await projectWith(page, { codes: TH });
			await page.evaluate(() => window.__preview.emit("menu", "toggle-lore")); // the context panel away: the overview reaches the window's right edge
			const field = await kind.open(page);
			await intoField(field, page);
			// the caret at the right-hand end of a full line; the panels are held in pixels so a narrower window doesn't change the geometry this test sets up
			await page.evaluate(() => (window.__app as any).setWidthUnit("px"));
			await page.setViewportSize({ width: 900, height: 700 });
			let height = (await field.boundingBox())!.height;
			for (let i = 0; i < 100; i++) {
				await page.keyboard.type("x ");
				const now = (await field.boundingBox())!.height;
				if (now > height) {
					// the unit that wrapped, and two more, so that "~th" (a word of its own) fits on the line whatever the font's widths
					for (let k = 0; k < 6; k++) await page.keyboard.press("Backspace");
					break;
				}
				height = now;
			}
			await page.keyboard.type("~th");
			await expect(popup(page)).toBeVisible();
			// where the caret's line really is, once the page has stopped scrolling it into view
			const caret = () => page.evaluate(() => { const r = getSelection()!.getRangeAt(0).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; });
			let line = await caret();
			await expect.poll(async () => {
				await page.waitForTimeout(120);
				const now = await caret();
				const same = now.top === line.top && now.bottom === line.bottom;
				line = now;
				return same;
			}).toBe(true);
			const below = (await popup(page).boundingBox())!;
			// then the window's bottom edge comes up to just under that line: there is no room below it, so the popup must go above
			await page.setViewportSize({ width: 900, height: Math.ceil(line.bottom + 4) });
			let box!: { x: number; y: number; width: number; height: number };
			await expect.poll(async () => { const p = await popup(page).boundingBox(); if (p) box = p; return !!p && p.y >= 0 && p.y + p.height <= line.top + 2; }).toBe(true);
			const win = page.viewportSize()!;
			const fieldBox = (await field.boundingBox())!;
			expect(fieldBox.x + fieldBox.width, "the field reaches the window's right edge").toBeGreaterThan(win.width - 80);
			expect(below.x + below.width, "it was at the window's right edge").toBeGreaterThanOrEqual(win.width - 4);
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(win.width);
			expect(box.y + box.height).toBeLessThanOrEqual(win.height);
			expect(await popup(page).evaluate((el) => el.closest(".sf-overview, .sf-card, .cm-editor"))).toBeNull(); // not inside anything that clips it
			// nothing covers it: the element at its centre is the popup
			expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".sf-shortcode-popup"), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
			// and it still works from there
			await page.keyboard.press("Tab");
			expect(await typedPart(field)).toContain("the Right Honourable");
		});

		test("leaving the field with the popup showing leaves the code as typed, and the field commits as normal", async ({ page }) => {
			await projectWith(page, { codes: TH });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("~th");
			await expect(popup(page)).toBeVisible();
			await kind.away(page).click();
			await expect(popup(page)).toHaveCount(0);
			expect(await typedPart(field)).toBe("~th");
			await expect.poll(() => page.evaluate((f) => window.__preview.read(f), kind.file)).toContain("~th");
			expect(await page.evaluate((f) => window.__preview.read(f), kind.file)).not.toContain("Right Honourable");
		});

		test("the app closing with the popup showing leaves the code as typed, and the field is committed", async ({ page }) => {
			await projectWith(page, { codes: TH });
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("~th");
			await expect(popup(page)).toBeVisible();
			await page.evaluate(() => window.__preview.emit("close-requested"));
			await expect.poll(() => page.evaluate((f) => window.__preview.read(f), kind.file)).toContain("~th");
			expect(await page.evaluate((f) => window.__preview.read(f), kind.file)).not.toContain("Right Honourable");
		});

		test("the shortcodes switch covers the field", async ({ page }) => {
			await projectWith(page, { codes: TH });
			await page.evaluate(() => window.__preview.emit("menu", "settings"));
			await dialog(page).locator('section[aria-label="Typing"]').getByLabel("Shortcodes (~ then Tab)").uncheck();
			await dialog(page).getByRole("button", { name: "Done" }).click();
			const field = await kind.open(page);
			await intoField(field, page);
			await page.keyboard.type("~th");
			await expect(popup(page)).toHaveCount(0);
			expect(await typedPart(field)).toBe("~th");
		});
	});
}

test.describe("a Codex note in the context panel has both aids, as a chapter does", () => {
	test("a name is corrected and a shortcode is offered and accepted, with one ⌘Z each", async ({ page }) => {
		const lastLine = async (box: Locator): Promise<string> => (await lines(box)).split("\n").pop()!;
		await projectWith(page, { codes: [["th", "the Right Honourable"]] });
		await page.evaluate(() => window.__app.editors!.open("lore", "Codex/Harbour.md"));
		const note = page.locator(".sf-slot--lore .cm-content");
		await note.click();
		await page.keyboard.press(`${MOD}+ArrowDown`);
		await page.keyboard.press("Enter");
		await page.keyboard.type("sam ");
		expect(await lastLine(note)).toBe("Sam ");
		await page.keyboard.press(`${MOD}+z`);
		expect(await lastLine(note)).toBe("sam ");
		await page.keyboard.type("~th");
		await expect(popup(page)).toBeVisible();
		await page.keyboard.press("Tab");
		expect(await lastLine(note)).toContain("the Right Honourable");
		await page.keyboard.press(`${MOD}+z`);
		expect(await lastLine(note)).toContain("~th");
	});
});

test.describe("the plain text boxes take no aids (decision 47)", () => {
	test("a settings field and the find box leave names, quotes and ~ alone", async ({ page }) => {
		await projectWith(page, { codes: [["th", "the Right Honourable"]] });
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		const box = dialog(page).locator('section[aria-label="Typing"]').getByLabel("Add to Names without a Codex note");
		await box.fill("");
		await box.pressSequentially("jane's ~th");
		await expect(box).toHaveValue("jane's ~th");
		await expect(popup(page)).toHaveCount(0);
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await page.evaluate(() => window.__preview.emit("menu", "find"));
		const find = page.getByRole("textbox", { name: "Find" });
		await find.pressSequentially("jane's ~th");
		await expect(find).toHaveValue("jane's ~th");
		await expect(popup(page)).toHaveCount(0);
	});
});

// ---------------------------------------------------------------------------------- the special-characters button

const CHARS = (page: Page) => page.getByRole("button", { name: "Special characters", exact: true });
const palette = (page: Page) => page.getByRole("group", { name: "Special characters" });
const loreCodex = (page: Page, name: string) => page.locator(".sf-codex-file", { hasText: name });

test.describe("the special-characters button", () => {
	test("it sits at the right of the context panel's bottom row, always: with a note open or not", async ({ page }) => {
		await editorWith(page);
		await expect(CHARS(page)).toBeVisible();
		const lore = (await page.locator(".sf-slot--lore").boundingBox())!;
		const box = (await CHARS(page).boundingBox())!;
		expect(box.x + box.width).toBeGreaterThan(lore.x + lore.width - 40);
		expect(box.y + box.height).toBeGreaterThan(lore.y + lore.height - 40);
		// a Codex entry open in the context panel: the button is still there, in the bottom row below the card
		await loreCodex(page, "Jane").click();
		await expect(page.locator(".sf-slot--lore .cm-content")).toBeVisible();
		await expect(CHARS(page)).toBeVisible();
		const row = (await page.locator(".sf-context-row").boundingBox())!;
		const card = (await page.locator(".sf-lore-host > .sf-editor-pane").boundingBox())!;
		const b2 = (await CHARS(page).boundingBox())!;
		expect(b2.y).toBeGreaterThanOrEqual(row.y);
		expect(b2.y).toBeGreaterThanOrEqual(card.y + card.height);
		await loreCodex(page, "Jane").click(); // clicking it again closes it
		await expect(CHARS(page)).toBeVisible();
		// the context panel hidden: no button
		await page.evaluate(() => window.__preview.emit("menu", "toggle-lore"));
		await expect(CHARS(page)).toBeHidden();
		await page.evaluate(() => window.__preview.emit("menu", "toggle-lore"));
		await expect(CHARS(page)).toBeVisible();
		await shot(page, "typing-special-characters-button");
	});

	test("its switch removes it", async ({ page }) => {
		await editorWith(page);
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await dialog(page).locator('section[aria-label="Typing"]').getByLabel("Special-characters button in the context panel").uncheck();
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await expect(CHARS(page)).toBeHidden();
	});

	test("the palette lists the project's characters by their spoken names", async ({ page }) => {
		await editorWith(page);
		await CHARS(page).click();
		await expect(palette(page)).toBeVisible();
		for (const name of ["ash", "capital ash", "ethel", "capital ethel"]) await expect(palette(page).getByRole("button", { name, exact: true })).toBeVisible();
		await expect(CHARS(page)).toHaveAttribute("aria-expanded", "true");
		await shot(page, "typing-special-characters-palette");
	});

	test("a character goes in at the chapter's cursor, replaces a selection, takes no focus on the way, and one ⌘Z takes it back", async ({ page }) => {
		await editorWith(page, "Hello world");
		// put the caret after "Hello" (the editor is where the author is)
		await page.keyboard.press(`${MOD}+ArrowUp`);
		for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
		await CHARS(page).click();
		// the editor still has focus: opening the palette moved nothing
		expect(await page.evaluate(() => !!document.activeElement?.closest(".sf-slot--centre"))).toBe(true);
		await palette(page).getByRole("button", { name: "ash", exact: true }).click();
		expect(await doc(page)).toBe("Helloæ world\n");
		await expect(palette(page)).toHaveCount(0);
		expect(await page.evaluate(() => !!document.activeElement?.closest(".sf-slot--centre"))).toBe(true);
		await page.keyboard.type("x");
		expect(await doc(page)).toBe("Helloæx world\n");
		// a selection is replaced
		await page.keyboard.press("ArrowRight");
		for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowRight");
		await CHARS(page).click();
		await palette(page).getByRole("button", { name: "capital ethel", exact: true }).click();
		expect(await doc(page)).toBe("Helloæx Œ\n");
		await page.keyboard.press(`${MOD}+z`);
		expect(await doc(page)).toBe("Helloæx world\n");
	});

	test("from the keyboard: Enter opens it and moves into the palette, the arrows move, Enter chooses, Escape closes", async ({ page }) => {
		await editorWith(page, "ab");
		await CHARS(page).focus();
		await page.keyboard.press("Enter");
		await expect(palette(page).getByRole("button", { name: "ash", exact: true })).toBeFocused();
		await page.keyboard.press("ArrowRight");
		await expect(palette(page).getByRole("button", { name: "capital ash", exact: true })).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(palette(page)).toHaveCount(0);
		await expect(CHARS(page)).toBeFocused();
		await page.keyboard.press("Enter");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		expect(await doc(page)).toBe("ab\nœ"); // at the caret, on the new line
	});

	test("a character the author added is announced as itself with its code point", async ({ page }) => {
		await editorWith(page);
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		const group = dialog(page).locator('section[aria-label="Typing"]');
		await group.getByLabel("Add to Special characters").fill("ø");
		await group.getByLabel("Add to Special characters").press("Enter");
		await expect(group.getByRole("list", { name: "Special characters" })).toContainText("ø");
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await CHARS(page).click();
		await expect(palette(page).getByRole("button", { name: "ø, U+00F8", exact: true })).toBeVisible();
	});

	test("with nothing to put it in, the characters are off and the palette says why", async ({ page }) => {
		await editorWith(page);
		// an archived chapter is read-only
		await page.evaluate((p) => window.__app.editors!.open("centre", p), "_story-library/aaa/ch-a4.md");
		await CHARS(page).click();
		await expect(palette(page)).toContainText("This text is read-only.");
		await expect(palette(page).getByRole("button", { name: "ash", exact: true })).toBeDisabled();
		await page.keyboard.press("Escape");
		// an overview covering the editor
		await page.evaluate((p) => window.__app.editors!.open("centre", p), CH1);
		await page.getByRole("button", { name: "Flip side" }).click();
		await page.getByRole("tab", { name: "series" }).click();
		await CHARS(page).click();
		await expect(palette(page)).toContainText("Close the overview");
		await expect(palette(page).getByRole("button", { name: "ash", exact: true })).toBeDisabled();
	});
});
