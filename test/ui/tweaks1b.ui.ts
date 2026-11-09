import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { BAND, flipFace, openPreview } from "./helpers";

// Tweaks 1, part 2 (Kenny's look): the resting grid, where Codex entries open, the shared label gap, the joined progress bar and strip, the series page and the
// storytelling side's novel selector. Figures are measured from the page.

const BOOK_A = "_story-library/novel-aaa.md";
const LONG = "A long synthetic synopsis sentence that fills several lines of a narrow box. ".repeat(40);

async function open(page: Page, where: "storytelling" | "novel" | "series" = "storytelling", options: { synopsis?: string; width?: number } = {}): Promise<string> {
	if (options.width) await page.setViewportSize({ width: options.width, height: 900 });
	const { root } = await openPreview(page);
	if (options.synopsis) {
		const f = path.join(root, BOOK_A);
		writeFileSync(f, `${readFileSync(f, "utf8").trimEnd()}\n\n## Synopsis\n\n${options.synopsis}\n`);
	}
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	if (where === "storytelling") return root;
	await flipFace(page);
	await page.getByRole("tab", { name: where }).click();
	await expect(page.locator(".sf-overview-title")).toBeVisible();
	return root;
}
const box = async (loc: Locator) => (await loc.boundingBox())!;
const panel = (page: Page) => page.locator(".sf-novel-context");
const pickChapter = async (page: Page) => {
	await page.locator('.sf-card[data-chapter="ch-a1.md"] .sf-bar').click();
	await expect(page.locator(".sf-chapter-context .sf-ctx-plot")).toBeVisible();
};

test.describe("§1 the resting grid", () => {
	test("scrolling the central pane moves nothing in the context panel, and the figure is the pane's at rest", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 420 });
		await open(page, "novel");
		await pickChapter(page);
		const read = () => page.evaluate(() => ({ plot: document.querySelector(".sf-ctx-plot")!.getBoundingClientRect().top, synopsis: document.querySelector(".sf-overview-head .sf-section-field")!.getBoundingClientRect().top, scrolled: document.querySelector(".sf-overview")!.scrollTop }));
		await page.waitForTimeout(300);
		const before = await read();
		expect(Math.abs(before.plot - before.synopsis)).toBeLessThan(1);
		await page.locator(".sf-overview").evaluate((e) => (e.scrollTop = 60));
		await page.waitForTimeout(500);
		const after = await read();
		expect(after.scrolled).toBeGreaterThan(0); // the central pane did scroll, so its synopsis moved up
		expect(after.synopsis).toBeLessThan(before.synopsis);
		expect(after.plot).toBe(before.plot); // and the panel stayed on the resting grid
	});
});

