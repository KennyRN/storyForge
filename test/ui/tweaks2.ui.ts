import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Tweaks 2 (1.12.2): the Codex and Archive tabs, and the selectors. Figures are measured from the page.

async function open(page: Page, tab?: "codex" | "archive" | "series" | "novel"): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	if (!tab) return;
	await flipFace(page);
	await page.getByRole("tab", { name: tab }).click();
	await page.waitForTimeout(300);
}
const squares = (page: Page) => page.evaluate(() => { const r = [...document.querySelectorAll(".sf-rail .sf-tab svg > path")].map((p) => p.getBoundingClientRect()).sort((a, b) => a.top - b.top); const m = r[Math.floor(r.length / 2)]; return { top: m.top, bottom: m.bottom }; });

test.describe("§1.1 and §1.2 the tabs' squares, measured once", () => {
	test("the Codex page and the Archive page start at the squares' top; the storytelling side keeps its 28px", async ({ page }) => {
		await open(page, "codex");
		const sq = await squares(page);
		expect(Math.round((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tabs-top"))).replace("px", "") as unknown as number)).toBe(Math.round(sq.top));
		const top = (label: string) => page.evaluate((l) => { const slot = document.querySelector(`.sf-slot--library[aria-label="${l}"]`)!; const r = slot.getBoundingClientRect(); return r.top + parseFloat(getComputedStyle(slot).paddingTop); }, label);
		expect(Math.abs((await top("Codex entry")) - sq.top)).toBeLessThan(1);
		await page.getByRole("tab", { name: "archive" }).click();
		expect(Math.abs((await top("Archived item")) - sq.top)).toBeLessThan(1);
		await flipFace(page);
		const centre = await page.evaluate(() => document.querySelector(".sf-slot--centre")!.getBoundingClientRect().top);
		expect(centre).toBe(28);
	});
	test("the title's baseline is on the same squares' bottom, after the layout changes", async ({ page }) => {
		await open(page, "novel");
		const base = () => page.evaluate(() => { const t = document.querySelector(".sf-overview-title")!; const p = document.createElement("span"); p.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; (t.querySelector(".sf-select-current-title") ?? t).append(p); const y = p.getBoundingClientRect().bottom; p.remove(); return y; });
		expect(Math.abs((await base()) - (await squares(page)).bottom)).toBeLessThan(0.75);
		await page.setViewportSize({ width: 1500, height: 800 });
		await page.waitForTimeout(300);
		expect(Math.abs((await base()) - (await squares(page)).bottom)).toBeLessThan(0.75);
	});
});

test.describe("§1.3 the special-characters button", () => {
	test("on the Codex tab it sits in the bottom corner of an otherwise empty context panel", async ({ page }) => {
		await open(page, "codex");
		const m = await page.evaluate(() => { const lore = document.querySelector(".sf-slot--lore")!.getBoundingClientRect(); const b = document.querySelector(".sf-chars-button")!.getBoundingClientRect(); return { loreBottom: lore.bottom, bottom: b.bottom, loreTop: lore.top, top: b.top }; });
		expect(m.loreBottom - m.bottom).toBeLessThan(40);
		expect(m.top - m.loreTop).toBeGreaterThan(300);
	});
	test("the Archive tab has no button; the other tabs keep it", async ({ page }) => {
		await open(page, "archive");
		await expect(page.getByRole("button", { name: "Special characters" })).toHaveCount(0);
		for (const tab of ["codex", "series", "novel"] as const) {
			await page.getByRole("tab", { name: tab }).click();
			await expect(page.getByRole("button", { name: "Special characters" })).toBeVisible();
		}
	});
});

test.describe("§1.4 the Archive page, ready-drawn", () => {
	test("with nothing chosen it is the empty card with the banner's strip in place and blank, and nothing in the accessibility tree", async ({ page }) => {
		await open(page, "archive");
		const m = await page.evaluate(() => {
			const slot = document.querySelector('.sf-slot--library[aria-label="Archived item"]')!;
			const s = getComputedStyle(slot, "::before");
			return { children: slot.children.length, text: slot.textContent, content: s.content, bg: s.backgroundImage, radius: s.borderTopLeftRadius, h: slot.getBoundingClientRect().height };
		});
		expect(m.children).toBe(0);
		expect(m.text).toBe("");
		expect(m.content).toBe('""');
		expect(m.bg).toContain("linear-gradient"); // the tint strip
		expect(m.radius).toBe("10px");
		expect(m.h).toBeGreaterThan(300); // the card fills the page
		const strip = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--banner-h"));
		expect(strip.trim()).toBe("30px");
		await page.getByRole("tab", { name: "codex" }).click();
		const codex = await page.evaluate(() => getComputedStyle(document.querySelector('.sf-slot--library[aria-label="Codex entry"]')!, "::before").backgroundImage);
		expect(codex).toBe("none"); // the Codex tab's empty card has no strip
	});
});

test.describe("§1.5 clicking the chosen item again deselects it", () => {
	test("on the Codex tab, by click and by key; unsaved text is kept", async ({ page }) => {
		await open(page, "codex");
		const row = page.locator(".sf-codex-file", { hasText: "NoNewline" }).first();
		await row.click();
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBe("Codex/NoNewline.md");
		const text = page.locator('.sf-slot--library[aria-label="Codex entry"] .cm-content');
		await text.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" KEPT");
		await row.click(); // the chosen entry again
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBeNull();
		await expect.poll(() => page.evaluate(() => window.__preview.read("Codex/NoNewline.md"))).toContain("KEPT");
		await row.click();
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBe("Codex/NoNewline.md");
		await row.focus();
		await page.keyboard.press("Enter"); // by key
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBeNull();
		await row.click();
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBe("Codex/NoNewline.md");
		await row.focus();
		await page.keyboard.press("Space"); // and Space
		await expect.poll(() => page.evaluate(() => (window.__app as any).editors.pathIn("codex"))).toBeNull();
	});
	test("on the Archive tab the same toggle goes back to the ready-drawn page, by click, Return and Space", async ({ page }) => {
		await open(page, "archive");
		const item = page.locator(".sf-archive-open", { hasText: "Retired" });
		const shown = () => page.evaluate(() => (window.__app as any).editors.pathIn("archive"));
		await item.click();
		await expect.poll(shown).toBe("Codex/Retired.md");
		await item.click(); // click
		await expect.poll(shown).toBeNull();
		await item.click();
		await expect.poll(shown).toBe("Codex/Retired.md");
		await item.focus();
		await page.keyboard.press("Enter"); // Return
		await expect.poll(shown).toBeNull();
		await item.click();
		await expect.poll(shown).toBe("Codex/Retired.md");
		await item.focus();
		await page.keyboard.press("Space"); // Space
		await expect.poll(shown).toBeNull();
		const blank = await page.evaluate(() => getComputedStyle(document.querySelector('.sf-slot--library[aria-label="Archived item"]')!, "::before").backgroundImage);
		expect(blank).toContain("linear-gradient");
	});
	test("the filled-in banner is exactly the blank strip's height", async ({ page }) => {
		await open(page, "archive");
		await page.locator(".sf-archive-open", { hasText: "Retired" }).click();
		const banner = page.locator('.sf-slot--library[aria-label="Archived item"] .sf-editor-banner');
		await expect(banner).toBeVisible();
		const strip = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--banner-h")));
		const h = await banner.evaluate((e) => e.getBoundingClientRect().height);
		expect(h).toBe(strip);
	});
	test("the Archive list's novel heading is numbered as everywhere else", async ({ page }) => {
		await open(page, "archive");
		const heading = page.locator(".sf-archive-section h3", { hasText: "Harbour Wakes" });
		await expect(heading).toHaveText("Book 1: The Harbour Wakes");
		expect((await page.locator(".sf-archive-section h3").allTextContents()).join(" ")).not.toContain("#");
	});
});

test.describe("§1.6 box on box, text on text", () => {
	test("the chapter selector's fill is the Codex card's edge, its text and the open list's text are on the entries' text", async ({ page }) => {
		await open(page);
		const m = await page.evaluate(() => {
			const textLeft = (e: Element) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().left; };
			const card = document.querySelector(".sf-left .sf-codex-tree")!.getBoundingClientRect();
			const fill = document.querySelector(".sf-select--chapters .sf-select-current")!.getBoundingClientRect();
			return { cardL: card.left, fillL: fill.left, entry: textLeft(document.querySelector(".sf-left .sf-codex-name")!), title: textLeft(document.querySelector(".sf-select--chapters .sf-select-current-title")!) };
		});
		expect(Math.abs(m.fillL - m.cardL)).toBeLessThan(0.5);
		expect(Math.abs(m.title - m.entry)).toBeLessThan(0.5);
		await page.locator(".sf-select--chapters .sf-select-current").click();
		const row = await page.evaluate(() => { const r = document.querySelector(".sf-select--chapters .sf-select-row.is-active")!; const range = document.createRange(); range.selectNodeContents(r); return range.getBoundingClientRect().left; });
		expect(Math.abs(row - m.entry)).toBeLessThan(0.5);
	});
	test("the novel selector on the series name's row: where it falls (reported, not moved)", async ({ page }) => {
		await open(page);
		const m = await page.evaluate(() => { const textLeft = (e: Element) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().left; }; return { cardL: document.querySelector(".sf-left .sf-codex-tree")!.getBoundingClientRect().left, fillL: document.querySelector(".sf-select--novelname .sf-select-current")!.getBoundingClientRect().left, textL: textLeft(document.querySelector(".sf-select--novelname .sf-select-current-title")!), entry: textLeft(document.querySelector(".sf-left .sf-codex-name")!) }; });
		console.log("NOVEL SELECTOR", JSON.stringify(m));
		expect(m.textL).toBe(16); // unchanged
	});
});

