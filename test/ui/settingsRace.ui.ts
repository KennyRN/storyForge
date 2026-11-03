import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// A change made in Settings while an earlier one is still being saved is never lost (decision 96's rule, for the dialog's own writes too):
// when a write lands the dialog redraws everything except the controls in use.

const PROJECT_MD = "_backstage/storyforge/project.md";
const dialog = (page: Page) => page.getByRole("dialog");
const read = (page: Page) => page.evaluate((p) => window.__preview.read(p).catch(() => ""), PROJECT_MD);

async function openSettings(page: Page, tab: string): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	await dialog(page).getByRole("tab", { name: tab, exact: true }).click();
}

/** Holds every write to project.md (not the reads) until `release()`, so a save can be "still in progress" for as long as the test likes. */
async function holdWrites(page: Page): Promise<{ release: () => void; releaseOne: () => void; held: () => number }> {
	let holding = true;
	const waiting: (() => void)[] = [];
	await page.route("**/__host/invoke", async (route) => {
		const body = route.request().postData() ?? "";
		const isWrite = body.includes("project.md") && !/"cmd":"(stat|read_text)"/.test(body);
		if (holding && isWrite) await new Promise<void>((resolve) => waiting.push(resolve));
		await route.continue();
	});
	return { release: () => ((holding = false), waiting.splice(0).forEach((r) => r())), releaseOne: () => waiting.shift()?.(), held: () => waiting.length };
}

test.describe("settings: a change made while an earlier one is saving", () => {
	test("text in a second box, typed while the first write is pending, keeps its text and focus, and both values are written", async ({ page }) => {
		await openSettings(page, "Sessions");
		const d = dialog(page);
		const idle = d.getByLabel("Session idle limit (minutes)");
		const wpm = d.getByLabel("Count as editing below (words per minute)");
		const gate = await holdWrites(page);
		await idle.fill("10");
		await idle.press("Enter");
		await expect.poll(gate.held).toBe(1); // the first write is under way
		await wpm.fill("6");
		gate.release(); // the first write lands, and the dialog redraws
		await expect.poll(() => read(page)).toContain("session-idle-minutes: 10");
		await expect(idle).toHaveValue("10"); // the stored value
		await expect(wpm).toHaveValue("6"); // what was being typed is still there
		await expect(wpm).toBeFocused();
		await wpm.press("Enter");
		await expect.poll(() => read(page)).toMatch(/session-idle-minutes: 10[\s\S]*session-editing-wpm: 6|session-editing-wpm: 6[\s\S]*session-idle-minutes: 10/);
		await expect(wpm).toHaveValue("6");
	});

	test("two quick toggles on different controls while a write is pending: the second isn't replaced under the click, and both land", async ({ page }) => {
		await openSettings(page, "General");
		const d = dialog(page);
		const highlight = d.getByLabel("Highlight the active chapter");
		const hide = d.getByLabel("Hide the series pane (for one standalone book)");
		await expect(highlight).toBeChecked();
		await expect(hide).not.toBeChecked();
		const gate = await holdWrites(page);
		await highlight.uncheck();
		await expect.poll(gate.held).toBe(1);
		await hide.check(); // its write waits behind the first
		gate.releaseOne(); // the first lands, and the dialog redraws, while the second write is still pending (held in turn)
		await expect.poll(() => read(page)).toContain("highlight-active-chapter: false");
		await expect.poll(gate.held).toBe(1); // the second write is under way
		await expect(hide).toBeChecked(); // not replaced under the click: it still shows what was chosen
		await expect(highlight).not.toBeChecked(); // the first one shows its stored value
		gate.release();
		await expect.poll(() => read(page)).toContain("hide-series-pane: true");
		await expect(hide).toBeChecked();
		await expect(highlight).not.toBeChecked();
	});
});
