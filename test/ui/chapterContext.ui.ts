import { expect, test, type Locator, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 14, commit 4 (§1.6, §1.7): on the library side's novel tab the context panel shows the chosen chapter: PoV, Location, the plot note
// and the chapter's text, read-only; and one chosen chapter is shared by both sides. The plot-note and PoV tests that lived on the overview's
// cards (parked in commit 2) are re-homed here, against the panel.

const BOOK_A = "_story-library/novel-aaa.md";
const CH1 = "_story-library/aaa/ch-a1.md";
const CH2 = "_story-library/aaa/ch-a2.md";

function tree(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) tree(full, base, out);
		else out[path.relative(base, full)] = readFileSync(full).toString("base64");
	}
	return out;
}
async function openProject(page: Page): Promise<string> {
	const { root } = await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	return root;
}
async function toNovelTab(page: Page): Promise<void> {
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await expect(overview(page)).toBeVisible();
}
const overview = (page: Page) => page.getByRole("region", { name: "Novel overview" });
const panel = (page: Page) => page.locator(".sf-chapter-context");
const plot = (page: Page) => panel(page).locator(".sf-note-field .cm-content");
const fieldText = (box: Locator): Promise<string> => box.evaluate((el) => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"));
const chapterText = (page: Page) => panel(page).locator(".sf-chapter-text .cm-content");
const read = (page: Page, f: string) => page.evaluate((x) => window.__preview.read(x), f);
const outside = async (page: Page, p: string, text: string) => {
	await page.evaluate(([x, t]) => window.__preview.touch(x, t), [p, text]);
	await page.evaluate((x) => window.__preview.emit("watch-batch", { paths: [x], rescan: false }), p);
};
/** Chooses a chapter by clicking its bar in the overview. */
const choose = async (page: Page, file: string) => {
	await overview(page).locator(`.sf-card[data-chapter="${file}"] .sf-bar`).click();
	await expect(panel(page).locator(".sf-note-field")).toBeVisible();
	await expect.poll(() => page.evaluate(() => (window.__app as any).nav.chapter)).toBe(file);
};
const placedRow = (page: Page, title: string) => page.locator(".sf-left [aria-label='Placed chapters'] [role=listitem], .sf-left [aria-label='Placed chapters'] > *").filter({ hasText: title });
const centreText = (page: Page) => page.locator(".sf-slot--centre .cm-content");

test.describe("the context panel on the novel tab", () => {
	test.beforeEach(async ({ page }) => {
		await openProject(page);
		await toNovelTab(page);
	});

	test("shows the chosen chapter's PoV, Location, plot note and text (read-only), on the panel's background with the note and the text on cards", async ({ page }) => {
		const p = panel(page);
		await expect(p).toBeVisible();
		await expect(p.locator('[data-row="pov"]')).toContainText("Jane");
		await expect(p.locator('[data-row="location"]')).toContainText("The Harbour");
		await expect.poll(() => fieldText(plot(page))).toBe("Jane reaches the harbour at dawn.");
		await expect(chapterText(page)).toContainText("Synthetic sentence number 1");
		// order: PoV and Location, the plot note, the text
		const tops = await p.evaluate((e) => [".sf-chapter-rows", ".sf-ctx-plot", ".sf-ctx-text"].map((q) => e.querySelector(q)!.getBoundingClientRect().top));
		expect(tops).toEqual([...tops].sort((a, b) => a - b));
		// the panel is bg_dim, the two cards bg0 with 10px corners and no border
		const probe = (v: string) => page.evaluate((x) => { const d = document.createElement("i"); d.style.backgroundColor = x; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }, v);
		for (const q of [".sf-ctx-plot", ".sf-ctx-text"]) {
			const cs = await p.locator(q).evaluate((e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.borderTopLeftRadius, s.borderTopWidth]; });
			expect(cs).toEqual([await probe("var(--purpose-editor-bg)"), "10px", "0px"]);
		}
		expect(await page.locator(".sf-slot--lore").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await probe("var(--purpose-panel-bg)"));
	});

	test("the Codex note's slot is hidden on the whole library side (Brief 19 §4), and on the storytelling side the panel is as it was", async ({ page }) => {
		await expect(page.locator(".sf-lore-host")).toBeHidden();
		await page.getByRole("tab", { name: "codex" }).click();
		await expect(panel(page)).toBeHidden();
		await expect(page.locator(".sf-lore-host")).toBeHidden();
		await page.getByRole("tab", { name: "series" }).click();
		await expect(panel(page)).toBeHidden();
		await expect(page.locator(".sf-lore-host")).toBeHidden();
		await page.getByRole("tab", { name: "archive" }).click();
		await expect(panel(page)).toBeHidden();
		await expect(page.locator(".sf-lore-host")).toBeHidden();
		await flipFace(page);
		await expect(panel(page)).toBeHidden();
		await expect(page.locator(".sf-lore-host")).toBeVisible();
	});

	test("with no chapter chosen the first placed chapter shows (Tweaks 2 §1.8), and the chapter being written is not changed", async ({ page }) => {
		await page.evaluate(() => { const m = window.__app as any; m.nav.chapter = null; m.touch("nav"); });
		await expect(page.getByRole("textbox", { name: /^Plot note for / })).toBeVisible();
		expect(await page.evaluate(() => (window.__app as any).nav.chapter)).toBeNull(); // an automatic choice only shows
		await page.evaluate(() => (window.__app as any).chooseChapter("aaa", "ch-a2.md")); // a click still switches it
		expect(await page.evaluate(() => (window.__app as any).nav.chapter)).toBe("ch-a2.md");
	});

	test("the chapter's text is read-only: not editable, selectable and copyable, and typing in it changes nothing", async ({ page }) => {
		const text = chapterText(page);
		await expect(text).toHaveAttribute("contenteditable", "false");
		await expect(text).toHaveAttribute("aria-readonly", "true");
		const before = await text.innerText();
		await text.click();
		await page.keyboard.type("nothing typed here");
		await page.keyboard.press("Delete");
		await expect.poll(() => text.innerText()).toBe(before); // (a waiting read: the text is unchanged after the typing)
		expect(await read(page, CH1)).not.toContain("nothing typed here");
		// selectable: a triple click selects a line, and the selection is the text
		await text.locator(".cm-line").first().click({ clickCount: 3 });
		expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("Synthetic sentence number 1");
	});

	test("the chapter's text shows words typed but not yet saved, and follows the session live, and an outside change", async ({ page }) => {
		await flipFace(page); // to the storytelling side, where the one editor is
		await centreText(page).click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" UNSAVEDWORDS");
		expect(await read(page, CH1)).not.toContain("UNSAVEDWORDS"); // not on disk yet
		await flipFace(page);
		await page.getByRole("tab", { name: "novel" }).click();
		await expect(chapterText(page)).toContainText("UNSAVEDWORDS"); // the session's text, not the file's
		expect(await read(page, CH1)).not.toContain("UNSAVEDWORDS");
		// an outside change reloads the editor, and the panel follows it
		const disk = await read(page, CH1);
		await outside(page, CH1, `${disk.trimEnd()} OUTSIDEWORDS\n`);
		await expect(chapterText(page)).toContainText("OUTSIDEWORDS");
	});

	test("a plot note is committed when it loses focus, keeping a leading space and further lines", async ({ page }) => {
		const field = plot(page);
		await field.click();
		await field.press("ControlOrMeta+a");
		await field.pressSequentially("  Jane leaves.\nThen the tide: turns.");
		expect(await read(page, BOOK_A)).not.toContain("Jane leaves."); // nothing is written while typing
		await overview(page).locator(".sf-overview-title").click();
		await expect.poll(() => read(page, BOOK_A)).toContain("Jane leaves.");
		await expect.poll(() => fieldText(field)).toBe("  Jane leaves.\nThen the tide: turns.");
	});

	test("a plot note is a multi-line text box: announced as one, Return makes a plain new line, Tab leaves it, spellcheck is on", async ({ page }) => {
		const field = page.getByRole("textbox", { name: "Plot note for Chapter 1" });
		await expect(field).toHaveAttribute("aria-multiline", "true");
		await expect(field).toHaveAttribute("spellcheck", "true");
		await choose(page, "ch-a5.md");
		await expect(panel(page).locator(".sf-note-field .cm-placeholder")).toHaveText("Plot note"); // Chapter 2 has no plot note
		await choose(page, "ch-a1.md");
		await field.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("  indented");
		await page.keyboard.press("Enter");
		await page.keyboard.type("next");
		expect(await fieldText(field)).toBe("  indented\nnext"); // no auto-indent
		await page.keyboard.press("Tab");
		expect(await page.evaluate(() => !!document.activeElement?.closest(".sf-note-field"))).toBe(false); // no Tab trap
	});

	test("the typing aids work in the plot note: curly quotes and dashes, one ⌘Z gives back what was typed, and they are saved", async ({ page }) => {
		await choose(page, "ch-a2.md");
		const field = plot(page);
		await field.click();
		await page.keyboard.type("It's - 'twas...");
		expect(await fieldText(field)).toBe("It’s – ’twas…");
		await page.keyboard.press("ControlOrMeta+z");
		expect(await fieldText(field)).toBe("It’s – ’twas...");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		expect(await fieldText(field)).toBe("It’s – ’twas…");
		await overview(page).locator(".sf-overview-title").click();
		await expect.poll(() => read(page, BOOK_A)).toContain("It’s – ’twas…");
	});

	test("Edit ▸ Undo and Redo reach the focused plot note's own history", async ({ page }) => {
		const field = plot(page);
		await field.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" And more.");
		expect(await fieldText(field)).toBe("Jane reaches the harbour at dawn. And more.");
		await page.evaluate(() => window.__preview.emit("menu", "undo"));
		expect(await fieldText(field)).toBe("Jane reaches the harbour at dawn.");
		await page.evaluate(() => window.__preview.emit("menu", "redo"));
		expect(await fieldText(field)).toBe("Jane reaches the harbour at dawn. And more.");
	});

	test("a plot note refreshed from disk starts a new history: ⌘Z can't bring back text that was replaced from outside", async ({ page }) => {
		const field = plot(page);
		await field.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("Mine.");
		await overview(page).locator(".sf-overview-title").click(); // committed
		await expect.poll(() => read(page, BOOK_A)).toContain("Mine.");
		const novel = await read(page, BOOK_A);
		await outside(page, BOOK_A, novel.replace("plot: Mine.", "plot: Theirs.\n"));
		await expect.poll(() => fieldText(plot(page))).toBe("Theirs.");
		await plot(page).click();
		await page.keyboard.press("ControlOrMeta+z");
		expect(await fieldText(plot(page))).toBe("Theirs.");
	});

	test("a plot note still being typed in is committed by a close request", async ({ page }) => {
		const field = plot(page);
		await field.click();
		await field.press("ControlOrMeta+a");
		await field.pressSequentially("Typed when the app was told to close.");
		expect(await read(page, BOOK_A)).not.toContain("Typed when the app");
		await page.evaluate(() => window.__preview.emit("close-requested"));
		await expect.poll(() => read(page, BOOK_A)).toContain("Typed when the app was told to close.");
	});

	test("a plot note changed on disk while it is being edited is not overwritten: the author's text goes to recovery and a notice says so", async ({ page }) => {
		const field = plot(page);
		await field.click();
		await field.press("ControlOrMeta+a");
		await field.pressSequentially("My own words");
		const novel = await read(page, BOOK_A);
		await outside(page, BOOK_A, novel.replace("plot: Jane reaches the harbour at dawn.", "plot: Somebody else.\n"));
		await overview(page).locator(".sf-overview-title").click();
		await expect(page.getByRole("alert").filter({ hasText: "changed on disk" })).toBeVisible();
		await expect.poll(() => fieldText(field)).toBe("Somebody else.");
		expect(await read(page, BOOK_A)).toContain("Somebody else.");
		await expect(page.getByRole("alert").filter({ hasText: "changed on disk" })).toContainText("recovery"); // the notice names where the author's text went (as it did on the card)
	});

	test("words typed in a plot note are never lost when the chosen chapter changes: they are saved to the chapter they belong to first", async ({ page }) => {
		const field = plot(page);
		await field.click();
		await field.press("ControlOrMeta+a");
		await field.pressSequentially("Typed, then the chapter changed.");
		expect(await read(page, BOOK_A)).not.toContain("Typed, then the chapter changed.");
		// the chosen chapter changes with the field still focused and unsaved (no blur: as when it changes from elsewhere)
		await page.evaluate(() => (window.__app as any).chooseChapter("aaa", "ch-a2.md"));
		await expect.poll(() => read(page, BOOK_A)).toMatch(/ch-a1\.md[\s\S]*Typed, then the chapter changed\./);
		await expect(page.getByRole("textbox", { name: /^Plot note for The Storm/ })).toBeVisible();
		await expect.poll(() => fieldText(plot(page))).not.toContain("Typed, then");
		// and the other way: back to the first, the words are there
		await page.evaluate(() => (window.__app as any).chooseChapter("aaa", "ch-a1.md"));
		await expect.poll(() => fieldText(plot(page))).toBe("Typed, then the chapter changed.");
	});

	test("a chapter with no PoV of its own shows the default, muted and labelled, on the PoV button, and the default is not written into the chapter", async ({ page }) => {
		await choose(page, "ch-a5.md");
		const row = panel(page).locator('[data-row="pov"]');
		await expect(row.locator(".sf-meta-value .sf-muted").first()).toHaveText("Jane");
		await expect(row).toContainText("(default)");
		expect(await read(page, BOOK_A)).not.toMatch(/ch-a5\.md:[\s\S]*pov/);
	});

	test("PoV and Location are buttons: several can be chosen, the names are shown comma-separated, and the writes are the same bytes as before (decisions 42 and 43)", async ({ page }) => {
		await choose(page, "ch-a5.md");
		const row = panel(page).locator('[data-row="pov"]');
		await row.getByRole("button").click();
		await page.getByRole("dialog").getByLabel("Sam").check();
		await page.getByRole("dialog").getByLabel("Jane").check();
		await page.getByRole("dialog").getByRole("button", { name: "Choose" }).click();
		await expect(row.locator(".sf-meta-value")).toContainText("Sam, Jane");
		await expect(row.locator(".sf-meta-value .sf-muted")).toHaveCount(0);
		const disk = await read(page, BOOK_A);
		expect(disk).toContain("Codex%2FSam.md=Sam");
		expect(disk).toContain("Codex%2FJane.md=Jane");
		await expect(page.locator(".sf-ref-choose")).toHaveCount(0); // the "Choose…" links are gone
		await page.locator(".sf-left .sf-meta-row", { hasText: "Default PoV" }).getByRole("button").click();
		await page.getByRole("menuitem", { name: "Sam" }).click();
		await expect.poll(() => read(page, BOOK_A)).toContain("default-pov-path: Codex/Sam.md");
	});

	test("a reference to a note that is gone is shown as missing, muted, and stays in the file", async ({ page }) => {
		const novel = await read(page, BOOK_A);
		await outside(page, BOOK_A, novel.replace("v1;Codex%2FJane.md=Jane", "v1;Codex%2FGone.md=Gone"));
		const ref = panel(page).locator('[data-row="pov"] .sf-meta-value .sf-muted');
		await expect(ref).toHaveText("Gone (missing)");
		expect(await read(page, BOOK_A)).toContain("Codex%2FGone.md=Gone");
	});

	test("a name in the PoV button opens nothing (Codex entries open only on the Codex tab and the storytelling side)", async ({ page }) => {
		await panel(page).locator('[data-row="pov"] .sf-meta-value').click(); // opens the picker, not a note
		await page.keyboard.press("Escape");
		await expect(overview(page)).toBeVisible();
		expect(await page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBeFalsy();
	});
});