test.describe("§1.7 tell this story", () => {
	test("the label, the tooltip and the name are lowercase", async ({ page }) => {
		await open(page, "series");
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		const b = page.getByRole("button", { name: /^tell this story/ });
		await expect(b).toBeVisible();
		await expect(page.getByRole("button", { name: /Write this novel/i })).toHaveCount(0);
	});
});

test.describe("§1.8 something is always chosen", () => {
	test("the series page chooses its first placed novel, and keeps a choice once made", async ({ page }) => {
		await open(page, "series");
		await expect(page.locator(".sf-novel-ctx-title-text")).toHaveText("Book 1: The Harbour Wakes");
		expect(await page.evaluate(() => (window.__app as any).nav.book)).toBe("aaa");
		await page.locator(".sf-overview-row[data-book='bbb'] .sf-overview-name").click();
		await expect(page.locator(".sf-novel-ctx-title-text")).toContainText("Book 2");
		await page.getByRole("tab", { name: "codex" }).click();
		await page.getByRole("tab", { name: "series" }).click();
		await expect(page.locator(".sf-novel-ctx-title-text")).toContainText("Book 2");
	});
	test("the novel page shows a first placed chapter without changing what is being written; a click still switches it", async ({ page }) => {
		await open(page, "series");
		await page.locator(".sf-overview-row[data-book='bbb'] .sf-overview-name").click();
		await page.getByRole("tab", { name: "novel" }).click();
		await expect(page.locator(".sf-chapter-context .sf-ctx-plot")).toBeVisible();
		await expect(page.locator(".sf-forge-pane .sf-row.is-selected")).toHaveCount(1);
		expect(await page.evaluate(() => { const n = (window.__app as any).nav; return [n.book, n.chapter]; })).toEqual(["aaa", "ch-a1.md"]);
		await page.locator(".sf-forge-pane .sf-row").first().click();
		expect(await page.evaluate(() => (window.__app as any).nav.book)).toBe("bbb");
	});
});

