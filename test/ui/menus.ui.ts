import { expect, test, type Page } from "@playwright/test";
import { openPreview, shot, flipFace, openSettingsDialog } from "./helpers";

const PROJECT_MD = "_backstage/storyforge/project.md";
const dialog = (page: Page) => page.getByRole("dialog");
const onDisk = (page: Page, path: string) => page.evaluate((p) => window.__preview.read(p), path);
const menu = (page: Page, id: string) => page.evaluate((i) => window.__preview.emit("menu", i), id);
const touch = (page: Page, path: string, text: string) => page.evaluate(([p, t]) => window.__preview.touch(p, t), [path, text]);
const exists = (page: Page, path: string) => page.evaluate((p) => window.__preview.read(p).then(() => true, () => false), path);
const lastState = (page: Page) => page.evaluate(() => window.__preview.menuStates[window.__preview.menuStates.length - 1]);

async function openProject(page: Page, prepare?: () => Promise<void>): Promise<void> {
	await openPreview(page);
	if (prepare) {
		await prepare();
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	}
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const centre = (page: Page) => page.locator(".sf-slot--centre .cm-content");

test.describe("the menus", () => {
	test("items that need a project are greyed out until one is open; read-only greys out the writing ones", async ({ page }) => {
		await openPreview(page);
		await expect.poll(async () => (await lastState(page))?.["new-chapter"]).toBe(false);
		const none = (await lastState(page))!;
		for (const id of ["new-chapter", "close-project", "find", "flip-face", "toggle-lore", "backup-now", "settings", "archive", "rename"]) expect(none[id], id).toBe(false);
		await page.locator("[data-recent='0']").click();
		await expect.poll(async () => (await lastState(page))?.["new-chapter"]).toBe(true);
		const open = (await lastState(page))!;
		expect(open["close-project"] && open["find"] && open["flip-face"] && open["settings"] && open["backup-now"]).toBe(true);
		expect(open["archive"]).toBe(false); // nothing picked yet
		await page.getByRole("button", { name: "Chapters" }).click();
		await page.locator(".sf-select-row", { hasText: "The Storm" }).click();
		await expect.poll(async () => (await lastState(page))?.["archive"]).toBe(true);
	});

	test("a project made by a newer storyForge: the writing items stay grey", async ({ page }) => {
		await openProject(page, async () => void (await touch(page, PROJECT_MD, "---\nformat-version: 99\n---\n")));
		await expect.poll(async () => (await lastState(page))?.["close-project"]).toBe(true);
		const state = (await lastState(page))!;
		expect(state["new-chapter"]).toBe(false);
		expect(state["backup-now"]).toBe(false);
		expect(state["rename"]).toBe(false);
	});

	test("File: New Chapter adds the next chapter; New Project asks series or standalone; Close Project goes back to the start", async ({ page }) => {
		await openProject(page);
		await menu(page, "new-chapter");
		await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("centre"))).not.toBe("_story-library/aaa/ch-a1.md");
		await menu(page, "new-project");
		await expect(dialog(page).getByText("Are you writing a series, or a single standalone book?")).toBeVisible();
		await dialog(page).getByRole("button", { name: "Cancel" }).click();
		await centre(page).click();
		await page.keyboard.type("Last words.");
		await menu(page, "close-project");
		await expect(page.getByRole("button", { name: "Open Project…" })).toBeVisible();
		// the text typed just before closing was saved by the close
		const path = "_story-library/aaa/" + (await page.evaluate(() => window.__preview.read("_story-library/novel-aaa.md"))).match(/chapter-order:\n(?:  - .*\n)+/)![0].trim().split("\n").at(-1)!.replace(/^\s*- /, "");
		expect(await onDisk(page, path)).toContain("Last words.");
	});

	test("File ▸ Open Recent opens that project", async ({ page }) => {
		await openPreview(page);
		await menu(page, "recent:0");
		await expect(page.locator(".sf-nav-novel")).toBeVisible();
	});

	test("Edit: Undo and Redo act on the editor; Find and Find and Replace open its panel", async ({ page }) => {
		await openProject(page);
		await centre(page).click();
		await page.keyboard.press("ControlOrMeta+ArrowUp");
		await page.keyboard.type("XYZ");
		await expect(page.locator(".sf-slot--centre .cm-line").first()).toContainText("XYZ");
		await menu(page, "undo");
		await expect(page.locator(".sf-slot--centre .cm-line").first()).not.toContainText("XYZ");
		await menu(page, "redo");
		await expect(page.locator(".sf-slot--centre .cm-line").first()).toContainText("XYZ");
		await menu(page, "find");
		await expect(page.locator(".cm-search")).toBeVisible();
		await page.keyboard.press("Escape");
		await menu(page, "replace");
		await expect(page.locator(".cm-search input[name=replace]")).toBeFocused();
	});

	test("Undo and Redo also work in a rename field", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await page.locator(".sf-row", { hasText: "Chapter 1" }).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Rename" }).click();
		const input = page.getByLabel("Name");
		await input.fill("Typed into the field");
		await menu(page, "undo");
		await expect(input).not.toHaveValue("Typed into the field");
	});

	test("View: Flip Side and Show or Hide Context", async ({ page }) => {
		await openProject(page);
		await expect(page.locator(".sf-slot--lore")).toBeVisible();
		await menu(page, "toggle-lore");
		await expect(page.locator(".sf-slot--lore")).toBeHidden();
		await menu(page, "toggle-lore");
		await expect(page.locator(".sf-slot--lore")).toBeVisible();
		await menu(page, "flip-face");
		await expect(page.getByRole("tablist")).toBeVisible();
		await menu(page, "flip-face");
		await expect(page.locator(".sf-nav-novel")).toBeVisible();
	});

	test("Story: Rename… on a Codex note opens the rename dialog; Archive archives the picked chapter; Back Up Now makes a backup", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-codex-file", { hasText: "Windows" }).click();
		await menu(page, "rename");
		await expect(dialog(page).getByLabel("New name")).toHaveValue("Windows");
		await dialog(page).getByRole("button", { name: "Cancel" }).click();
		await menu(page, "archive"); // the picked Codex note
		await expect(page.locator(".sf-codex-file", { hasText: "Windows" })).toHaveCount(0);
		await page.getByRole("button", { name: "Chapters" }).click();
		await page.locator(".sf-select-row", { hasText: "The Storm" }).click();
		await menu(page, "archive");
		await expect.poll(() => onDisk(page, "_story-library/novel-aaa.md")).toMatch(/archive:\n  - ch-a4\.md\n  - ch-a2\.md/);
		await menu(page, "backup-now");
		await expect(page.getByRole("status").filter({ hasText: /^Backed up \d+ files to _sf-backup\// })).toBeVisible();
	});

	test("Story: Rename… on a chapter starts the inline rename on the novel tab", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).click();
		await page.locator(".sf-select-row", { hasText: "The Storm" }).click();
		await menu(page, "rename");
		await expect(page.getByLabel("Name")).toHaveValue("The Storm: Part Two");
	});

	test("Rust's menu events beyond the ones the window knows are ignored quietly", async ({ page }) => {
		await openProject(page);
		await menu(page, "something-new");
		await expect(page.getByRole("alert")).toHaveCount(0);
	});
});

