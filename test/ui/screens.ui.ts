import { expect, test, type Page } from "@playwright/test";
import { openPreview, shot } from "./helpers";

const CH2 = "_story-library/aaa/ch-a2.md";
const dialog = (page: Page) => page.getByRole("dialog");
const onDisk = (page: Page, path: string) => page.evaluate((p) => window.__preview.read(p), path);

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
const withLinks = (page: Page) => async () => {
	await page.evaluate(() => window.__preview.touch("_story-library/aaa/ch-a2.md", "Meet [[Jane]] and [[Jane#Facts|her]] and ![[Jane]].\nA code sample: `[[Jane]]`\n"));
	await page.evaluate(() => window.__preview.touch("Codex/Sam.md", "Friend of [[Jane]].\n"));
};

test.describe("the screens around the faces", () => {
	test("a quiet open shows no summary at all", async ({ page }) => {
		await openProject(page);
		await expect(dialog(page)).toHaveCount(0);
	});

	test("an open where something happened lists it, with a way to see each recovery file", async ({ page }) => {
		await openProject(page, async () => {
			await page.evaluate(() => window.__preview.touch("_story-library/aaa/ch-new.md", "A chapter written while the app was closed.\n"));
		});
		const d = dialog(page);
		await expect(d).toBeVisible();
		await expect(d.getByRole("heading", { name: "Changes found when opening" })).toBeVisible();
		await expect(d.getByText("ch-new.md")).toBeVisible();
		await shot(page, "summary");
		await d.getByRole("button", { name: "OK" }).click();
		await expect(d).toHaveCount(0);
	});

	test.describe("renaming a Codex note", () => {
		test("the name is checked as it is typed, with the reason", async ({ page }) => {
			await openProject(page, withLinks(page));
			await page.locator(".sf-codex-file", { hasText: "Jane" }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename…" }).click();
			const d = dialog(page);
			await expect(d.getByLabel("New name")).toHaveValue("Jane");
			await expect(d.getByRole("button", { name: "Next" })).toBeDisabled(); // unchanged
			await d.getByLabel("New name").fill("Jane [2]");
			await expect(d.getByRole("alert")).toHaveText("A note name can't contain [ ] # ^ |, because no link can carry them.");
			await expect(d.getByRole("button", { name: "Next" })).toBeDisabled();
			await d.getByLabel("New name").fill("Jane | Jay");
			await expect(d.getByRole("alert")).toContainText("[ ] # ^ |");
			await d.getByLabel("New name").fill("");
			await expect(d.getByRole("button", { name: "Next" })).toBeDisabled();
		});

		test("the plan shows its counts and what will not change before anything changes", async ({ page }) => {
			await openProject(page, withLinks(page));
			await page.evaluate(() => window.__preview.touch("elsewhere/readme.md", "A link outside storyForge's folders: [[Jane]].\n"));
			await page.locator(".sf-codex-file", { hasText: "Jane" }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename…" }).click();
			const d = dialog(page);
			await d.getByLabel("New name").fill("Janet");
			await d.getByRole("button", { name: "Next" }).click();
			await expect(d.locator(".sf-plan-headline")).toHaveText("Renaming updates 4 links in 2 files.");
			await expect(d.getByText("in notes outside storyForge's folders will not change")).toBeVisible();
			await expect(d.getByText("A backup is made first")).toBeVisible();
			await shot(page, "rename-plan");
			// nothing has changed yet
			expect(await onDisk(page, "Codex/Jane.md")).toContain("aliases");
			expect(await onDisk(page, CH2)).toContain("[[Jane]]");
			await d.getByRole("button", { name: "Back" }).click();
			await expect(d.getByLabel("New name")).toHaveValue("Janet");
			await d.getByRole("button", { name: "Cancel" }).click();
			await expect(dialog(page)).toHaveCount(0);
			expect(await onDisk(page, "Codex/Jane.md")).toContain("aliases");
		});

		test("confirming renames the note, updates the links, makes a backup and reports it", async ({ page }) => {
			await openProject(page, withLinks(page));
			await page.locator(".sf-codex-file", { hasText: "Jane" }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename…" }).click();
			const d = dialog(page);
			await d.getByLabel("New name").fill("Janet");
			await d.getByRole("button", { name: "Next" }).click();
			await d.getByRole("button", { name: "Rename" }).click();
			await expect(d.locator(".sf-plan-headline")).toContainText("Renamed to “Janet”. 4 links updated in 2 files.");
			await expect(d.getByText(/^Backup: _sf-backup\/.*\.zip$/)).toBeVisible();
			await d.getByRole("button", { name: "Reveal" }).click();
			expect(await page.evaluate(() => window.__preview.revealed)).toEqual([expect.stringMatching(/^_sf-backup\/.*\.zip$/)]);
			await shot(page, "rename-result");
			await d.getByRole("button", { name: "Done" }).click();
			expect(await onDisk(page, "Codex/Janet.md")).toContain("custom-key: kept");
			expect(await onDisk(page, CH2)).toBe("Meet [[Janet]] and [[Janet#Facts|her]] and ![[Janet]].\nA code sample: `[[Jane]]`\n"); // the link in the code sample is left alone
			expect(await onDisk(page, "Codex/Sam.md")).toBe("Friend of [[Janet]].\n");
			await expect(page.locator(".sf-codex-file", { hasText: "Janet" })).toBeVisible();
			await expect(page.locator(".sf-codex-file", { hasText: /^Jane$/ })).toHaveCount(0);
		});

		test("a note open in the lore slot is saved first and shown again under its new name", async ({ page }) => {
			await openProject(page, withLinks(page));
			await page.locator(".sf-codex-file", { hasText: "Sam" }).click();
			await page.locator(".sf-slot--lore .cm-content").click();
			await page.keyboard.press("ControlOrMeta+ArrowDown");
			await page.keyboard.type(" Unsaved words.");
			await page.locator(".sf-codex-file", { hasText: "Sam" }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename…" }).click();
			await dialog(page).getByLabel("New name").fill("Samuel");
			await dialog(page).getByRole("button", { name: "Next" }).click();
			await dialog(page).getByRole("button", { name: "Rename" }).click();
			await expect(dialog(page).getByRole("button", { name: "Done" })).toBeVisible();
			await dialog(page).getByRole("button", { name: "Done" }).click();
			expect(await onDisk(page, "Codex/Samuel.md")).toContain("Unsaved words.");
			await expect(page.locator(".sf-slot--lore .cm-content")).toContainText("Unsaved words.");
			expect(await page.evaluate(() => window.__app.editors!.pathIn("lore"))).toBe("Codex/Samuel.md");
		});

		test("text typed in a chapter that links to the note is saved first, not lost", async ({ page }) => {
			await openProject(page, withLinks(page));
			await page.getByRole("button", { name: "Chapters" }).click();
			await page.locator(".sf-nav-row", { hasText: "The Storm" }).click();
			await page.locator(".sf-slot--centre .cm-content").click();
			await page.keyboard.press("ControlOrMeta+ArrowDown");
			await page.keyboard.type(" Typed just now.");
			await page.locator(".sf-codex-file", { hasText: "Jane" }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename…" }).click();
			await dialog(page).getByLabel("New name").fill("Janet");
			await dialog(page).getByRole("button", { name: "Next" }).click();
			await dialog(page).getByRole("button", { name: "Rename" }).click();
			await expect(dialog(page).locator(".sf-plan-headline")).toContainText("Renamed to");
			await dialog(page).getByRole("button", { name: "Done" }).click();
			const text = await onDisk(page, CH2);
			expect(text).toContain("Typed just now.");
			expect(text).toContain("[[Janet]]");
		});

		test("in a read-only project nothing can be renamed", async ({ page }) => {
			await openProject(page, async () => void (await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"))));
			await expect(page.getByRole("alert").filter({ hasText: "newer storyForge" })).toBeVisible();
			await page.locator(".sf-codex-file", { hasText: "Jane" }).click({ button: "right" });
			await expect(page.getByRole("menuitem", { name: "Rename…" })).toHaveCount(0);
		});
	});

	test("the start screen's New Project dialog is keyboard-operable end to end", async ({ page }) => {
		await openPreview(page, { recent: false, pick: "empty" });
		await page.getByRole("button", { name: "New Project…" }).focus();
		await page.keyboard.press("Enter");
		await page.keyboard.type("Keyboard Series");
		await page.keyboard.press("Enter");
		await expect(page.getByRole("heading", { name: "storyForge test vault" })).toBeAttached();
		expect(await page.evaluate(() => window.__preview.read("_story-library/series.md"))).toContain("Keyboard Series");
	});
});
