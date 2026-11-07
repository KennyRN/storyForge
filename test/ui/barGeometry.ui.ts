import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { flipFace, openPreview } from "./helpers";

// Fix 11 (docs: decisions 153 to 155): the data bars' geometry, measured in real layout. A fixture of exact word counts and a chapter target, opened on the
// novel tab (a wide row) and in the series tab's context panel (a narrow one, from its minimum width to its default).

/** Opens the first novel with `words.length` placed chapters of exactly those word counts and the given planned chapter length. */
async function open(page: Page, words: number[], target: number | null, tab: "novel" | "series"): Promise<void> {
	const { root } = await openPreview(page);
	const novel = path.join(root, "_story-library/novel-aaa.md");
	const names = words.map((_, i) => `ch-geo${String(i + 1).padStart(2, "0")}.md`);
	mkdirSync(path.join(root, "_story-library/aaa"), { recursive: true });
	for (const [i, n] of names.entries()) writeFileSync(path.join(root, "_story-library/aaa", n), n && words[i] > 0 ? "word ".repeat(words[i]).trimEnd() + "\n" : "");
	let fm = readFileSync(novel, "utf8").replace(/chapter-order:\n(  - .*\n)+/, `chapter-order:\n${names.map((n) => `  - ${n}\n`).join("")}`);
	fm = fm.replace(/planned-chapter-length: .*\n/, target === null ? "" : `planned-chapter-length: ${target}\n`);
	writeFileSync(novel, fm);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await page.getByRole("tab", { name: tab }).click();
	if (tab === "series") await page.locator(".sf-forge-pane .sf-row", { hasText: "Book 1" }).click();
	else await expect(page.getByRole("region", { name: "Novel overview" })).toBeVisible();
}

/** The geometry of every chapter bar on the page: its row, frame and fill. */
const measure = (page: Page, tab: "novel" | "series") =>
	page.evaluate((sel) => [...document.querySelectorAll(sel)].map((b) => {
		const r = b.getBoundingClientRect();
		const f = b.querySelector(".sf-bar-frame")?.getBoundingClientRect() ?? null;
		const fill = b.querySelector(".sf-bar-fill")?.getBoundingClientRect() ?? null;
		return { rowLeft: r.left, rowRight: r.right, rowW: r.width, frameW: f?.width ?? null, frameRight: f?.right ?? null, fillW: fill?.width ?? 0, fillH: fill?.height ?? 0, fillRight: fill?.right ?? null, cut: b.classList.contains("sf-bar--cut"), cls: b.className };
	}), tab === "novel" ? ".sf-overview .sf-bar--chapter" : ".sf-novel-ctx-bars .sf-bar--chapter");

test.describe("the chapter bars' geometry (Fix 11)", () => {
	for (const ratio of [1, 3, 10, 30]) {
		test(`the longest bar ends at the row's end at ${ratio * 100}% of its target (the frame padding is not scaled)`, async ({ page }) => {
			await open(page, [100 * ratio, 50], 100, "novel");
			const [longest, short] = await measure(page, "novel");
			if (ratio === 1) expect(longest.fillRight, "at its target: the frame's inner edge").toBeCloseTo(longest.frameRight! - 4, 0);
			else expect(longest.fillRight, "past it: the row's end").toBeCloseTo(longest.rowRight, 0);
			// every bar is in true proportion to the longest, up to the cut
			if (ratio <= 3) expect(short.fillW / longest.fillW).toBeCloseTo(0.5 / Math.max(ratio, 1), 2);
		});
	}
});

test.describe("no words, no fill (decision 153)", () => {
	for (const tab of ["novel", "series"] as const) {
		test(`on the ${tab === "novel" ? "novel tab" : "series tab's panel"} an empty chapter has no fill and no sliver, and keeps its rail`, async ({ page }) => {
			await open(page, [200, 0, 100], 250, tab);
			const bars = await measure(page, tab);
			expect(bars.map((b) => b.fillW > 0)).toEqual([true, false, true]); // the empty chapter draws nothing
			expect(bars[1].frameW).toBeGreaterThan(0); // its rail (the planned length) still shows
			expect(await page.locator(tab === "novel" ? ".sf-overview .sf-bar--sliver" : ".sf-novel-ctx-bars .sf-bar--sliver").count()).toBe(0);
		});
	}
	test("with no planned length an empty chapter has no rail and no fill", async ({ page }) => {
		await open(page, [200, 0], null, "novel");
		const bars = await measure(page, "novel");
		expect(bars[1].frameW).toBeNull();
		expect(bars[1].fillW).toBe(0);
	});
	test("an empty novel on the series page has no bar fill", async ({ page }) => {
		await open(page, [10], 100, "novel");
		await page.getByRole("tab", { name: "series" }).click();
		const fills = await page.locator(".sf-overview-row .sf-bar").evaluateAll((bs) => bs.map((b) => ({ empty: b.classList.contains("sf-bar--empty"), fills: b.querySelectorAll(".sf-bar-fill").length })));
		for (const f of fills) expect(f.empty ? f.fills : 1).toBe(f.empty ? 0 : 1);
	});
});