test.describe("settings", () => {
	test("⌘, opens them; opening and closing writes nothing; each row says where its value comes from", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialog(page).getByRole("tab", { name: "General", exact: true }).click();
		await dialog(page).getByRole("tab", { name: "story", exact: true }).click();
		const d = dialog(page);
		await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
		await expect(d.getByLabel("Series numbering")).toHaveValue("arabic");
		await expect(d).not.toContainText("null"); // an element left out must not be drawn as the word null
		await expect(d.locator(".sf-setting-row", { hasText: "Series numbering" })).toContainText("default");
		await shot(page, "settings");
		await d.getByRole("button", { name: "Done" }).click();
		expect(await exists(page, PROJECT_MD)).toBe(false);
	});

	test("the Sessions and Display groups: ranges are kept, an out-of-range value is put back, and the editing threshold can be turned off", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialog(page).getByRole("tab", { name: "Sessions", exact: true }).click();
		const d = dialog(page);
		await expect(d.getByRole("region", { name: "Sessions" })).toBeVisible();
		await expect(d.getByRole("region", { name: "Display" })).toBeVisible();
		await expect(d.getByLabel("Session idle limit (minutes)")).toHaveValue("3");
		await expect(d.getByLabel("Shortest session shown (minutes)")).toHaveValue("5");
		await expect(d.getByLabel("Count as editing below (words per minute)")).toHaveValue("");
		await expect(d.getByLabel("Show the current session in the stats panel")).not.toBeChecked();
		await shot(page, "sessions-settings");
		await d.getByLabel("Session idle limit (minutes)").fill("99");
		await d.getByLabel("Session idle limit (minutes)").press("Enter");
		await expect(d.getByLabel("Session idle limit (minutes)")).toHaveValue("3"); // put back
		expect(await exists(page, PROJECT_MD)).toBe(false); // and nothing written
		await d.getByLabel("Session idle limit (minutes)").fill("10");
		await d.getByLabel("Session idle limit (minutes)").press("Enter");
		await d.getByLabel("Count as editing below (words per minute)").fill("6");
		await d.getByLabel("Count as editing below (words per minute)").press("Enter");
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p).catch(() => ""), PROJECT_MD)).toMatch(/session-idle-minutes: 10[\s\S]*session-editing-wpm: 6|session-editing-wpm: 6[\s\S]*session-idle-minutes: 10/);
		await d.getByLabel("Count as editing below (words per minute)").fill("");
		await d.getByLabel("Count as editing below (words per minute)").press("Enter");
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p).catch(() => ""), PROJECT_MD)).not.toContain("session-editing-wpm");
	});

	test("a change writes project.md, only that change, and the source becomes 'this project'", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialog(page).getByRole("tab", { name: "General", exact: true }).click();
		await dialog(page).getByRole("tab", { name: "story", exact: true }).click();
		const d = dialog(page);
		await d.getByLabel("Chapter numbering").selectOption("roman-lower");
		await expect.poll(async () => ((await exists(page, PROJECT_MD)) ? onDisk(page, PROJECT_MD) : "")).toContain("chapter-numbering-style: roman-lower");
		const text = await onDisk(page, PROJECT_MD);
		expect(text).toMatch(/^---\nformat-version: 1\n/);
		expect(text).not.toContain("series-numbering-style");
		await expect(d.locator(".sf-setting-row", { hasText: "Chapter numbering" })).toContainText("this project");
		await d.getByRole("button", { name: "Done" }).click();
		// the navigator now numbers chapters in lower-case roman
		await expect(page.locator(".sf-select-current-title")).toHaveText("Chapter i");
		// choosing the value already in effect writes nothing more
		await openSettingsDialog(page);
		await dialog(page).getByRole("tab", { name: "General", exact: true }).click();
		await dialog(page).getByRole("tab", { name: "story", exact: true }).click();
		const before = await onDisk(page, PROJECT_MD);
		await dialog(page).getByLabel("Chapter numbering").selectOption("roman-lower");
		await page.waitForTimeout(300);
		expect(await onDisk(page, PROJECT_MD)).toBe(before);
	});

	test("padded numbering shows 01, 02 as the dropdown says", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialog(page).getByRole("tab", { name: "General", exact: true }).click();
		await dialog(page).getByRole("tab", { name: "story", exact: true }).click();
		await dialog(page).getByLabel("Chapter numbering").selectOption("arabic-padded");
		await dialog(page).getByRole("button", { name: "Done" }).click();
		await expect(page.locator(".sf-select-current-title")).toHaveText("Chapter 01");
	});

	test("the interface settings take effect: hide the series pane, highlighting, the face the app opens in", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const d = dialog(page);
		await d.getByLabel("Hide the series pane").check();
		await d.getByLabel("Opens in").selectOption("false");
		await d.getByRole("button", { name: "Done" }).click();
		await flipFace(page);
		await expect(page.getByRole("tab")).toHaveCount(3);
		await expect(page.getByRole("tab", { name: "series" })).toHaveCount(0);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await expect(page.getByRole("tablist")).toBeVisible(); // opens on the library now
		const text = await onDisk(page, PROJECT_MD);
		expect(text).toContain("auto-focus: false");
		expect(text).toContain("hide-series-pane: true");
	});

	test("Back up everything now makes the full backup and says where", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialog(page).getByRole("tab", { name: "Backups", exact: true }).click();
		await dialog(page).getByRole("button", { name: "Back up everything now" }).click();
		const note = page.getByRole("status").filter({ hasText: /^Backed up \d+ files to _sf-backup\// });
		await expect(note).toBeVisible();
		await note.getByRole("button", { name: "Reveal" }).click();
		expect(await page.evaluate(() => window.__preview.revealed)).toEqual([expect.stringMatching(/^_sf-backup\/.*\.zip$/)]);
	});

	test("in a read-only project every control is off and says why", async ({ page }) => {
		await openProject(page, async () => void (await touch(page, PROJECT_MD, "---\nformat-version: 99\n---\n")));
		await openSettingsDialog(page);
		await dialog(page).getByRole("tab", { name: "General", exact: true }).click();
		await dialog(page).getByRole("tab", { name: "story", exact: true }).click();
		await expect(dialog(page).getByLabel("Series numbering")).toBeDisabled();
		await dialog(page).getByRole("tab", { name: "Backups", exact: true }).click();
		await expect(dialog(page).getByRole("button", { name: "Back up everything now" })).toBeDisabled();
		await expect(dialog(page).getByText(/newer storyForge/)).toBeVisible();
	});
});
