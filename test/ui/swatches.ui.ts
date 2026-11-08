import { expect, test } from "@playwright/test";
import { openPreview, openSettingsDialog } from "./helpers";

// Decision 159: a swatch that can't be chosen is not muted: a line in the surface's background colour crosses it from its top-right corner to its bottom-left,
// and its name and tooltip still say it is unavailable, with the reason. Today that is every swatch in a project whose settings can't be changed.

test.describe("a swatch that can't be chosen (decision 159)", () => {
	test("in a read-only project every colour swatch is crossed out, not muted, and says why; the text chips keep the ordinary disabled look", async ({ page }) => {
		await openPreview(page, { readOnly: true });
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n")); // made by a newer storyForge: the project opens read-only
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await openSettingsDialog(page);
		const dialog = page.getByRole("dialog");
		// the text chips are not colours: they keep the ordinary disabled look, with no line across them
		const chips = dialog.getByRole("radio", { name: /A series|One standalone novel/ });
		await expect(chips).toHaveCount(2);
		for (const chip of await chips.all()) {
			await expect(chip).toBeDisabled();
			const s = await chip.evaluate((e) => ({ opacity: getComputedStyle(e).opacity, content: getComputedStyle(e, "::after").content }));
			expect(s).toEqual({ opacity: "0.6", content: "none" });
		}
		await dialog.getByRole("tab", { name: "appearance", exact: true }).click();
		await dialog.locator(".sf-settings-subtabs").getByRole("tab", { name: "library mode", exact: true }).click();
		const colour = dialog.getByRole("radiogroup", { name: "rail colour", exact: true }).getByRole("radio").first();
		await expect(colour).toBeDisabled();
		const m = await colour.evaluate((e) => { const a = getComputedStyle(e, "::after"); const probe = document.createElement("i"); probe.style.color = "var(--purpose-raised-bg)"; document.body.append(probe); const bg = getComputedStyle(probe).color; probe.remove(); return { opacity: getComputedStyle(e).opacity, image: a.backgroundImage, bg, label: e.getAttribute("aria-label"), title: e.getAttribute("title") }; });
		expect(m.opacity).toBe("1");
		expect(m.image).toContain(m.bg); // the line is the surface's own background colour
		expect(m.image).toContain("to right bottom");
		expect(m.title).toContain("unavailable");
		expect(m.title).toContain(m.label!);
	});

	test("in an ordinary project no swatch is crossed out", async ({ page }) => {
		await openPreview(page);
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await openSettingsDialog(page);
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("tab", { name: "appearance", exact: true }).click();
		await dialog.locator(".sf-settings-subtabs").getByRole("tab", { name: "library mode", exact: true }).click();
		for (const swatch of await dialog.locator(".sf-swatch").all()) {
			await expect(swatch).toBeEnabled();
			expect(await swatch.evaluate((e) => getComputedStyle(e, "::after").content)).toBe("none");
		}
	});
});