test.describe("§2 Codex entries open only where the Codex index is on screen", () => {
	test("a PoV name opens nothing on the novel page", async ({ page }) => {
		await open(page, "novel");
		await pickChapter(page);
		await page.locator('[data-row="pov"] .sf-meta-value').click();
		await page.keyboard.press("Escape");
		expect(await page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBeFalsy();
		expect(await page.evaluate(() => (window.__app as any).editors.pathIn("lore"))).toBeFalsy();
	});
});

test.describe("§3 the novel page", () => {
	test("§3.3 one gap between a label and its value, in every label-and-value row", async ({ page }) => {
		await open(page, "novel");
		await pickChapter(page);
		const gap = (row: Locator) =>
			row.evaluate((r) => {
				const label = r.querySelector(".sf-meta-label")!.getBoundingClientRect();
				const value = r.querySelector(".sf-meta-value")!;
				const range = document.createRange();
				range.selectNodeContents(value);
				const text = range.getBoundingClientRect();
				return Math.round((text.left - label.right) * 10) / 10;
			});
		const want = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--label-gap")));
		expect(want).toBe(8);
		const rows = [page.locator('.sf-chapter-context [data-row="pov"]'), page.locator('.sf-chapter-context [data-row="location"]'), page.locator(".sf-left .sf-meta-row", { hasText: "Default PoV" }), page.locator(".sf-left .sf-meta-row", { hasText: "Novel Length" }), page.locator(".sf-left .sf-meta-row", { hasText: "Chapter Length" })];
		for (const r of rows) expect(await gap(r)).toBe(want);
	});

	test("§3.4 the progress bar and the structure strip are one shape: no gap, square where they meet, rounded outside", async ({ page }) => {
		await open(page, "novel");
		const m = await page.evaluate(() => {
			const bar = document.querySelector(".sf-overview .sf-progress")!;
			const strip = document.querySelector(".sf-overview .sf-structure-strip")!;
			const b = bar.getBoundingClientRect();
			const s = strip.getBoundingClientRect();
			const cb = getComputedStyle(bar);
			const cs = getComputedStyle(strip);
			return { gap: s.top - b.bottom, stripH: s.height, radius: cb.borderTopLeftRadius, barBottom: [cb.borderBottomLeftRadius, cb.borderBottomRightRadius], stripTop: [cs.borderTopLeftRadius, cs.borderTopRightRadius], stripBottom: [cs.borderBottomLeftRadius, cs.borderBottomRightRadius], barTopR: cb.borderTopRightRadius };
		});
		expect(m.gap).toBe(0);
		expect(m.radius).toBe("4px");
		expect(m.barTopR).toBe("4px");
		expect(m.barBottom).toEqual(["0px", "0px"]);
		expect(m.stripTop).toEqual(["0px", "0px"]);
		expect(m.stripBottom).toEqual(["4px", "4px"]);
		expect(m.stripH).toBeGreaterThanOrEqual(4); // at least the radius, and at least 4px
	});

	test("§3.5 the + boxes rest in the unselected tabs' muted colour; §3.6 the chapter rails are 8px apart", async ({ page }) => {
		await open(page, "novel");
		const colours = await page.evaluate(() => {
			const add = document.querySelector(".sf-unplaced-zone .sf-zone-add")!;
			const tab = document.querySelector(".sf-rail .sf-tab:not(.is-active)")!;
			return [getComputedStyle(add).color, getComputedStyle(tab).color];
		});
		expect(colours[0]).toBe(colours[1]);
		const gaps = await page.evaluate(() => {
			const cards = [...document.querySelectorAll(".sf-overview .sf-cards .sf-card")].map((c) => c.getBoundingClientRect());
			return cards.slice(1).map((c, i) => Math.round(c.top - cards[i].bottom));
		});
		expect(gaps.length).toBeGreaterThan(0);
		expect(gaps.every((g) => g === 8)).toBe(true);
	});
});

test.describe("§4 the series page", () => {
	test("§4.1 and §4.3 (ruling) the cover is level with the series description, the novel title is on the tabs' line, and the default PoV is beside the cover, the synopsis 12px under it", async ({ page }) => {
		await open(page, "series", { width: 1600 });
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		await page.evaluate(() => (window.__app as any).commitTypedWidth("series", "lore", 40));
		const cover = page.locator(".sf-novel-ctx-head > .sf-cover");
		await expect(cover).toBeVisible();
		await expect.poll(async () => Math.abs((await box(cover)).y - (await box(page.locator(".sf-overview-head .sf-section-field"))).y)).toBeLessThan(1);
		// the ruling: the novel title is on the tabs' line, the same as the central pane's series title; nothing rises above the 48px line
		const base = (loc: Locator) => loc.evaluate((t) => { const p = document.createElement("span"); p.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; t.append(p); const y = p.getBoundingClientRect().bottom; p.remove(); return y; });
		const titleBase = await base(page.locator(".sf-novel-ctx-title-text"));
		const centralBase = await base(page.locator(".sf-overview-title"));
		expect(Math.abs(titleBase - centralBase)).toBeLessThan(1);
		const title = await box(page.locator(".sf-novel-ctx-title-text"));
		expect(title.y).toBeGreaterThanOrEqual(20 + BAND);
		expect(await panel(page).getAttribute("data-align-short-by")).toBe("0"); // the cover is not short of its line
		const c = await box(cover);
		const pov = await box(page.locator(".sf-novel-ctx-head > .sf-meta-row"));
		expect(pov.x).toBeGreaterThanOrEqual(c.x + c.width); // the default PoV is beside the cover, to its right
		expect(Math.abs(pov.y - c.y)).toBeLessThan(6); // level with the cover's top (the button's own padding aside)
		const syn = await box(page.locator(".sf-novel-ctx-head > .sf-ctx-synopsis"));
		expect(syn.y).toBeGreaterThan(pov.y); // the synopsis, beside the cover, under the PoV (its exact place, 12px below the text's baseline, is in tweaks2.ui.ts)
		expect(c.y).toBeGreaterThan(title.y + title.height);
	});

	test("§4.2 the synopsis is beside the cover when the panel is wide, and under it, level with the first novel's cover, when it is narrow", async ({ page }) => {
		await open(page, "series", { width: 1600 });
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		const syn = page.locator(".sf-novel-ctx-head > .sf-ctx-synopsis");
		await expect(syn).toBeVisible();
		const cover = page.locator(".sf-novel-ctx-head > .sf-cover");
		await page.evaluate(() => (window.__app as any).commitTypedWidth("series", "lore", 40)); // wide enough for cover and synopsis side by side
		await expect.poll(async () => (await box(syn)).x).toBeGreaterThan((await box(cover)).x + (await box(cover)).width);
		expect((await box(syn)).y).toBeGreaterThan((await box(cover)).y); // beside the cover, under the default PoV
		// narrow: the panel's minimum
		await page.evaluate(() => (window.__app as any).commitTypedWidth("series", "lore", 22));
		await expect.poll(async () => (await box(syn)).y).toBeGreaterThan((await box(cover)).y + 100);
		const pov = await box(page.locator(".sf-novel-ctx-head > .sf-meta-row"));
		const valueRight = await page.locator(".sf-novel-ctx-head > .sf-meta-row").evaluate((r) => r.scrollWidth <= r.clientWidth + 1);
		expect(pov.x).toBeGreaterThanOrEqual((await box(cover)).x + (await box(cover)).width); // the PoV stays beside the cover
		expect(valueRight).toBe(true); // and fits there at the minimum width
		console.log("min width: pov box", JSON.stringify(pov), "cover", JSON.stringify(await box(cover)));
		const first = await box(page.locator(".sf-overview .sf-overview-row .sf-cover").first());
		const c = await box(cover);
		const s = await box(syn);
		expect(s.y).toBeGreaterThanOrEqual(c.y + c.height + 12 - 1); // never overlapping the cover
		expect(Math.abs(s.y - Math.max(first.y, c.y + c.height + 12))).toBeLessThan(1.5);
	});

	test("§4.4 the context panel's chapter bars: 8px bars in 12px rails 2px in, the rails 4px apart", async ({ page }) => {
		await open(page, "series");
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		const m = await page.evaluate(() => {
			const bars = [...document.querySelectorAll(".sf-novel-ctx-bars .sf-bar")];
			const first = bars[0];
			const frame = first.querySelector(".sf-bar-frame")?.getBoundingClientRect();
			const fill = first.querySelector(".sf-bar-fill")?.getBoundingClientRect();
			const rects = bars.map((b) => b.getBoundingClientRect());
			return { frameH: frame?.height ?? null, fillH: fill?.height ?? null, inset: frame && fill ? [fill.top - frame.top, fill.left - frame.left] : null, gaps: rects.slice(1).map((r, i) => Math.round(r.top - rects[i].bottom)) };
		});
		expect(m.frameH).toBe(12);
		expect(m.fillH).toBe(8);
		expect(m.inset).toEqual([2, 2]);
		expect(m.gaps.every((g) => g === 4)).toBe(true);
	});

	test("§4.5 the novel's bar ends 8px before the highlight, and the synopsis box under it is the bar's width, 6px below, down to the cover's bottom; it scrolls by keyboard", async ({ page }) => {
		await open(page, "series", { synopsis: LONG });
		const row = page.locator(".sf-overview-row[data-book='aaa']");
		await row.locator(".sf-overview-name").click(); // chosen: the highlight shows
		const name = await box(row.locator(".sf-overview-name"));
		const bar = await box(row.locator(".sf-bar"));
		const syn = row.locator(".sf-synopsis-box");
		const s = await box(syn);
		const cover = await box(row.locator(".sf-cover"));
		expect(Math.round(name.x + name.width - (bar.x + bar.width))).toBe(8);
		expect(Math.round(bar.x - (name.x + 8))).toBe(0); // the gap at the start is the highlight's own 8px
		expect(Math.abs(s.width - bar.width)).toBeLessThan(1);
		expect(Math.round(s.y - (bar.y + bar.height))).toBe(6);
		expect(Math.abs(s.y + s.height - (cover.y + cover.height))).toBeLessThan(1);
		await expect(syn).toHaveAttribute("aria-label", /^Synopsis of /);
		const overflow = await syn.evaluate((e) => e.scrollHeight > e.clientHeight);
		expect(overflow).toBe(true); // a fixed size: a longer synopsis scrolls inside it
		await syn.focus();
		await page.keyboard.press("PageDown");
		await expect.poll(() => syn.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
		expect(await box(syn)).toEqual(s); // the box itself did not grow or move
		expect(await syn.evaluate((e) => getComputedStyle(e).overflowY)).toBe("auto");
		expect(await syn.evaluate((e) => getComputedStyle(e).overscrollBehaviorY)).toBe("auto"); // at its end the page scrolls on
		expect(await page.locator(".sf-synopsis-box .cm-content").first().getAttribute("contenteditable")).toBe("false"); // read-only
	});

	test("§4.6 and §4.7 the default PoV uses the shared gap, and the progress bar and strip are the novel page's joined shape", async ({ page }) => {
		await open(page, "series");
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		const m = await page.evaluate(() => {
			const row = document.querySelector(".sf-novel-context .sf-meta-row")!;
			const label = row.querySelector(".sf-meta-label")!.getBoundingClientRect();
			const range = document.createRange();
			range.selectNodeContents(row.querySelector(".sf-meta-value")!);
			const bar = document.querySelector(".sf-novel-context .sf-progress")!;
			const strip = document.querySelector(".sf-novel-context .sf-structure-strip")!;
			return { gap: Math.round((range.getBoundingClientRect().left - label.right) * 10) / 10, join: strip.getBoundingClientRect().top - bar.getBoundingClientRect().bottom, radius: getComputedStyle(bar).borderTopLeftRadius, barH: bar.getBoundingClientRect().height, stripH: strip.getBoundingClientRect().height };
		});
		expect(m.gap).toBe(8);
		expect(m.join).toBe(0);
		expect(m.radius).toBe("4px");
		expect(m.barH).toBe(20);
		expect(m.stripH).toBe(4);
	});
});

test.describe("the default PoV beside the cover at the panel's minimum width (§4.3 ruling)", () => {
	test("at the minimum width (280px) the PoV still sits beside the cover and fits", async ({ page }) => {
		await open(page, "series", { width: 1280 });
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		await page.evaluate(() => (window.__app as any).commitTypedWidth("series", "lore", 1)); // clamped to the minimum
		const row = page.locator(".sf-novel-ctx-head > .sf-meta-row");
		await expect(row).toBeVisible();
		const m = await page.evaluate(() => { const p = document.querySelector(".sf-novel-context")!.getBoundingClientRect(); const r = document.querySelector(".sf-novel-ctx-head > .sf-meta-row")!; const c = document.querySelector(".sf-novel-ctx-head > .sf-cover")!.getBoundingClientRect(); const b = r.getBoundingClientRect(); return { panel: Math.round(p.width), povLeft: b.left, coverRight: c.right, fits: r.scrollWidth <= r.clientWidth + 1, lines: Math.round(b.height) }; });
		console.log("min width:", JSON.stringify(m));
		expect(m.povLeft).toBeGreaterThanOrEqual(m.coverRight);
		expect(m.fits).toBe(true);
	});
});

test.describe("unplaced novels on the series page", () => {
	test("an unplaced novel's synopsis is as before: edited in the context panel, with no box in the central list", async ({ page }) => {
		await open(page, "series");
		const row = page.locator(".sf-overview-row--unplaced").first();
		await expect(row.locator(".sf-synopsis-box")).toHaveCount(0);
		await row.locator(".sf-overview-name").click();
		await expect(panel(page).getByRole("textbox", { name: /^Synopsis of / })).toBeVisible();
	});
});

test.describe("§6 the storytelling side", () => {
	test("§6.1 the novel name is a selector listing the placed novels only; the series name still opens the series tab", async ({ page }) => {
		await open(page);
		const sel = page.locator(".sf-select--novelname .sf-select-current");
		await sel.click();
		const rows = page.locator(".sf-select--novelname .sf-select-row");
		await expect(rows).toHaveCount(2);
		await expect(page.locator(".sf-select--novelname .sf-select-list")).not.toContainText("Spare Draft");
		await expect(rows.nth(0)).toHaveClass(/is-active/);
		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Open the series on the library side" }).click();
		await expect(page.getByRole("tab", { name: "series", selected: true })).toBeVisible();
	});

	test("§6.1 choosing a novel switches the novel being written: unsaved text is saved first, the right chapter opens, the side stays", async ({ page }) => {
		await open(page);
		await page.locator(".cm-content").first().click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" SWITCHTEXT");
		await page.locator(".sf-select--novelname .sf-select-current").click();
		await page.locator(".sf-select--novelname .sf-select-row", { hasText: "Book 2" }).click();
		await expect.poll(() => page.evaluate(() => (window.__app as any).nav.book)).toBe("bbb");
		await expect.poll(() => page.evaluate(() => (window.__app as any).nav.chapter)).toBe("ch-b1.md"); // its first placed chapter (none remembered)
		await expect.poll(() => page.evaluate(() => window.__preview.read("_story-library/aaa/ch-a1.md"))).toContain("SWITCHTEXT"); // nothing lost
		expect(await page.evaluate(() => (window.__app as any).nav.face)).toBe("storytelling");
		// back: the novel's last open chapter opens
		await page.locator(".sf-select--novelname .sf-select-current").click();
		await page.locator(".sf-select--novelname .sf-select-row", { hasText: "Book 1" }).click();
		await expect.poll(() => page.evaluate(() => (window.__app as any).nav.chapter)).toBe("ch-a1.md");
	});

	test("§6.1 the novel name's text keeps its place and the fill grows round it", async ({ page }) => {
		await open(page);
		const t = await box(page.locator(".sf-select--novelname .sf-select-current-title"));
		const f = await box(page.locator(".sf-select--novelname .sf-select-current"));
		const s = await box(page.locator(".sf-nav-series"));
		expect(Math.round(t.x)).toBe(16);
		expect(f.x).toBeLessThan(t.x);
		expect(f.y).toBeLessThan(t.y);
		expect(f.y).toBeGreaterThanOrEqual(s.y + s.height - 0.5); // the fill clears the series name
		expect(Math.round(t.y * 10) / 10).toBe(Math.round((40.8 + BAND) * 10) / 10); // and the text did not move
	});

	test("§6.1 a standalone project shows no selector; its name is a plain label", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nstory-kind: standalone\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(page.locator(".sf-select--novelname")).toHaveCount(0);
		await expect(page.locator(".sf-nav-novel")).toBeVisible();
		await expect(page.locator("button.sf-nav-novel")).toHaveCount(0);
	});

	test("§6.2 / Tweaks 2 §1.6 the chapter selector's fill is the Codex card's edge and its text is on the entries' text, from one strip width", async ({ page }) => {
		await open(page);
		const card = await box(page.locator(".sf-left[data-face='storytelling'] .sf-codex-tree"));
		const text = await box(page.locator(".sf-select--chapters .sf-select-current-title"));
		const fill = await box(page.locator(".sf-select--chapters .sf-select-current"));
		const strip = await box(page.locator(".sf-left[data-face='storytelling'] .sf-codex-strip"));
		const panel = await box(page.locator(".sf-left"));
		const entry = await page.locator(".sf-left .sf-codex-name").first().evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().left; });
		expect(Math.abs(text.x - entry)).toBeLessThan(0.5); // text on text
		expect(Math.abs(fill.x - card.x)).toBeLessThan(0.5); // box on box
		expect(fill.x).toBeGreaterThanOrEqual(panel.x);
		expect(Math.round(strip.width)).toBe(38);
		expect(Math.round(card.x - (strip.x + strip.width))).toBe(8); // decision 93's 8px is the card's distance from the strip; from the panel's edge it is 46
		// a different strip width moves the card and the selector together
		await page.addStyleTag({ content: ":root { --codex-strip-w: 50px; }" });
		const card2 = await box(page.locator(".sf-left[data-face='storytelling'] .sf-codex-tree"));
		const text2 = await box(page.locator(".sf-select--chapters .sf-select-current-title"));
		expect(Math.abs(text2.x - card2.x - 14)).toBeLessThan(0.5);
		expect(card2.x).toBeGreaterThan(card.x + 10);
	});
});
