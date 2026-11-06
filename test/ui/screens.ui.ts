import { expect, test, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as nodePath from "node:path";
import { plantLeftovers } from "../helpers/leftovers";
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
		await expect(page.getByRole("dialog", { name: "Changes found when opening" })).toBeVisible();
		await expect(d.getByText("ch-new.md")).toBeVisible();
		await shot(page, "summary");
		await d.getByRole("button", { name: "OK" }).click();
		await expect(d).toHaveCount(0);
	});

	test("a Codex note renamed while the app was closed: the summary says its PoV and location lists followed", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => window.__app.controller.teardown());
		await page.evaluate(() => window.__preview.rename("Codex/Jane.md", "Codex/Janet.md"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		const d = dialog(page);
		await expect(d.getByText("Codex/Jane.md is now Codex/Janet.md (PoV and location lists in 1 novel file followed it)")).toBeVisible();
		await shot(page, "shape-summary-references");
		expect(await onDisk(page, "_story-library/novel-aaa.md")).toContain("default-pov-path: Codex/Janet.md");
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
			await expect(d.getByText("PoV and location lists in 1 novel file will follow the new name.")).toBeVisible();
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
			// The chapters' PoV and the default PoV follow the note, by path and name.
			const novel = await onDisk(page, "_story-library/novel-aaa.md");
			expect(novel).toContain("default-pov-path: Codex/Janet.md");
			expect(novel).toContain("default-pov-name: Janet");
			expect(novel).toContain("Codex%2FJanet.md=Janet");
			expect(novel).toContain("pov-path:\n      - Codex/Janet.md");
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

test.describe("leftover temporary files at open (docs/temp-tidy.md)", () => {
	const plant = async (page: Page, options: { readOnly?: boolean } = {}) => {
		const { root } = await openPreview(page, options);
		const planted = plantLeftovers(root);
		return { root, planted };
	};
	const startProject = async (page: Page) => {
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
	};

	test("the summary says first, plainly, which words may not have been saved, then the earlier versions, and what was tidied", async ({ page }) => {
		const { root, planted } = await plant(page);
		await startProject(page);
		const d = dialog(page);
		await expect(page.getByRole("dialog", { name: "Changes found when opening" })).toBeVisible();
		await expect(d.getByText("storyForge tidied up after a save that was interrupted.")).toBeVisible();
		// words that may not have been saved come first, in their own plain section
		const first = d.locator(".sf-summary-section").first();
		await expect(first).toHaveAttribute("aria-label", "Words that may not have been saved");
		await expect(first).toContainText("may hold words that were never saved");
		await expect(first).toContainText("ch-a1.md");
		await expect(first).not.toContainText("wordcount.md"); // not words
		await expect(d.getByRole("region", { name: "Other files that may not have been saved" })).toContainText("wordcount.md: a save didn't finish");
		// the older Codex version is mentioned quietly, in its own section
		await expect(d.getByRole("region", { name: "Earlier versions kept" })).toContainText("Sam.md: an earlier version was kept at _sf-backup/recovery/_codex/");
		await expect(d.getByRole("region", { name: "Tidied" })).toContainText("2 leftover temporary files were removed");
		await expect(d.getByRole("region", { name: "Left where they are" })).toContainText("can't be classified");
		await shot(page, "leftovers-summary");
		// what the summary says is on disk: every leftover that differed was copied into recovery, byte for byte
		expect(existsSync(nodePath.join(root, planted.newerProse))).toBe(false);
		const copy = readdirSync(nodePath.join(root, "_sf-backup/recovery/aaa")).find((n) => n.startsWith("ch-a1 (leftover"));
		expect(copy).toBeDefined();
		expect(readFileSync(nodePath.join(root, "_sf-backup/recovery/aaa", copy!), "utf8")).toContain("The newest words, never swapped in.");
		// no decoy was touched
		for (const decoy of planted.decoys) expect(readFileSync(nodePath.join(root, decoy), "utf8")).toBe(`decoy ${decoy}`);
	});

	test("a second open of the same folder says nothing", async ({ page }) => {
		await plant(page);
		await startProject(page);
		await expect(dialog(page)).toBeVisible();
		await page.getByRole("button", { name: "OK" }).click();
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await startProject(page);
		await expect(dialog(page)).toHaveCount(0);
	});

	test("in a read-only project the leftovers are reported and nothing is moved", async ({ page }) => {
		const { root, planted } = await plant(page);
		// a project made by a newer storyForge opens read-only
		writeFileSync(nodePath.join(root, "_backstage/storyforge/project.md"), "---\nformat-version: 99\n---\n");
		await startProject(page);
		await expect(dialog(page).getByRole("region", { name: "Tidied" })).toContainText("this project is read-only, so nothing was moved or removed");
		expect(existsSync(nodePath.join(root, planted.newerProse))).toBe(true);
		expect(readdirSync(nodePath.join(root, "_sf-backup/recovery/aaa")).some((n) => n.includes("(leftover"))).toBe(false);
		expect(existsSync(nodePath.join(root, planted.zip))).toBe(true);
	});
});
