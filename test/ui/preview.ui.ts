import { expect, test } from "@playwright/test";
import { openPreview, shot } from "./helpers";

test.describe("the preview and the start screen", () => {
	test("starts on the start screen: Open, New, and the recent list, nothing else", async ({ page }) => {
		await openPreview(page);
		await expect(page.getByRole("button", { name: "Open Project…" })).toBeVisible();
		await expect(page.getByRole("button", { name: "New Project…" })).toBeVisible();
		await expect(page.getByRole("list", { name: "Recent projects" }).getByRole("button")).toHaveCount(1);
		await expect(page.locator(".sf-project-card-name")).toHaveText("The Lantern Cycle"); // the series' title, once the card's details arrive (Brief 16)
		await shot(page, "start");
	});

	test("a recent project opens through the real Rust code", async ({ page }) => {
		await openPreview(page);
		await page.locator("[data-recent='0']").click();
		await expect(page.getByRole("heading", { name: "storyForge test vault" })).toBeVisible();
		const text = await page.evaluate(() => window.__app.running?.opened.project.index.get("_story-library/series.md")?.path ?? null);
		expect(text).toBe("_story-library/series.md");
	});

	test("Open Project opens the picked folder, and a cancelled picker leaves the start screen", async ({ page }) => {
		await openPreview(page, { recent: false, pick: "cancel" });
		await page.getByRole("button", { name: "Open Project…" }).click();
		await expect(page.getByRole("button", { name: "Open Project…" })).toBeVisible();
		await page.evaluate(() => window.__preview.pick("project"));
		await page.getByRole("button", { name: "Open Project…" }).click();
		await expect(page.getByRole("heading", { name: "storyForge test vault" })).toBeVisible();
	});

	test("New Project asks series or standalone, then creates it in an empty folder", async ({ page }) => {
		await openPreview(page, { recent: false, pick: "empty" });
		await page.getByRole("button", { name: "New Project…" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByText("Are you writing a series, or a single standalone book?")).toBeVisible();
		await shot(page, "new-project");
		await dialog.getByRole("button", { name: "Start my series" }).click();
		await expect(dialog).toBeVisible(); // a title is needed first
		await dialog.getByLabel("Series name").fill("The Lantern Cycle");
		await dialog.getByRole("button", { name: "Start my series" }).click();
		await expect(page.getByRole("heading", { name: "storyForge test vault" })).toBeVisible();
		const root = await page.evaluate(() => window.__preview.root());
		const series = await page.evaluate(() => window.__preview.read("_story-library/series.md"));
		expect(root).toBeTruthy();
		expect(series).toContain("The Lantern Cycle");
	});

	test("a failure becomes a plain notice", async ({ page }) => {
		await openPreview(page, { recent: false, pick: "project" });
		// A non-empty folder cannot be created into.
		await page.getByRole("button", { name: "New Project…" }).click();
		await page.getByLabel("Series name").fill("Nope");
		await page.getByRole("button", { name: "Just one book (no series)" }).click();
		await expect(page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: /Could not create the project/ })).toBeVisible();
	});
});
