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

// Kenny's test vault's shape: a 25-word chapter target against chapters of 10 to 756 words, one empty (decisions 153 and 154); and an ordinary shape.
const VAULT_SHAPE = { words: [42, 756, 220, 10, 0, 1], target: 25 };
const ORDINARY_SHAPE = { words: [2100, 2450, 2600, 1800, 0, 3], target: 2500 }; // the last: a few words, a fraction of a pixel by scale

/** What must hold of every chapter bar at one width. */
async function expectDrawn(page: Page, tab: "novel" | "series", words: number[], target: number): Promise<void> {
	const bars = await measure(page, tab);
	expect(bars.length).toBe(words.length);
	const ratios = words.map((w) => w / target);
	for (const [i, b] of bars.entries()) {
		const label = `chapter ${i + 1} (${words[i]} words), row ${Math.round(b.rowW)}px`;
		expect(b.frameW, `${label}: a frame at least a third of the row`).toBeGreaterThanOrEqual(b.rowW / 3 - 1);
		expect(b.frameRight! - b.rowLeft, `${label}: the frame fits the row`).toBeLessThanOrEqual(b.rowW + 0.5);
		if (words[i] === 0) {
			expect(b.fillW, `${label}: no fill`).toBe(0);
			continue;
		}
		expect(b.fillW, `${label}: a fill at least 3px wide`).toBeGreaterThanOrEqual(3 - 0.01);
		expect(b.fillH, `${label}: a fill with height`).toBeGreaterThan(0);
		expect(b.fillRight! - b.rowLeft, `${label}: the fill fits the row`).toBeLessThanOrEqual(b.rowW + 0.5);
	}
	const li = ratios.indexOf(Math.max(...ratios));
	if (ratios[li] > 1) expect(bars[li].fillRight, "the longest bar ends at the row's end (or at the cut end)").toBeCloseTo(bars[li].rowRight, 0);
}

test.describe("realistic numbers at every width (decisions 153 and 154)", () => {
	for (const [name, shape] of [["a 25-word target against chapters of 10 to 756 words", VAULT_SHAPE], ["an ordinary shape", ORDINARY_SHAPE]] as const) {
		test(`the context panel, from its minimum width to its default, with ${name}`, async ({ page }) => {
			await page.setViewportSize({ width: 1280, height: 700 });
			await open(page, shape.words, shape.target, "series");
			const widths = await page.evaluate(() => [22, 23, 24, 25, 26, 28, 30, 33, 36, 40].map((p) => p));
			for (const pc of widths) {
				await page.evaluate((p) => (window.__app as any).commitTypedWidth("series", "lore", p), pc);
				await expect.poll(() => page.locator(".sf-novel-ctx-bars").evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBeGreaterThan(150);
				await expectDrawn(page, "series", shape.words, shape.target);
			}
		});
		test(`the novel tab with ${name}`, async ({ page }) => {
			await open(page, shape.words, shape.target, "novel");
			await expectDrawn(page, "novel", shape.words, shape.target);
		});
	}
	test("the novel progress bar's whole fill is at least 3px when the novel has words; its segments stay true to scale", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 700 });
		await open(page, VAULT_SHAPE.words, VAULT_SHAPE.target, "series"); // 1,029 words against a planned 80,000: about 1.3% of the bar
		const m = await page.locator(".sf-novel-context .sf-progress").evaluate((t) => {
			const w = t.getBoundingClientRect().width;
			const floor = t.querySelector(".sf-progress-floor")!.getBoundingClientRect().width;
			const segs = [...t.querySelectorAll(".sf-progress-seg")].map((s) => s.getBoundingClientRect().width);
			return { w, floor, segs, segSum: segs.reduce((a, b) => a + b, 0) };
		});
		expect(m.floor).toBeGreaterThanOrEqual(3 - 0.01);
		expect(m.segSum / m.w, "the segments are 1,029 of 80,000, not stretched to 3px").toBeCloseTo(1029 / 80000, 3);
	});
});
