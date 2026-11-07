import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { flipFace, openPreview } from "./helpers";

// Brief 14, commit 1: the chapter bars return to the plugin's look (docs/novel-2.md): one colour, 34 px, the name drawn once over the bar
// (dark text with a 4px outer stroke in the data colour), dots for overrun flush with the fill, the marker in the bar's colour, no notch.

async function openNovel(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await expect(overview(page)).toBeVisible();
}
const overview = (page: Page) => page.getByRole("region", { name: "Novel overview" });
/** The planned chapter length is set in the left pane (the workspace no longer shows it: Brief 14 §1.5). */
const chapterLengthRow = (page: Page) => page.locator(".sf-left .sf-meta-row", { hasText: "Chapter Length" });
const setChapterLength = async (page: Page, n: number) => {
	await chapterLengthRow(page).getByRole("button").click();
	await page.keyboard.type(String(n));
	await page.keyboard.press("Enter");
};

/** WCAG contrast of two computed `rgb(...)` colours. */
const contrast = (a: string, b: string): number => {
	const lum = (c: string): number => {
		const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

test.describe("the chapter bars", () => {
	test.beforeEach(async ({ page }) => openNovel(page));

	const bars = (page: Page) => overview(page).locator(".sf-card .sf-bar");
	/** Left and right edges (px) of a bar's parts. */
	const geometry = (bar: ReturnType<typeof bars>) =>
		bar.evaluate((b) => {
			const box = (sel: string) => { const e = b.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, height: r.height }; };
			return { bar: box(":scope"), frame: box(".sf-bar-frame"), fill: box(".sf-bar-fill"), name: box(".sf-bar-name-text"), kind: [...b.classList].find((c) => /^sf-bar--(empty|fill|under|over)$/.test(c)), radius: getComputedStyle(b.querySelector(".sf-bar-fill")!).borderTopLeftRadius, frameRadius: b.querySelector(".sf-bar-frame") ? getComputedStyle(b.querySelector(".sf-bar-frame")!).borderTopLeftRadius : null };
		});

	test("a solid 34 px bar in a 42 px frame, the name drawn once over it; the series overview's bars stay 12 px", async ({ page }) => {
		await expect.poll(() => bars(page).count()).toBeGreaterThan(1);
		for (let i = 0; i < (await bars(page).count()); i++) {
			const g = await geometry(bars(page).nth(i));
			expect(g.fill!.height).toBeCloseTo(34, 0);
			expect(g.frame!.height).toBeCloseTo(42, 0);
			expect(g.fill!.top - g.frame!.top, "the frame is 4px larger on every side").toBeCloseTo(4, 0);
			expect(g.radius).toBe("4px");
			expect(g.frameRadius, "the rail has the bar's own radius (round five; it was the bar's plus 4px)").toBe(g.radius);
			await expect(bars(page).nth(i).locator(".sf-bar-name")).toHaveCount(1);
			await expect(bars(page).nth(i).locator(".sf-bar-name")).toHaveAttribute("aria-hidden", "true");
		}
		await expect(overview(page).locator(".sf-card-head, .sf-card-chevron, .sf-overview-name")).toHaveCount(0);
		await page.getByRole("tab", { name: "series" }).click();
		const plain = page.getByRole("region", { name: "Series overview" }).locator(".sf-bar").first();
		expect((await plain.boundingBox())!.height).toBeCloseTo(12, 0);
		await expect(plain.locator(".sf-bar-name, .sf-bar-frame")).toHaveCount(0);
	});

	test("every frame ends at the same x, and its width follows the longest overrun", async ({ page }) => {
		for (const length of [4, 15, 100000]) {
			await setChapterLength(page, length);
			await expect(bars(page).first()).toBeVisible();
			const all = await bars(page).evaluateAll((bs) => bs.map((b) => { const f = b.querySelector(".sf-bar-frame")!.getBoundingClientRect(); const fill = b.querySelector(".sf-bar-fill")!.getBoundingClientRect(); return { fr: f.right, fw: f.width, fl: f.left, fillW: fill.width, row: b.getBoundingClientRect().width, over: b.classList.contains("sf-bar--over") }; }));
			for (const g of all) expect(g.fr, `chapter length ${length}: one vertical edge`).toBeCloseTo(all[0].fr, 0);
			const longest = Math.max(...all.map((g) => g.fillW / (g.fw - 8)), 1); // the longest chapter's share of its target
			expect(all[0].fw / all[0].row, `chapter length ${length}: frame ÷ row = 1 ÷ the longest share`).toBeCloseTo(1 / longest, 2);
		}
	});

	test("a bar at its target meets the frame's inner edge; past it, it is solid beyond the frame; short of it, grey is left over", async ({ page }) => {
		await setChapterLength(page, 4); // everything in the fixture is far past 4 words
		const over = await geometry(overview(page).locator(".sf-bar--over").first());
		expect(over.fill!.right, "past the target: out through the frame's end").toBeGreaterThanOrEqual(over.frame!.right - 4 - 0.5);
		// far past three times the target (Fix 11, decision 154): the bar runs to the row's end and its end is cut
		await expect(overview(page).locator(".sf-bar--over").first()).toHaveClass(/sf-bar--cut/);
		await expect(overview(page).locator(".sf-bar--over").first().locator(".sf-bar-fill")).not.toHaveCSS("clip-path", "none");
		// past the target but not three times it: a rounded end beyond the frame
		const firstWords = Number(((await bars(page).first().getAttribute("aria-label")) ?? "").match(/: ([\d,]+)/)?.[1]?.replace(/,/g, "") ?? 0);
		await setChapterLength(page, Math.max(1, Math.round(firstWords / 2)));
		const twice = bars(page).first();
		await expect(twice).toHaveClass(/sf-bar--over/);
		await expect(twice).not.toHaveClass(/sf-bar--cut/);
		await expect(twice.locator(".sf-bar-fill")).toHaveCSS("border-top-right-radius", "4px");
		await setChapterLength(page, 100000);
		const under = await geometry(overview(page).locator(".sf-bar--under").first());
		expect(under.fill!.right, "short of the target: the frame's grey is left over").toBeLessThan(under.frame!.right - 4);
		// at the target (Decision 28's rounding): set the chapter length to the first chapter's own count, rounded
		const words = await overview(page).locator(".sf-bar").first().getAttribute("aria-label");
		const n = Number((words ?? "").match(/: ([\d,]+)(?:, (?:over|under|at) its plan)?$/)?.[1]?.replace(/,/g, "") ?? 0);
		expect(n).toBeGreaterThan(0);
		await setChapterLength(page, n);
		await expect(bars(page).first()).toHaveClass(/sf-bar--fill/);
		const at = await geometry(bars(page).first());
		expect(at.fill!.right, "meets the frame's inner edge").toBeCloseTo(at.frame!.right - 4, 0);
	});

	test("with no chapter length there is no frame: a plain fill, 34 px", async ({ page }) => {
		await chapterLengthRow(page).getByRole("button").click();
		await page.keyboard.press("Backspace"); // the field opens with its text selected: an empty one is no length
		await page.keyboard.press("Enter");
		await expect(overview(page).locator(".sf-bar-frame")).toHaveCount(0);
		await expect(bars(page).first()).toHaveClass(/sf-bar--plain/);
		expect((await bars(page).first().boundingBox())!.height).toBeCloseTo(34, 0);
	});

	test("the name: bg_dim at 19px, weight 700, no outline; 4.5:1 on the bar and 3:1 on the frame, by measurement", async ({ page }) => {
		const m = await bars(page).first().evaluate((b) => {
			const t = getComputedStyle(b.querySelector(".sf-bar-name-text")!);
			return { text: t.color, stroke: t.webkitTextStrokeWidth, weight: t.fontWeight, size: t.fontSize, fill: getComputedStyle(b.querySelector(".sf-bar-fill")!).backgroundColor, frame: getComputedStyle(b.querySelector(".sf-bar-frame")!).backgroundColor, ws: t.whiteSpace, to: t.textOverflow, ov: t.overflow };
		});
		expect(contrast(m.text, m.fill), "name on the bar").toBeGreaterThanOrEqual(4.5);
		// Fix 11: the rail is now bg2 (decision 155), so bg_dim over it is about 1.6:1 until the names are settled at the stop (Fix 11 §2), when this becomes their assertion
		expect(contrast(m.text, m.frame), "name on the default rail (pending the names)").toBeCloseTo(1.57, 1);
		expect(m).toMatchObject({ weight: "700", size: "19px", ws: "nowrap", to: "ellipsis", ov: "hidden" });
		expect(["0px", ""]).toContain(m.stroke); // no outline
	});

	test("the name is cut short at the further of the frame's inner end and the bar's end, less the padding; never on the bare page", async ({ page }) => {
		for (const length of [4, 100000]) {
			await setChapterLength(page, length);
			await expect(bars(page).first()).toBeVisible();
			const all = await bars(page).evaluateAll((bs) => bs.map((b) => { const f = b.querySelector(".sf-bar-frame")!.getBoundingClientRect(); const fill = b.querySelector(".sf-bar-fill")!.getBoundingClientRect(); const n = b.querySelector(".sf-bar-name")!.getBoundingClientRect(); return { limit: Math.max(f.right - 4, fill.right) - 8, nameRight: n.right, nameLeft: n.left, fillLeft: fill.left }; }));
			for (const g of all) {
				expect(g.nameRight, `chapter length ${length}: ends no further than the further end, less 8px`).toBeLessThanOrEqual(g.limit + 0.5);
				expect(g.nameLeft - g.fillLeft, "8px in from the bar's start").toBeCloseTo(8, 0);
			}
		}
	});

	test("nothing draws dots, a marker, a clearance layer or a text stroke on the bars", async ({ page }) => {
		await setChapterLength(page, 4);
		await expect(overview(page).locator(".sf-bar-dots, .sf-bar-marker, .sf-bar-name--clear")).toHaveCount(0);
		await setChapterLength(page, 100000);
		await expect(overview(page).locator(".sf-bar-dots, .sf-bar-marker, .sf-bar-name--clear")).toHaveCount(0);
	});

	test("the tooltip has the full name", async ({ page }) => {
		await bars(page).nth(1).hover();
		await expect(page.getByRole("tooltip")).toContainText("The Storm: Part Two");
	});
});

// The ghost chapter dividers (docs/novel-2.md): drawn only where adjacent ones would be at least 4px apart at the bar's width now, none below that.
test.describe("the ghost chapter dividers", () => {
	test.beforeEach(async ({ page }) => openNovel(page));
	const ghosts = (page: Page) => overview(page).locator(".sf-progress-ghost");

	test("a Chapter Length of 1 with a Novel Length of 80,000 renders promptly with no dividers", async ({ page }) => {
		const t0 = Date.now();
		await setChapterLength(page, 1);
		await expect(overview(page).locator(".sf-card .sf-bar").first()).toBeVisible();
		// the window is still alive and the overview drew: a bounded time, where it used to build about 80,000 dividers and stop responding
		await expect.poll(() => page.evaluate(() => document.querySelectorAll(".sf-card").length), { timeout: 5000 }).toBeGreaterThan(0);
		expect(Date.now() - t0, "prompt").toBeLessThan(8000);
		await expect(ghosts(page)).toHaveCount(0);
		await chapterLengthRow(page).getByRole("button").click(); // and the field opens again (it hung here before)
		await expect(chapterLengthRow(page).getByRole("textbox", { name: "Chapter Length" })).toBeVisible();
	});

	test("dividers appear once the spacing allows, and follow the bar's width", async ({ page }) => {
		await setChapterLength(page, 2500); // 31 dividers, about 15px apart
		await expect(ghosts(page)).toHaveCount(31);
		const gap = await ghosts(page).evaluateAll((all) => { const xs = all.map((g) => g.getBoundingClientRect().left); return Math.min(...xs.slice(1).map((x, i) => x - xs[i])); });
		expect(gap).toBeGreaterThanOrEqual(4);
		await setChapterLength(page, 400); // 199 dividers, 0.5% apart: under 4px at the bar's width here, over it on a wide enough window
		const width = await overview(page).locator(".sf-progress").evaluate((e) => e.getBoundingClientRect().width);
		expect(width * 0.005, "this window is narrower than the 4px spacing needs").toBeLessThan(4);
		await expect(ghosts(page)).toHaveCount(0);
		const size = page.viewportSize()!;
		await page.setViewportSize({ width: Math.ceil(size.width * 2.4), height: size.height }); // the bar is now about 4px per divider wide
		await expect(ghosts(page)).not.toHaveCount(0);
		const wide = await ghosts(page).evaluateAll((all) => { const xs = all.map((g) => g.getBoundingClientRect().left); return Math.min(...xs.slice(1).map((x, i) => x - xs[i])); });
		expect(wide).toBeGreaterThanOrEqual(3.9);
		await page.setViewportSize(size); // and back: none again
		await expect(ghosts(page)).toHaveCount(0);
	});
});

// Brief 14, commit 2 (§1.2, §1.3, §1.5): the cards are bars only, placed chapters only, and the header holds no lengths or PoV.
test.describe("the novel overview's cards and header", () => {
	test.beforeEach(async ({ page }) => openNovel(page));

	test("each chapter card is just its bar: no chevron, no size control, no details, no plot note", async ({ page }) => {
		const cards = overview(page).locator(".sf-card");
		await expect.poll(() => cards.count()).toBeGreaterThan(1);
		for (let i = 0; i < (await cards.count()); i++) {
			await expect(cards.nth(i).locator("> *")).toHaveCount(1);
			await expect(cards.nth(i).locator("> .sf-bar")).toHaveCount(1);
		}
		await expect(overview(page).locator(".sf-card-chevron, .sf-size-control, .sf-size-option, .sf-note-field[data-plot], .sf-ref-row, .sf-card-rows")).toHaveCount(0);
		await expect(overview(page).getByRole("button", { name: /Show (all details|bar only|plot note only)/ })).toHaveCount(0);
	});

	test("the word-count tooltip stays", async ({ page }) => {
		await overview(page).locator(".sf-card .sf-bar").first().hover();
		await expect(page.getByRole("tooltip")).toContainText(/\d/);
	});

	test("only placed chapters are shown; the unplaced ones stay in the left pane's list", async ({ page }) => {
		const placed = await page.locator(".sf-left [aria-label='Placed chapters'] > *").count();
		await expect(overview(page).locator(".sf-card")).toHaveCount(placed);
		await expect(overview(page).getByText("Unplaced")).toHaveCount(0);
		await expect(overview(page).getByText("Unplaced idea")).toHaveCount(0);
		await expect(page.locator(".sf-left").getByText("Unplaced idea")).toBeVisible();
	});

	test("the workspace shows no default PoV, novel length or chapter length; the left pane still does", async ({ page }) => {
		for (const label of ["Default PoV", "Novel Length", "Chapter Length"]) {
			await expect(overview(page).getByText(label)).toHaveCount(0);
			await expect(page.locator(".sf-left .sf-meta-row", { hasText: label })).toBeVisible();
		}
		await expect(overview(page).locator(".sf-overview-meta, .sf-meta-row")).toHaveCount(0);
	});
});

const tree = (dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> => {
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) tree(full, base, out);
		else out[path.relative(base, full)] = readFileSync(full).toString("base64");
	}
	return out;
};

test("opening and browsing the novel tab leaves the project folder byte-identical", async ({ page }) => {
	const { root } = await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	const before = tree(root);
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await expect(overview(page)).toBeVisible();
	await overview(page).locator(".sf-card .sf-bar").first().hover();
	await page.getByRole("tab", { name: "series" }).click();
	await page.getByRole("tab", { name: "novel" }).click();
	await expect(overview(page)).toBeVisible();
	expect(tree(root)).toEqual(before);
});

