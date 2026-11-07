import { expect, test, type Page } from "@playwright/test";
import { openPreview, shot } from "./helpers";

const CH1 = "_story-library/aaa/ch-a1.md";
const CH2 = "_story-library/aaa/ch-a2.md";
const CH3 = "_story-library/aaa/ch-a3.md";
const CH4 = "_story-library/aaa/ch-a4.md"; // archived
const JANE = "Codex/Jane.md";
const MOD = "ControlOrMeta";

async function openProject(page: Page, options: Parameters<typeof openPreview>[1] = {}): Promise<void> {
	await openPreview(page, options);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}

const open = (page: Page, slot: "centre" | "lore", path: string) => page.evaluate(([s, p]) => window.__app.editors!.open(s as "centre" | "lore", p), [slot, path]);
const content = (page: Page, slot = "centre") => page.locator(`.sf-slot--${slot} .cm-content`);
const lines = (page: Page, slot = "centre") => page.locator(`.sf-slot--${slot} .cm-line`);
const onDisk = (page: Page, path: string) => page.evaluate((p) => window.__preview.read(p), path);
const outsideChange = async (page: Page, path: string, text: string) => {
	await page.evaluate(([p, t]) => window.__preview.touch(p, t), [path, text]);
	await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), path);
};

test.describe("the editor", () => {
	test("typing reaches the writer and is saved two seconds later, silently", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowUp");
		await page.keyboard.type("Hello. ");
		await page.waitForTimeout(900);
		expect(await onDisk(page, CH1)).not.toContain("Hello. ");
		await expect.poll(() => onDisk(page, CH1), { timeout: 4000 }).toContain("Hello. Synthetic sentence number 1");
		await expect(page.getByRole("status")).toHaveCount(0);
		await expect(page.getByRole("alert")).toHaveCount(0);
		await shot(page, "editor");
	});

	test("a chapter with frontmatter shows only the body, and keeps the frontmatter byte for byte when saved", async ({ page }) => {
		await openProject(page);
		const original = "---\nplot: kept\ncustom-key: also kept\n---\nThe first line.\nThe second line.\n";
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [CH2, original]);
		await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), CH2);
		await open(page, "centre", CH2);
		await expect(content(page)).not.toContainText("custom-key");
		await expect(content(page)).toContainText("The first line.");
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.type(" Added.");
		await expect.poll(() => onDisk(page, CH2), { timeout: 4000 }).toContain("Added.");
		expect(await onDisk(page, CH2)).toMatch(/^---\nplot: kept\ncustom-key: also kept\n---\nThe first line\./);
	});

	test("lines wrap, spellcheck is on, and the text sits in a centred, readable column", async ({ page }) => {
		await page.setViewportSize({ width: 1900, height: 800 }); // wide enough that the readable maximum, not the pane, sets the column
		await openProject(page);
		await open(page, "centre", CH1);
		await expect(content(page)).toHaveAttribute("spellcheck", "true");
		const box = await content(page).boundingBox();
		const frame = await page.locator(".sf-slot--centre").boundingBox();
		expect(box!.width).toBeLessThan(frame!.width);
		expect(Math.abs(box!.x - frame!.x - (frame!.x + frame!.width - box!.x - box!.width))).toBeLessThan(40);
		expect(await content(page).evaluate((el) => getComputedStyle(el).whiteSpace)).toMatch(/pre-wrap|break-spaces|normal/);
	});

	test.describe("the dressing", () => {
		const text = "# A heading\n\nSome *italic* and **bold** text and ***both***.\n\nA <!-- hidden --> note.\n\nLast line, with [[a link]] left alone.\n";

		test.beforeEach(async ({ page }) => {
			await openProject(page);
			await page.evaluate(([p, t]) => window.__preview.touch(p, t), [CH3, text]);
			await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), CH3);
			await open(page, "centre", CH3);
		});

		test("markers are hidden off the caret's line and shown on it", async ({ page }) => {
			// the caret starts at the top: the heading line shows its marker, the others do not
			await content(page).click();
			await page.keyboard.press("ControlOrMeta+ArrowUp");
			await expect(lines(page).nth(0)).toHaveText("# A heading");
			await expect(lines(page).nth(2)).toHaveText("Some italic and bold text and both.");
			await expect(lines(page).nth(4)).toHaveText("A <!-- hidden --> note."); // comments are dimmed, not hidden
			await shot(page, "editor-dressing");
			// move onto the emphasis line: its markers show
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press("ArrowDown");
			await expect(lines(page).nth(2)).toHaveText("Some *italic* and **bold** text and ***both***.");
			await expect(lines(page).nth(0)).toHaveText("A heading");
		});

		test("emphasis and headings are styled; comments are dimmed; the old [[wiki link]] stays plain text", async ({ page }) => {
			await content(page).click();
			await page.keyboard.press("ControlOrMeta+ArrowDown");
			await expect(page.locator(".sf-em", { hasText: "italic" })).toBeVisible();
			expect(await page.locator(".sf-em", { hasText: "italic" }).first().evaluate((e) => getComputedStyle(e).fontStyle)).toBe("italic");
			expect(await page.locator(".sf-strong", { hasText: "bold" }).first().evaluate((e) => Number(getComputedStyle(e).fontWeight))).toBeGreaterThanOrEqual(600);
			expect(await page.locator(".sf-heading-text").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(18 * 1.3);
			await expect(page.locator(".sf-comment")).toContainText("hidden");
			await expect(lines(page).nth(6)).toHaveText("Last line, with [[a link]] left alone.");
		});

		test("⌘B and ⌘I wrap and unwrap the selection", async ({ page }) => {
			await content(page).click();
			await page.keyboard.press("ControlOrMeta+ArrowDown");
			await page.keyboard.press("ControlOrMeta+ArrowLeft");
			await page.keyboard.press("Shift+Alt+ArrowRight");
			await page.keyboard.press(`${MOD}+b`);
			await expect(lines(page).nth(6)).toHaveText("**Last** line, with [[a link]] left alone.");
			await page.keyboard.press(`${MOD}+b`);
			await expect(lines(page).nth(6)).toHaveText("Last line, with [[a link]] left alone.");
			await page.keyboard.press(`${MOD}+i`);
			await expect(lines(page).nth(6)).toHaveText("*Last* line, with [[a link]] left alone.");
		});
	});

	test("an outside change with unsaved text shows the sticky recovery notice, shows the disk's text and keeps the author's in a recovery file", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.type(" My unsaved words.");
		await outsideChange(page, CH1, "Changed in another editor.\n");
		const notice = page.getByRole("alert");
		await expect(notice).toContainText("ch-a1");
		await expect(notice).toContainText("saved at _sf-backup/recovery/aaa/");
		await expect(content(page)).toHaveText("Changed in another editor.");
		await expect(notice.getByRole("button", { name: "Dismiss" })).toBeVisible();
		await notice.getByRole("button", { name: "Reveal" }).click();
		expect(await page.evaluate(() => window.__preview.revealed)).toEqual([expect.stringMatching(/^_sf-backup\/recovery\/aaa\/ch-a1 /)]);
		const recovered = await onDisk(page, (await page.evaluate(() => window.__preview.revealed))[0]);
		expect(recovered).toContain("My unsaved words.");
		await shot(page, "editor-recovery-notice");
		await notice.getByRole("button", { name: "Dismiss" }).click();
		await expect(notice).toHaveCount(0);
	});

	test("a save that finds the file changed is a conflict: the disk wins, a sticky notice names the file and the recovery path", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.type(" Typed before the other edit.");
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [CH1, "Written elsewhere, unnoticed.\n"]); // no watcher batch: the save finds out
		const notice = page.getByRole("alert");
		await expect(notice).toContainText("changed on disk while you were typing", { timeout: 5000 });
		await expect(notice).toContainText("_sf-backup/recovery/aaa/");
		await expect(content(page)).toHaveText("Written elsewhere, unnoticed.");
		expect(await onDisk(page, CH1)).toBe("Written elsewhere, unnoticed.\n");
	});

	test("a reload from disk is applied as a minimal edit: the caret and the undo history survive", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowUp");
		await page.keyboard.type("Q");
		await expect.poll(() => onDisk(page, CH1), { timeout: 4000 }).toContain("QSynthetic");
		// another editor appends a line; the author has no unsaved text
		const now = await onDisk(page, CH1);
		await outsideChange(page, CH1, now + "A line added elsewhere.\n");
		await expect(content(page)).toContainText("A line added elsewhere.");
		await expect(page.getByRole("alert")).toHaveCount(0);
		await page.keyboard.type("R"); // the caret is where it was: after the Q
		await expect(lines(page).nth(0)).toContainText("QRSynthetic");
		await page.keyboard.press(`${MOD}+z`); // undo undoes the author's typing, not the other editor's line
		await expect(lines(page).nth(0)).toContainText("QSynthetic");
		await expect(content(page)).toContainText("A line added elsewhere.");
	});

	test("opening a file that already has an editor focuses it, from either slot", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		await open(page, "lore", CH1);
		await expect(page.locator(".sf-slot--lore .cm-content")).toHaveCount(0);
		await expect(content(page)).toBeFocused();
		await open(page, "lore", JANE);
		await expect(content(page, "lore")).toBeVisible();
		await open(page, "centre", JANE);
		await expect(content(page, "lore")).toBeFocused();
		await expect(content(page)).toContainText("Synthetic sentence number 1");
		const sessions = await page.evaluate(() => window.__app.running!.opened.writer.openSessions().length);
		expect(sessions).toBe(2);
	});

	test("asking for the same file twice at once opens it once, and its session stays alive", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => Promise.all([window.__app.editors!.open("centre", "_story-library/aaa/ch-a3.md"), window.__app.editors!.open("centre", "_story-library/aaa/ch-a3.md"), window.__app.editors!.open("lore", "_story-library/aaa/ch-a3.md")]));
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.type(" Still alive.");
		await expect.poll(() => onDisk(page, CH3), { timeout: 4000 }).toContain("Still alive.");
		await expect(page.locator(".sf-slot--lore .cm-content")).toHaveCount(0);
		expect(await page.evaluate(() => window.__app.running!.opened.writer.openSessions().filter((s) => s.path.endsWith("ch-a3.md")).length)).toBe(1);
	});

	test("opening another file in a slot saves and closes the first, and nothing is lost", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.type(" Before switching.");
		await open(page, "centre", CH2);
		expect(await onDisk(page, CH1)).toContain("Before switching.");
		const sessions = await page.evaluate(() => window.__app.running!.opened.writer.openSessions().map((s) => s.path));
		expect(sessions).toEqual([CH2]);
	});

	test("an archived chapter opens read-only with a quiet banner", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH4);
		await expect(page.getByRole("note")).toHaveText("Archived. Unarchive it to edit.");
		await expect(content(page)).toHaveAttribute("contenteditable", "false");
		await expect(content(page)).toContainText(/\S/);
		await shot(page, "editor-archived");
	});

	test("a project made by a newer storyForge opens read-only, with its banner, and writes nothing", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await open(page, "centre", CH1);
		await expect(page.getByRole("note")).toHaveText("This project was made by a newer storyForge. Update the app to edit it.");
		await expect(content(page)).toHaveAttribute("contenteditable", "false");
		await expect(content(page)).toContainText("Synthetic sentence number 1");
	});

	test("mixed line endings are normalised on the first save, which says so once", async ({ page }) => {
		await openProject(page);
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [CH2, "one\r\ntwo\nthree\r\n"]);
		await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), CH2);
		await open(page, "centre", CH2);
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.type("!");
		const notice = page.getByRole("status").filter({ hasText: "mixed line endings" });
		await expect(notice).toBeVisible({ timeout: 5000 });
		expect(await onDisk(page, CH2)).toBe("one\r\ntwo\r\nthree!\r\n");
		await page.keyboard.type("?");
		await page.waitForTimeout(2600);
		await expect(page.getByRole("status").filter({ hasText: "mixed line endings" })).toHaveCount(1);
	});

	test("⌘F opens find in the open file; find and replace focuses the replace field", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		await content(page).click();
		await page.keyboard.press(`${MOD}+f`);
		await expect(page.locator(".cm-search")).toBeVisible();
		await page.keyboard.type("sentence");
		await expect(page.locator(".cm-searchMatch").first()).toBeVisible();
		await page.keyboard.press("Escape");
		await page.evaluate(() => window.__app.editors!.find(true));
		await expect(page.locator(".cm-search input[name=replace]")).toBeFocused();
	});

	test("every save outcome the writer reports reaches the author, and a later good save clears a pinned failure", async ({ page }) => {
		await openProject(page);
		await open(page, "centre", CH1);
		// stand in for the three things only the writer can produce: a failed backup, a refusal, a recovery failure
		await page.evaluate(() => {
			const s = window.__app.editors!.sessionIn("centre")!;
			void (window as unknown as { __emit: unknown }).__emit;
			const listeners = (s as unknown as { saveListeners: Set<(r: unknown) => void> }).saveListeners;
			const path = s.path;
			for (const l of listeners) l({ kind: "recovery-failed", path, error: new Error("x"), recoveryError: new Error("y") });
		});
		const pinned = page.getByRole("alert").filter({ hasText: "no copy could be kept" });
		await expect(pinned).toBeVisible();
		await expect(pinned.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
		await content(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowDown");
		await page.keyboard.type(" ok");
		await expect(pinned).toHaveCount(0, { timeout: 5000 });
	});
});
