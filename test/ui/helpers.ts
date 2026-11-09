import { expect, type Page } from "@playwright/test";
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
	const dir = process.env.SHOTS_DIR ? path.resolve(process.env.SHOTS_DIR) : path.join(process.cwd(), "docs/interface-shots");
	mkdirSync(dir, { recursive: true });
	await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

/** Flips between the sides the way the menu does (View ▸ Flip Side): the storytelling side has no Flip side button (decision 81). */
export async function flipFace(page: Page): Promise<void> {
	await page.waitForFunction(() => !!window.__app?.editors); // the menu answers only once a project is open (a button click used to wait for itself)
	await page.evaluate(() => window.__preview.emit("menu", "flip-face"));
}

/**
 * Opens Settings the way the menu does (⌘,) and waits for the dialog to finish opening before anything is clicked: the General page, which
 * it opens on, is drawn and its tab is the selected one. (The dialog has no readiness signal of its own; its first page's content is the
 * observable one.) There is no fixed delay and no retry: a click lost at human speed would still show.
 */
export async function openSettingsDialog(page: Page): Promise<void> {
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	const d = page.getByRole("dialog");
	await expect(d.locator(".sf-settings-tabs").getByRole("tab", { name: "general", exact: true })).toHaveAttribute("aria-selected", "true");
	await expect(d.getByLabel("Opens in")).toBeVisible();
}

/**
 * Keys that differ by system (Brief 22). The tests run in WebKit on the Mac and in Chromium on Windows
 * (`SF_BROWSER=chromium`): the Mac moves the caret with ⌘ and ⌥, Windows with Ctrl and Home/End, and Windows' plain Tab
 * reaches buttons (WebKit needs Option-Tab, which is WebKit's own behaviour and not an app shortcut).
 */
const chromium = process.env.SF_BROWSER === "chromium";
/** The invisible title bar's band: 28 px on the Mac, none on Windows (Brief 22). */
export const BAND = chromium && (process.platform === "win32" || !!process.env.SF_WINDOWS_UA) ? 0 : 28;
/** Redo: a real keyboard sends an upper-case Z with Shift held; Playwright's "Shift+z" sends a lower-case one, which CodeMirror reads as plain Ctrl-Z. */
export const REDO = chromium ? "Control+Shift+Z" : "ControlOrMeta+Shift+z";
export const TAB = chromium ? "Tab" : "Alt+Tab";
export const SHIFT_TAB = chromium ? "Shift+Tab" : "Alt+Shift+Tab";
export const DOC_START = chromium ? "Control+Home" : "Meta+ArrowUp";
export const DOC_END = chromium ? "Control+End" : "Meta+ArrowDown";
export const LINE_START = chromium ? "Home" : "Meta+ArrowLeft";
export const SELECT_WORD_RIGHT = chromium ? "Control+Shift+ArrowRight" : "Shift+Alt+ArrowRight";
export const WORD_RIGHT = chromium ? "Control+ArrowRight" : "Alt+ArrowRight";
