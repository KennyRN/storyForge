import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import * as path from "node:path";

/** Opens the preview on a fresh copy of a synthetic fixture. */
export async function openPreview(page: Page, options: { fixture?: string; recent?: boolean; pick?: "project" | "cancel" | "empty"; readOnly?: boolean } = {}): Promise<{ root: string }> {
	await page.goto("/index.html");
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	const out = await page.evaluate((o) => window.__preview.reset(o), options);
	// The start screen reads the recent list when it is drawn: draw it again now the list has changed.
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	return out;
}

/** Saves a screenshot for the report when SHOTS=1 (npm run ui:shots). */
export async function shot(page: Page, name: string): Promise<void> {
	if (!process.env.SHOTS) return;
	const dir = path.join(process.cwd(), "docs/interface-shots");
	mkdirSync(dir, { recursive: true });
	await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

/** Flips between the sides the way the menu does (View ▸ Flip Side): the storytelling side has no Flip side button (decision 81). */
export async function flipFace(page: Page): Promise<void> {
	await page.waitForFunction(() => !!window.__app?.editors); // the menu answers only once a project is open (a button click used to wait for itself)
	await page.evaluate(() => window.__preview.emit("menu", "flip-face"));
}
