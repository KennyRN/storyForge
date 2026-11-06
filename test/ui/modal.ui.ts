import { expect, test, type Page } from "@playwright/test";
import { openPreview, openSettingsDialog } from "./helpers";

// Fix 8 (decision 119): one way for dialogs to behave. Keys are Option-Tab (decision 118): plain Tab skips buttons on Kenny's Mac.

const SETTINGS = "_backstage/storyforge/project.md";

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const dialogs = (page: Page) => page.getByRole("dialog");
const insideDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest(".sf-dialog-overlay"));
const openHistory = (page: Page) => page.getByRole("button", { name: /history/i }).first().click();

test.describe("modal dialogs", () => {
	test("Settings opens with focus on the selected section, announced as a modal dialog named Settings", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await expect(page.locator(".sf-dialog")).toHaveAttribute("aria-modal", "true");
		await expect(dialogs(page)).toHaveAccessibleName("Settings");
		await expect(page.locator(".sf-settings-tab.is-active")).toBeFocused();
		expect(await page.evaluate(() => document.documentElement.dataset.input)).not.toBe("keyboard"); // decision 106: no ring after a mouse-less, key-less open
	});

	test("no dialog has a visible title; each keeps its name for the screen reader", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await expect(dialogs(page)).toHaveAttribute("aria-label", "Settings");
		await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
		await expect(dialogs(page).locator(".sf-dialog-title")).toHaveCount(0);
		await expect(dialogs(page).getByRole("heading", { name: "Settings", exact: true })).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(dialogs(page)).toHaveCount(0);
		await openHistory(page);
		await expect(page.getByRole("dialog", { name: "Word count history" })).toBeVisible();
		await expect(dialogs(page).locator(".sf-dialog-title")).toHaveCount(0);
	});

	test("after clicking each tab with the mouse, focus is inside the dialog and Escape closes it", async ({ page }) => {
		await openProject(page);
		for (const name of ["General", "story", "this Mac", "Appearance", "Writing", "Sessions", "Backups"]) {
			await openSettingsDialog(page);
			await dialogs(page).getByRole("tab", { name, exact: true }).click();
			await expect(dialogs(page).getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
			expect(await insideDialog(page)).toBe(true);
			await page.keyboard.press("Escape");
			await expect(dialogs(page)).toHaveCount(0);
		}
	});

	test("Option-Tab and Option-Shift-Tab cycle within the dialog and wrap, never reaching the page behind", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const seen = new Set<string>();
		for (let i = 0; i < 40; i++) {
			await page.keyboard.press("Alt+Tab");
			expect(await insideDialog(page)).toBe(true);
			seen.add(await page.evaluate(() => `${document.activeElement?.tagName}|${document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent}`));
		}
		expect(seen.size).toBeGreaterThan(3);
		for (let i = 0; i < 40; i++) {
			await page.keyboard.press("Alt+Shift+Tab");
			expect(await insideDialog(page)).toBe(true);
		}
		// Done is the last stop; one more wraps to the first.
		await page.getByRole("button", { name: "Done" }).focus();
		await page.keyboard.press("Alt+Tab");
		expect(await insideDialog(page)).toBe(true);
		await expect(page.getByRole("button", { name: "Done" })).not.toBeFocused();
		// The page behind is out of reach.
		expect(await page.evaluate(() => (document.querySelector(".sf-stage") as HTMLElement).inert)).toBe(true);
	});

	test("opening Settings again brings the one dialog forward", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialogs(page).getByRole("tab", { name: "General", exact: true }).click();
		await dialogs(page).getByRole("tab", { name: "story", exact: true }).click();
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await expect(dialogs(page)).toHaveCount(1);
		expect(await insideDialog(page)).toBe(true);
	});

	test("the history view: opens inside, cycles, closes with Escape, one copy", async ({ page }) => {
		await openProject(page);
		await openHistory(page);
		await expect(dialogs(page)).toHaveAccessibleName("Word count history");
		expect(await insideDialog(page)).toBe(true);
		await page.evaluate(() => document.querySelector<HTMLElement>(".sf-stats-chart")?.click()); // asked again, even though the page is inert
		await expect(dialogs(page)).toHaveCount(1);
		for (let i = 0; i < 12; i++) {
			await page.keyboard.press("Alt+Tab");
			expect(await insideDialog(page)).toBe(true);
		}
		await page.keyboard.press("Escape");
		await expect(dialogs(page)).toHaveCount(0);
	});

	test("closing returns focus to the opener; when it has gone, to the chapter editor", async ({ page }) => {
		await openProject(page);
		const navigate = page.getByRole("button", { name: "Navigate" });
		await navigate.focus();
		await openSettingsDialog(page);
		await page.keyboard.press("Escape");
		await expect(navigate).toBeFocused();
		await navigate.focus();
		await openSettingsDialog(page);
		await navigate.evaluate((n) => n.remove());
		await page.keyboard.press("Escape");
		await expect(page.locator(".sf-slot--centre .cm-content")).toBeFocused();
	});

	test("Escape in a text box with uncommitted text commits it exactly once", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialogs(page).getByRole("tab", { name: "Sessions", exact: true }).click();
		const box = dialogs(page).getByLabel("Session idle limit (minutes)");
		await box.focus();
		await box.fill("7");
		await page.keyboard.press("Escape");
		await expect(dialogs(page)).toHaveCount(0);
		await expect.poll(() => page.evaluate((p) => window.__preview.read(p).catch(() => ""), SETTINGS)).toContain("session-idle-minutes: 7");
	});

	test("a click on Writing straight after Settings opens lands, fifty times", async ({ page }) => {
		await openProject(page);
		for (let i = 0; i < 50; i++) {
			await page.evaluate(() => window.__preview.emit("menu", "settings"));
			await dialogs(page).getByRole("tab", { name: "Writing", exact: true }).click();
			await expect(dialogs(page).getByRole("tab", { name: "Writing", exact: true })).toHaveAttribute("aria-selected", "true");
			await page.keyboard.press("Escape");
			await expect(dialogs(page)).toHaveCount(0);
		}
	});

	test("a click on a tab while an outside change redraws still lands, and focus stays on the same control", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const tab = dialogs(page).getByRole("tab", { name: "story", exact: true });
		const box = (await tab.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.evaluate(async (p) => {
			await window.__preview.touch(p, "---\nformat-version: 1\nstory-kind: standalone\n---\n");
			window.__preview.emit("watch-batch", { paths: [p], rescan: false });
		}, SETTINGS);
		await page.mouse.up();
		await expect(tab).toHaveAttribute("aria-selected", "true");
		await expect(tab).toBeFocused();
		await page.evaluate(async (p) => {
			await window.__preview.touch(p, "---\nformat-version: 1\nstory-kind: series\n---\n");
			window.__preview.emit("watch-batch", { paths: [p], rescan: false });
		}, SETTINGS);
		await expect(dialogs(page).getByRole("radio", { name: "One standalone novel" })).not.toBeChecked();
		await expect(tab).toBeFocused();
	});

	test("plain Tab, on text boxes, stays inside and wraps both ways (WebKit decides what it reaches)", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		await dialogs(page).getByRole("tab", { name: "Sessions", exact: true }).click();
		await dialogs(page).getByLabel("Session idle limit (minutes)").focus();
		for (let i = 0; i < 14; i++) {
			await page.keyboard.press("Tab");
			expect(await insideDialog(page)).toBe(true);
		}
		for (let i = 0; i < 14; i++) {
			await page.keyboard.press("Shift+Tab");
			expect(await insideDialog(page)).toBe(true);
		}
		const names = new Set<string>();
		for (let i = 0; i < 14; i++) {
			await page.keyboard.press("Tab");
			names.add(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "(stop)"));
		}
		expect(names.has("Session idle limit (minutes)")).toBe(true); // it came round again
	});

	test("Escape at Rename's Back step renames nothing and writes nothing", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_story-library/aaa/ch-a2.md", "Meet [[Jane]].\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		const read = (p: string) => page.evaluate((x) => window.__preview.read(x).catch(() => "(none)"), p);
		const before = [await read("Codex/Jane.md"), await read("_story-library/aaa/ch-a2.md"), await read("_story-library/novel-aaa.md")];
		await page.locator(".sf-codex-file", { hasText: "Jane" }).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Rename…" }).click();
		await dialogs(page).getByLabel("New name").fill("Janet");
		await dialogs(page).getByRole("button", { name: "Next" }).click();
		await expect(dialogs(page).getByRole("button", { name: "Back" })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialogs(page)).toHaveCount(0);
		expect([await read("Codex/Jane.md"), await read("_story-library/aaa/ch-a2.md"), await read("_story-library/novel-aaa.md")]).toEqual(before);
		expect(await read("Codex/Janet.md")).toBe("(none)");
		await expect(page.locator(".sf-codex-file", { hasText: "Janet" })).toHaveCount(0);
	});

	// The hold on Settings' redraw (Fix 8): only the redraw waits, and it always ends.
	for (const how of ["pointer up outside the window", "pointer cancel", "window blur", "the time limit"] as const) {
		test(`a redraw held by a pressed tab ends on ${how}`, async ({ page }) => {
			await openProject(page);
			await openSettingsDialog(page);
			await dialogs(page).getByRole("tab", { name: "General", exact: true }).click();
		await dialogs(page).getByRole("tab", { name: "story", exact: true }).click();
			const standalone = dialogs(page).getByRole("radio", { name: "One standalone novel" });
			await expect(standalone).not.toBeChecked();
			const box = (await dialogs(page).getByRole("tab", { name: "story", exact: true }).boundingBox())!;
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.evaluate(async (p) => {
				await window.__preview.touch(p, "---\nformat-version: 1\nstory-kind: standalone\n---\n");
				window.__preview.emit("watch-batch", { paths: [p], rescan: false });
			}, SETTINGS);
			await page.waitForTimeout(300);
			await expect(standalone).not.toBeChecked(); // held while the pointer is down
			if (how === "pointer up outside the window") {
				await page.mouse.move(-20, -20);
				await page.mouse.up();
			} else if (how === "pointer cancel") await page.evaluate(() => window.dispatchEvent(new Event("pointercancel")));
			else if (how === "window blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
			await expect(standalone).toBeChecked({ timeout: how === "the time limit" ? 4000 : 1500 });
			if (how !== "pointer up outside the window") await page.mouse.up();
		});
	}
});
