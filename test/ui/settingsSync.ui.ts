import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

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
		({ path, text }) => {
			void window.__preview.touch(path, text);
			window.__preview.emit("watch-batch", { paths: [path], rescan: false });
		},
		{ path: SETTINGS, text },
	);
const onDisk = (page: Page): Promise<string | null> => page.evaluate((p) => window.__preview.read(p), SETTINGS);

test.describe("settings changed elsewhere", () => {
	test("an outside change to the Codex colour applies at once, and the re-read writes nothing", async ({ page }) => {
		await openProject(page);
		const text = "---\nformat-version: 1\ncodex-colour: green\n---\n";
		await outside(page, text);
		await expect(page.locator("html")).toHaveAttribute("data-codex-colour", "green");
		expect(await onDisk(page)).toBe(text);
	});

	test("an open settings dialog follows an outside change", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
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
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
	await outside(page, "---\nformat-version: 1\ncodex-colour: green\nstory-kind: standalone\n---\n");
	await expect(dialog.getByRole("radio", { name: "Green", exact: true })).toBeChecked();
	// Elsewhere again, before the window has heard (no batch emitted): the window still holds green.
	await page.evaluate((p) => void window.__preview.touch(p, "---\nformat-version: 1\ncodex-colour: blue\nstory-kind: series\n---\n"), SETTINGS);
	await dialog.getByRole("radio", { name: "Yellow", exact: true }).click();
	await expect(page.getByRole("status").filter({ hasText: "elsewhere" })).toContainText("Changed “Codex colour” to yellow. It had been changed to blue elsewhere; that change is replaced.");
	const disk = (await onDisk(page))!;
	expect(disk).toContain("codex-colour: yellow");
	expect(disk).toContain("story-kind: series"); // the other outside change is kept
});
