import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { flipFace, openPreview } from "./helpers";

// Brief 19, commit 3 (§1.3): on the library side's series tab the context panel shows the chosen novel: cover, title, default PoV, synopsis,
// its progress bar and its chapters as bars without names. Choosing a novel changes only the panel.

const BOOK_A = "_story-library/novel-aaa.md";

function tree(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) tree(full, base, out);
		else out[path.relative(base, full)] = readFileSync(full).toString("base64");
	}
	return out;
}
async function openProject(page: Page): Promise<string> {
	const { root } = await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await page.getByRole("tab", { name: "series" }).click();
	return root;
}
/**
 * A novel shaped past the longest of Kenny's (read-only look, 7 November 2026: his longest has 8 chapters and no synopsis): 30 placed chapters and a long synopsis,
 * so the panel's content is taller than a low window. The first test below uses the plain fixture, where everything fits.
 */
async function openBig(page: Page): Promise<void> {
	const { root } = await openPreview(page);
	const novel = path.join(root, "_story-library/novel-aaa.md");
	const names = Array.from({ length: 30 }, (_, i) => `ch-big${String(i + 1).padStart(2, "0")}.md`);
	mkdirSync(path.join(root, "_story-library/aaa"), { recursive: true });
	for (const [i, n] of names.entries()) writeFileSync(path.join(root, "_story-library/aaa", n), `Synthetic sentence ${i} walks across the page.\n`.repeat(3 + i));
	const fm = readFileSync(novel, "utf8").replace(/chapter-order:\n(  - .*\n)+/, `chapter-order:\n${names.map((n) => `  - ${n}\n`).join("")}`);
	writeFileSync(novel, `${fm.trimEnd()}\n\n## Synopsis\n\n${"A long synthetic synopsis sentence that fills several lines of a narrow panel. ".repeat(12)}\n`);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await page.getByRole("tab", { name: "series" }).click();
}
const panel = (page: Page) => page.locator(".sf-novel-context");
const synopsis = (page: Page) => panel(page).getByRole("textbox", { name: /^Synopsis of / });
const fieldText = (box: ReturnType<typeof synopsis>): Promise<string> => box.evaluate((el) => [...el.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"));
const read = (page: Page, f: string) => page.evaluate((x) => window.__preview.read(x), f);
const choose = (page: Page, name: string) => page.locator(".sf-forge-pane .sf-row", { hasText: name }).click();

test.describe("the series tab's context panel", () => {
	test("with no novel chosen the first placed one is chosen (Tweaks 2 §1.8) and the novel being written is untouched; it shows cover, title, default PoV, synopsis, progress and unlabelled chapter bars", async ({ page }) => {
		await openProject(page);
		await expect(panel(page)).toBeVisible();
		await expect(panel(page).locator(".sf-novel-ctx-title")).toContainText("Book 1"); // chosen automatically
		expect(await page.evaluate(() => (window.__app as any).nav.book)).toBe("aaa");
		await choose(page, "Book 1");
		await expect(panel(page).locator(".sf-cover")).toBeVisible();
		await expect(panel(page).locator(".sf-novel-ctx-title")).toContainText("Book 1");
		await expect(panel(page).locator(".sf-meta-row")).toContainText("Default PoV:");
		await expect(synopsis(page)).toBeVisible();
		await expect(panel(page).locator(".sf-progress")).toBeVisible();
		const bars = panel(page).locator(".sf-novel-ctx-bars .sf-bar");
		expect(await bars.count()).toBeGreaterThan(0);
		await expect(bars.first().locator(".sf-bar-name")).toHaveCount(0); // no name drawn
		await expect(bars.first()).toHaveAttribute("aria-label", /Chapter 1|:/); // but the name is its accessible name
		// a click on a bar does nothing: the chosen chapter and the editor are as they were
		const before = await page.evaluate(() => ({ b: window.__app.nav.book, c: window.__app.nav.chapter, l: window.__app.nav.libraryBook }));
		await bars.first().click();
		expect(await page.evaluate(() => ({ b: window.__app.nav.book, c: window.__app.nav.chapter, l: window.__app.nav.libraryBook }))).toEqual(before);
		// the panel follows another choice
		await choose(page, "Book 2");
		await expect(panel(page).locator(".sf-novel-ctx-title")).toContainText("Book 2");
	});


	test("the progress bar and every chapter bar keep their height when the content is taller than the panel, at the default and the minimum width (decision 152)", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 340 });
		await openBig(page);
		await choose(page, "Book 1");
		const bars = panel(page).locator(".sf-novel-ctx-bars .sf-bar");
		await expect(bars).toHaveCount(30);
		const heights = () => panel(page).evaluate((p) => {
			const h = (s: string) => Math.round(p.querySelector(s)!.getBoundingClientRect().height);
			return { overflows: p.scrollHeight > p.clientHeight, progress: h(".sf-progress"), strip: h(".sf-structure-strip"), bars: [...p.querySelectorAll(".sf-novel-ctx-bars .sf-bar")].map((b) => Math.round(b.getBoundingClientRect().height)) };
		});
		const check = async (): Promise<void> => {
			const m = await heights();
			expect(m.overflows).toBe(true); // the case under test: the content is taller than the panel
			expect(m.progress).toBe(20);
			expect(m.strip).toBe(4);
			expect(m.bars.every((b) => b > 0)).toBe(true);
			// the panel scrolls far enough to show the last chapter bar (polled: the panel's own layout settles over a frame or two after a width change)
			await expect.poll(() => panel(page).evaluate((p) => { p.scrollTop = p.scrollHeight; const b = [...p.querySelectorAll(".sf-novel-ctx-bars .sf-bar")].at(-1)!.getBoundingClientRect(); const r = p.getBoundingClientRect(); return b.height > 0 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1; })).toBe(true);
		};
		await check(); // the default width
		await page.evaluate(() => (window.__app as any).commitTypedWidth("series", "lore", 22)); // the minimum (280 px of 1280)
		await expect.poll(() => panel(page).evaluate((p) => Math.round(p.getBoundingClientRect().width))).toBeLessThan(300);
		await check();
	});
	test("other tabs and the storytelling side show nothing of it", async ({ page }) => {
		await openProject(page);
		await choose(page, "Book 1");
		await page.getByRole("tab", { name: "codex" }).click();
		await expect(panel(page)).toBeHidden();
		await page.getByRole("tab", { name: "series" }).click();
		await expect(panel(page)).toBeVisible();
		await flipFace(page);
		await expect(panel(page)).toBeHidden();
	});

	test("the synopsis is written as a section on blur, changing nothing else in the file", async ({ page }) => {
		await openProject(page);
		await choose(page, "Book 1");
		const before = await read(page, BOOK_A);
		await synopsis(page).click();
		await synopsis(page).pressSequentially("Jane finds the lantern.");
		await panel(page).locator(".sf-novel-ctx-title").click();
		await expect.poll(() => read(page, BOOK_A)).toBe(`${before.trimEnd()}\n\n## Synopsis\nJane finds the lantern.\n`);
	});

	test("a synopsis typed in is committed when the chosen novel changes, to the novel it belongs to, and when the app is told to close", async ({ page }) => {
		await openProject(page);
		await choose(page, "Book 1");
		await synopsis(page).click();
		await synopsis(page).pressSequentially("Typed, then the novel changed.");
		expect(await read(page, BOOK_A)).not.toContain("Typed, then");
		await page.evaluate(() => window.__app.chooseNovel("bbb"));
		await expect.poll(() => read(page, BOOK_A)).toContain("Typed, then the novel changed.");
		await expect(panel(page).locator(".sf-novel-ctx-title")).toContainText("Book 2");
		await synopsis(page).click();
		await synopsis(page).pressSequentially("Typed when the app was told to close.");
		await page.evaluate(() => window.__preview.emit("close-requested"));
		await expect.poll(() => read(page, "_story-library/novel-bbb.md")).toContain("Typed when the app was told to close.");
	});

	test("a synopsis changed on disk while it is being edited is not overwritten: the author's text goes to recovery and a notice says so", async ({ page }) => {
		await openProject(page);
		await choose(page, "Book 1");
		await synopsis(page).click();
		await synopsis(page).pressSequentially("My own words");
		const novel = await read(page, BOOK_A);
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [BOOK_A, `${novel.trimEnd()}\n\n## Synopsis\nSomebody else.\n`]);
		await panel(page).locator(".sf-novel-ctx-title").click();
		await expect(page.getByRole("alert").filter({ hasText: "changed on disk" })).toContainText("recovery");
		expect(await read(page, BOOK_A)).toContain("Somebody else.");
	});

	test("a synopsis whose heading appears twice shows read-only, with a notice", async ({ page }) => {
		await openPreview(page);
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		const text = await read(page, BOOK_A);
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [BOOK_A, `${text.trimEnd()}\n\n## Synopsis\nOne\n\n## Synopsis\nTwo\n`]);
		await flipFace(page);
		await page.getByRole("tab", { name: "series" }).click();
		await choose(page, "Book 1");
		await expect(synopsis(page)).toHaveAttribute("aria-readonly", "true");
		await expect(page.getByRole("alert").filter({ hasText: "appears more than once" })).toBeVisible();
		const shown = await fieldText(synopsis(page));
		await synopsis(page).click();
		await synopsis(page).pressSequentially("x");
		expect(await fieldText(synopsis(page))).toBe(shown);
	});

	test("the default PoV is chosen from the Codex's people, exactly as before", async ({ page }) => {
		await openProject(page);
		await choose(page, "Book 1");
		await panel(page).locator(".sf-meta-value").click();
		await page.getByRole("menuitem", { name: "Sam" }).click();
		await expect.poll(() => read(page, BOOK_A)).toMatch(/default-pov[^\n]*Sam/);
		await expect(panel(page).locator(".sf-meta-row")).toContainText("Sam");
	});

	test("browsing the series page, choosing novels and flipping sides writes nothing", async ({ page }) => {
		const root = await openProject(page);
		await page.waitForTimeout(800);
		const before = tree(root);
		await choose(page, "Book 1");
		await choose(page, "Book 2");
		await page.locator(".sf-overview-row", { hasText: "Book 1" }).locator(".sf-overview-name").click();
		for (const t of ["codex", "novel", "series", "archive", "series"]) await page.getByRole("tab", { name: t }).click();
		await flipFace(page);
		await flipFace(page);
		await page.waitForTimeout(1500);
		expect(tree(root)).toEqual(before);
	});
});