test.describe("the series panel (§1.9 to §1.11)", () => {
	async function wide(page: Page): Promise<void> {
		await page.setViewportSize({ width: 1600, height: 900 });
		await open(page, "series");
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		await page.evaluate(() => (window.__app as any).commitTypedWidth("series", "lore", 40));
		await expect(page.locator(".sf-novel-ctx-head > .sf-ctx-synopsis")).toBeVisible();
		await page.waitForTimeout(400);
	}
	test("§1.9 beside the cover the synopsis's top is 12px below the default PoV text's baseline", async ({ page }) => {
		await wide(page);
		const m = await page.evaluate(() => {
			const v = document.querySelector(".sf-novel-ctx-head > .sf-meta-row .sf-meta-value")!;
			const p = document.createElement("span");
			p.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
			v.append(p);
			const baseline = p.getBoundingClientRect().bottom;
			p.remove();
			return { baseline, syn: document.querySelector(".sf-novel-ctx-head > .sf-ctx-synopsis")!.getBoundingClientRect().top, mode: (document.querySelector(".sf-novel-context") as HTMLElement).dataset.synopsis };
		});
		expect(m.mode).toBe("beside");
		expect(Math.abs(m.syn - (m.baseline + 12))).toBeLessThan(0.75);
	});
	test("§1.10 the control is the storytelling icon at the pencil's size, muted like the tabs at rest, the title's colour on hover, still named 'tell this story'", async ({ page }) => {
		await open(page, "series");
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		const b = page.getByRole("button", { name: /^tell this story/ });
		await expect(b).toBeVisible();
		await expect(page.locator(".sf-novel-ctx-write svg.sf-navicon")).toHaveCount(1);
		const size = await page.locator(".sf-novel-ctx-write svg").evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]);
		expect(size).toEqual([16, 16]);
		const rest = await b.evaluate((e) => getComputedStyle(e).color);
		const tab = await page.locator(".sf-rail .sf-tab:not(.is-active)").first().evaluate((e) => getComputedStyle(e).color);
		expect(rest).toBe(tab);
		await b.hover();
		const title = await page.locator(".sf-novel-ctx-title").evaluate((e) => getComputedStyle(e).color);
		await expect.poll(() => b.evaluate((e) => getComputedStyle(e).color)).toBe(title);
		await page.mouse.move(600, 600);
		await page.locator(".sf-novel-ctx-write").focus();
		await page.keyboard.press("Alt+Shift+Tab");
		await page.keyboard.press("Alt+Tab");
		await expect(b).toBeFocused();
		expect(await b.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none"); // the focus ring shows for the keyboard
	});
	test("§1.11 the gap from the progress bar and strip to the first chapter's rail is 12px", async ({ page }) => {
		await open(page, "series");
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		const g = await page.evaluate(() => document.querySelector(".sf-novel-ctx-bars .sf-bar")!.getBoundingClientRect().top - document.querySelector(".sf-novel-context .sf-structure-strip")!.getBoundingClientRect().bottom);
		expect(g).toBe(12);
	});
});
