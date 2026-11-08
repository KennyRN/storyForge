import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Brief 19, commit 5 (§2): Settings tidied. "Hide the series pane" only for a standalone story, off again when a series is chosen, ignored while a series;
// no source or default text; a control sits near its label; General's two sub-pages are one.

const MD = "_backstage/storyforge/project.md";
const read = (page: Page) => page.evaluate((p) => window.__preview.read(p).catch(() => ""), MD);
async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const dialog = (page: Page) => page.getByRole("dialog");

test("'Hide the series pane' shows only for a standalone story; choosing a series switches it off at the same time", async ({ page }) => {
	await openProject(page);
	await openSettingsDialog(page);
	const d = dialog(page);
	const hide = d.getByLabel("Hide the series pane (for one standalone book)");
	await expect(hide).toHaveCount(0); // a series
	await d.getByRole("radio", { name: "One standalone novel" }).click();
	await expect(hide).toBeVisible();
	await hide.check();
	await expect.poll(() => read(page)).toContain("hide-series-pane: true");
	await d.getByRole("button", { name: "Done" }).click();
	await flipFace(page);
	await expect(page.getByRole("tab", { name: "series" })).toHaveCount(0);
	await flipFace(page);
	await openSettingsDialog(page);
	await d.getByRole("radio", { name: "A series" }).click();
	await expect.poll(() => read(page)).toContain("hide-series-pane: false");
	await expect(hide).toHaveCount(0);
	await d.getByRole("button", { name: "Done" }).click();
	await flipFace(page);
	await expect(page.getByRole("tab", { name: "series" })).toBeVisible();
});

test("while the project is a series the stored setting is ignored, and a change made outside writes nothing", async ({ page }) => {
	await openPreview(page);
	await page.evaluate((p) => window.__preview.touch(p, "---\nformat-version: 1\nhide-series-pane: true\n---\n"), MD);
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await expect(page.getByRole("tab", { name: "series" })).toBeVisible(); // series by default: the stored true is ignored
	// an outside change to the story kind: the pane hides, and nothing is written by the app
	const before = "---\nformat-version: 1\nhide-series-pane: true\nstory-kind: standalone\n---\n";
	await page.evaluate(([p, t]) => window.__preview.touch(p, t), [MD, before]);
	await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), MD);
	await expect(page.getByRole("tab", { name: "series" })).toHaveCount(0);
	await page.waitForTimeout(800);
	expect(await read(page)).toBe(before);
	// and back to a series, outside: the stored true is ignored again, still nothing written
	const back = "---\nformat-version: 1\nhide-series-pane: true\nstory-kind: series\n---\n";
	await page.evaluate(([p, t]) => window.__preview.touch(p, t), [MD, back]);
	await page.evaluate((p) => window.__preview.emit("watch-batch", { paths: [p], rescan: false }), MD);
	await expect(page.getByRole("tab", { name: "series" })).toBeVisible();
	await page.waitForTimeout(800);
	expect(await read(page)).toBe(back);
});

test("no 'default', 'this project' or settings-source text in any page of Settings; General is one page of settings and one of sidebar widths", async ({ page }) => {
	await openProject(page);
	await openSettingsDialog(page);
	const d = dialog(page);
	await expect(d.locator(".sf-settings-subtabs").getByRole("tab")).toHaveText(["general", "sidebar widths"]);
	for (const top of ["General", "Appearance", "Writing", "Sessions", "Backups"]) {
		await d.locator(".sf-settings-tabs").getByRole("tab", { name: top.toLowerCase(), exact: true }).click();
		const subs = await d.locator(".sf-settings-subtabs").getByRole("tab").allInnerTexts();
		for (const s of subs.length ? subs : [""]) {
			if (s) await d.locator(".sf-settings-subtabs").getByRole("tab", { name: s, exact: true }).click();
			await expect(d.locator(".sf-setting-source")).toHaveCount(0);
			const text = await d.locator(".sf-settings-page").innerText();
			expect(text, `${top} ${s}`).not.toMatch(/\bthis project\b|the plugin's settings|\(default\)|^default$/m);
		}
	}
});

test("a label with a single control keeps the control close to it", async ({ page }) => {
	await openProject(page);
	await openSettingsDialog(page);
	const d = dialog(page);
	const label = d.locator(".sf-setting-row", { hasText: "Opens in" }).locator(".sf-setting-label");
	const control = d.getByLabel("Opens in");
	const l = (await label.boundingBox())!;
	const c = (await control.boundingBox())!;
	const page_ = (await d.locator(".sf-settings-page").boundingBox())!;
	expect(c.x - (l.x + l.width)).toBeLessThan(260);
	expect(c.x + c.width).toBeLessThan(page_.x + page_.width * 0.75); // not pushed to the dialog's right edge
});

test("sidebar widths: opening and moving a slider writes nothing to project.md", async ({ page }) => {
	await openProject(page);
	const before = await read(page);
	await openSettingsDialog(page);
	const d = dialog(page);
	await d.getByRole("tab", { name: "sidebar widths", exact: true }).click();
	await d.getByLabel("novel, left panel width", { exact: true }).fill("24");
	await page.waitForTimeout(800);
	expect(await read(page)).toBe(before);
});
