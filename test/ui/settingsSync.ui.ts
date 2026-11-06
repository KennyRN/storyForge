import { expect, test, type Page } from "@playwright/test";
import { openPreview, openSettingsDialog } from "./helpers";

// Fix 6, commit 2: project.md changed from outside is re-read and applied at once (decision 96). The preview has no watcher,
// so the test writes the file and emits the batch (docs: outside edits in the preview).

const SETTINGS = "_backstage/storyforge/project.md";

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const outside = (page: Page, text: string) =>
	page.evaluate(
		async ({ path, text }) => {
			await window.__preview.touch(path, text); // the file is written before the window is told
			window.__preview.emit("watch-batch", { paths: [path], rescan: false });
		},
		{ path: SETTINGS, text },
	);
const onDisk = (page: Page): Promise<string | null> => page.evaluate((p) => window.__preview.read(p), SETTINGS);

test.describe("settings changed elsewhere", () => {
	test("an outside change to the data colour applies at once, and the re-read writes nothing; a hand-edited red draws blue", async ({ page }) => {
		await openProject(page);
		const text = "---\nformat-version: 1\ndata-colour: purple\n---\n";
		await outside(page, text);
		await expect(page.locator("html")).toHaveAttribute("data-data-colour", "purple");
		expect(await onDisk(page)).toBe(text);
		const red = "---\nformat-version: 1\ndata-colour: red\n---\n";
		await outside(page, red);
		await expect(page.locator("html")).toHaveAttribute("data-data-colour", "blue");
		expect(await onDisk(page)).toBe(red);
	});

	test("an outside change to the Codex colour applies at once, and the re-read writes nothing", async ({ page }) => {
		await openProject(page);
		const text = "---\nformat-version: 1\ncodex-colour: green\n---\n";
		await outside(page, text);
		await expect(page.locator("html")).toHaveAttribute("data-codex-colour", "green");
		expect(await onDisk(page)).toBe(text);
	});

	test("an open settings dialog follows an outside change", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await dialog.getByRole("tab", { name: "Story", exact: true }).click();
		const standalone = dialog.getByRole("radio", { name: "One standalone novel" });
		await expect(standalone).not.toBeChecked();
		await outside(page, "---\nformat-version: 1\nstory-kind: standalone\n---\n");
		await expect(standalone).toBeChecked();
	});
});

test("changing a setting that was changed elsewhere says so, quietly, and keeps the other outside change", async ({ page }) => {
	await openProject(page);
	await openSettingsDialog(page);
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
	await dialog.getByRole("tab", { name: "storytelling mode", exact: true }).click();
	await outside(page, "---\nformat-version: 1\ncodex-colour: green\nstory-kind: standalone\n---\n");
	// names its group first (decision 117): the Selection colour group has a Green too
	await expect(dialog.getByRole("radiogroup", { name: "codex colour", exact: true }).getByRole("radio", { name: "Green", exact: true })).toBeChecked();
	// Elsewhere again, before the window has heard (no batch emitted): the window still holds green.
	await page.evaluate((p) => window.__preview.touch(p, "---\nformat-version: 1\ncodex-colour: blue\nstory-kind: series\n---\n"), SETTINGS);
	await dialog.getByRole("radiogroup", { name: "codex colour" }).getByRole("radio", { name: "Yellow", exact: true }).click();
	await expect(page.getByRole("status").filter({ hasText: "elsewhere" })).toContainText("Changed “Codex colour” to yellow. It had been changed to blue elsewhere; that change is replaced.");
	const disk = (await onDisk(page))!;
	expect(disk).toContain("codex-colour: yellow");
	expect(disk).toContain("story-kind: series"); // the other outside change is kept
});

test.describe("a settings file that can't be used", () => {
	test("unreadable: told once, controls off, and back on when it reads again", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("tab", { name: "Story", exact: true }).click();
		await outside(page, "---\nformat-version: 1\nstory-kind: [unclosed\n---\n");
		await expect(page.getByRole("status").filter({ hasText: "can’t be read" })).toHaveCount(1);
		await expect(dialog.getByRole("radio", { name: "One standalone novel" })).toBeDisabled();
		await outside(page, "---\nformat-version: 1\nstory-kind: [still\n---\n"); // still unreadable: not told again
		await expect(page.getByRole("status").filter({ hasText: "can’t be read" })).toHaveCount(1);
		await outside(page, "---\nformat-version: 1\nstory-kind: standalone\n---\n");
		await expect(dialog.getByRole("radio", { name: "One standalone novel" })).toBeEnabled();
		await expect(dialog.getByRole("radio", { name: "One standalone novel" })).toBeChecked();
	});

	test("deleted: a quiet notice once, and the last values stay", async ({ page }) => {
		await openProject(page);
		await outside(page, "---\nformat-version: 1\ncodex-colour: green\n---\n");
		await expect(page.locator("html")).toHaveAttribute("data-codex-colour", "green");
		await page.evaluate(async (p) => {
			await window.__preview.rename(p, "_backstage/storyforge/project-gone.md");
			window.__preview.emit("watch-batch", { paths: [p], rescan: false });
		}, SETTINGS);
		await expect(page.getByRole("status").filter({ hasText: "return to their defaults" })).toHaveCount(1);
		await expect(page.locator("html")).toHaveAttribute("data-codex-colour", "green"); // last values stay
	});

	test("newer format: a sticky notice with Close and Reopen, and settings can't be changed", async ({ page }) => {
		await openProject(page);
		await outside(page, "---\nformat-version: 9\n---\n");
		const notice = page.getByRole("alert").filter({ hasText: "upgraded elsewhere" });
		await expect(notice).toBeVisible();
		await expect(notice.getByRole("button", { name: "Close and Reopen" })).toBeVisible();
		await page.waitForTimeout(7000);
		await expect(notice).toBeVisible(); // sticky
	});

	test("Close and Reopen runs the normal close and reopens the project read-only", async ({ page }) => {
		await openProject(page);
		await outside(page, "---\nformat-version: 9\n---\n");
		await page.getByRole("alert").filter({ hasText: "upgraded elsewhere" }).getByRole("button", { name: "Close and Reopen" }).click();
		await page.waitForFunction(() => !!window.__app?.running?.readOnlyReason);
		expect(await onDisk(page)).toBe("---\nformat-version: 9\n---\n");
	});
});

test("a Wonk or Softness key written from outside is never applied or rewritten: Fraunces is drawn with Wonk off (decision 103)", async ({ page }) => {
	await openProject(page);
	const text = "---\nformat-version: 1\nappearance-series-font: Fraunces\nappearance-series-soft: 50\nappearance-series-wonk: true\n---\n";
	await outside(page, text);
	await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--ap-series-var"))).toBe('"SOFT" 0, "WONK" 0'); // Softness is never read either (1.10.0)
	expect(await onDisk(page)).toBe(text);
});
