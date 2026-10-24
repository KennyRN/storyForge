import { expect, test } from "@playwright/test";
import { openPreview } from "./helpers";

test("View ▸ Developer ▸ Diagnostics shows the diagnostic page over the app (development builds); Escape closes it", async ({ page }) => {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await page.evaluate(() => window.__preview.emit("menu", "diagnostics"));
	const layer = page.getByRole("dialog", { name: "Diagnostics" });
	await expect(layer.getByRole("heading", { name: "storyForge diagnostic" })).toBeVisible();
	await expect(layer.getByRole("heading", { name: "Reconciliation at open" })).toBeVisible();
	await expect(layer.getByText("SERIES: The Lantern Cycle")).toBeVisible();
	await expect(layer.getByRole("heading", { name: "Settings and where each came from" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(layer).toHaveCount(0);
	await expect(page.locator(".sf-nav-novel")).toBeVisible(); // the app underneath is untouched
});
