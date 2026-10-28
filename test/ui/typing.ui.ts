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

	test("it does not act in a plot note, only smart punctuation does; and the switch turns it off", async ({ page }) => {
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
