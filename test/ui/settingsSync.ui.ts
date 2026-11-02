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