test.describe("one chosen chapter, shared by both sides", () => {
	let root = "";
	test.beforeEach(async ({ page }) => {
		root = await openProject(page);
	});

	test("choosing a chapter in the overview makes it the chapter being written: the open one is saved, the editor switches, the overview stays up and inert beneath", async ({ page }) => {
		await centreText(page).click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" TYPEDBEFORE");
		await toNovelTab(page);
		await choose(page, "ch-a2.md");
		await expect(overview(page)).toBeVisible(); // the library side keeps the view it has
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("centre"))).toBe(CH2);
		await expect.poll(() => read(page, CH1)).toContain("TYPEDBEFORE"); // the open chapter was saved, nothing lost
		await expect(page.locator(".sf-slot--centre")).toHaveAttribute("inert", "");
		await flipFace(page); // flipping shows it
		await expect(centreText(page)).toContainText("Opening line of a second chapter"); // chapter 2's text, in the one editor
		expect(await page.evaluate(() => (window.__app as any).nav.chapter)).toBe("ch-a2.md");
		await expect(page.locator(".sf-select--chapters .sf-select-current-title")).toContainText("The Storm");
	});

	test("choosing from the left pane's placed list does the same, and the chosen row is highlighted", async ({ page }) => {
		await toNovelTab(page);
		await placedRow(page, "The Storm").first().click();
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("centre"))).toBe(CH2);
		await expect(overview(page)).toBeVisible();
		await expect(placedRow(page, "The Storm").first()).toHaveClass(/is-active|is-selected|is-chosen/);
		await expect(placedRow(page, "Chapter 1").first()).not.toHaveClass(/is-active|is-selected|is-chosen/);
		await expect(page.getByRole("textbox", { name: /^Plot note for The Storm/ })).toBeVisible();
	});

	test("the chosen chapter is always highlighted: the 'Highlight the active chapter' setting is retired, and a stored key is never read or rewritten", async ({ page }) => {
		const MD = "_backstage/storyforge/project.md";
		await page.evaluate((f) => window.__preview.touch(f, "---\nformat-version: 1\nhighlight-active-chapter: false\n---\n"), MD);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await toNovelTab(page);
		await expect(placedRow(page, "Chapter 1").first()).toHaveClass(/is-active|is-selected|is-chosen/);
		await page.getByRole("tab", { name: "series" }).click();
		await expect(page.locator(".sf-left .is-active, .sf-left .is-selected, .sf-left .is-chosen").first()).toBeVisible(); // the chosen novel too
		// another setting changes through the dialog: the stored key stays exactly as it was, and the dialog has no control for it
		await openSettingsDialog(page);
		const d = page.getByRole("dialog");
		await d.getByRole("radio", { name: "One standalone novel" }).click(); // only a standalone story can hide the series pane (Brief 19)
		await d.getByLabel("Hide the series pane (for one standalone book)").check();
		await expect.poll(() => read(page, MD)).toContain("hide-series-pane: true");
		expect(await read(page, MD)).toContain("highlight-active-chapter: false");
		await expect(d.getByLabel("Highlight the active chapter")).toHaveCount(0);
		await page.keyboard.press("Escape");
	});

	test("clicking the novel name on the storytelling side lands on the novel tab with the chapter being written marked and shown", async ({ page }) => {
		await page.evaluate(() => (window.__app as any).openLibraryTab("novel", { resetChoice: true })); // the novel name on the storytelling side is a selector now (§6.1)
		await expect(page.getByRole("tab", { name: "novel", selected: true })).toBeVisible();
		await expect(placedRow(page, "Chapter 1").first()).toHaveClass(/is-active|is-selected|is-chosen/);
		await expect(page.getByRole("textbox", { name: /^Plot note for Chapter 1/ })).toBeVisible();
		await expect(chapterText(page)).toContainText("Synthetic sentence number 1");
	});

	test("an unplaced chapter being written isn't marked in the placed list, and the panel still shows it", async ({ page }) => {
		await toNovelTab(page);
		await page.evaluate(() => (window.__app as any).chooseChapter("aaa", "ch-a3.md"));
		await expect(page.getByRole("textbox", { name: /^Plot note for / })).toBeVisible();
		await expect(page.locator(".sf-left [aria-label='Placed chapters'] .is-active, .sf-left [aria-label='Placed chapters'] .is-selected, .sf-left [aria-label='Placed chapters'] .is-chosen")).toHaveCount(0);
		await expect(panel(page).locator(".sf-chapter-text .cm-content")).toBeVisible();
	});

	test("opening and browsing the novel tab, and choosing chapters, write nothing to the project folder", async ({ page }) => {
		const before = tree(root);
		await toNovelTab(page);
		await choose(page, "ch-a2.md");
		await overview(page).locator(".sf-card .sf-bar").first().hover();
		await choose(page, "ch-a5.md");
		await placedRow(page, "Chapter 1").first().click();
		await expect(page.getByRole("textbox", { name: /^Plot note for Chapter 1/ })).toBeVisible();
		await page.getByRole("tab", { name: "series" }).click();
		await page.getByRole("tab", { name: "novel" }).click();
		await expect(overview(page)).toBeVisible();
		expect(tree(root)).toEqual(before);
	});

	test("a Codex note open on the storytelling side stays out of the library side's panel, and flipping back finds it with unsaved text intact (Brief 19 §4)", async ({ page }) => {
		const root = await openProject(page);
		await page.evaluate(() => (window.__app as any).toggleLore("Codex/Windows.md"));
		const note = page.locator(".sf-lore-host .cm-content");
		await expect(note).toBeVisible();
		await note.click();
		await page.keyboard.type("UNSAVEDWORDS");
		for (const tab of ["codex", "series", "archive", "novel"]) {
			await flipFace(page);
			await page.getByRole("tab", { name: tab }).click();
			await expect(page.locator(".sf-lore-host")).toBeHidden();
			await expect(page.locator(".sf-lore-host")).toHaveJSProperty("inert", true);
			await flipFace(page);
			await expect(page.locator(".sf-lore-host")).toBeVisible();
			await expect(page.locator(".sf-lore-host")).toHaveJSProperty("inert", false);
			await expect(note).toContainText("UNSAVEDWORDS");
		}
		await page.waitForTimeout(1500);
		const files = Object.keys(tree(root));
		expect(files.filter((f) => f.includes("recovery") || f.includes("conflict"))).toEqual([]);
	});
});
