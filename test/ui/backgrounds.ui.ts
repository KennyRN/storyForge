import { expect, test, type Locator, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 14, commit 5 (§1.8): the library side is for looking, so all of it is bg_dim (the left panel, the workspace, the context panel); only the
// places where you work are cards on bg0 (10px corners, no border): the novel's synopsis, the series description, the context panel's plot note and
// the chapter's text, the Novel tab's placed and unplaced lists (each its own card, as the Codex list is), and a Codex entry or an archived item opened
// in the library side's workspace. The storytelling side is unchanged: the chapter editor stays on bg0.

async function open(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const probe = (page: Page, v: string) => page.evaluate((x) => { const d = document.createElement("i"); d.style.backgroundColor = x; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }, v);
const style = (l: Locator, props: string[]) => l.evaluate((e, p) => { const s = getComputedStyle(e); return p.map((k) => s.getPropertyValue(k)); }, props);
const BG0 = "var(--purpose-editor-bg)";
const DIM = "var(--purpose-panel-bg)";
const card = async (page: Page, l: Locator, what: string) => {
	expect(await style(l, ["background-color", "border-top-left-radius", "border-top-width"]), what).toEqual([await probe(page, BG0), "10px", "0px"]);
};
const dim = async (page: Page, l: Locator, what: string) => expect((await style(l, ["background-color"]))[0], what).toBe(await probe(page, DIM));
const novelTab = async (page: Page) => { await flipFace(page); await page.getByRole("tab", { name: "novel" }).click(); await expect(page.getByRole("region", { name: "Novel overview" })).toBeVisible(); };

test.describe("the library side's backgrounds", () => {
	test.beforeEach(async ({ page }) => open(page));

	test("the novel tab: the left panel, the workspace and the context panel are bg_dim; the synopsis, the plot note, the chapter's text and the placed list is a card on bg0 (the unplaced list is not)", async ({ page }) => {
		await novelTab(page);
		await dim(page, page.locator(".sf-left"), "the left panel");
		await dim(page, page.getByRole("region", { name: "Novel overview" }), "the workspace");
		await dim(page, page.locator(".sf-slot--lore"), "the context panel");
		await dim(page, page.locator(".sf-centre-wrap"), "the strip under the title band");
		await card(page, page.getByRole("region", { name: "Novel overview" }).locator(".sf-note-field").first(), "the synopsis");
		await card(page, page.locator(".sf-ctx-plot"), "the plot note");
		await card(page, page.locator(".sf-ctx-text"), "the chapter's text");
		await card(page, page.locator("[aria-label='Placed chapters']"), "the placed list");
		// round five: Unplaced is no longer on a working card; it sits on bg_dim (amending Brief 14 §1.8)
		expect((await style(page.locator("[aria-label='Unplaced chapters']"), ["background-color"]))[0], "the unplaced list").toBe("rgba(0, 0, 0, 0)");
		// the overview's other parts sit on bg_dim, with no card of their own: the title, the cover's row, the bars' cards
		for (const q of [".sf-overview-title", ".sf-card", ".sf-cards"]) expect((await style(page.getByRole("region", { name: "Novel overview" }).locator(q).first(), ["background-color"]))[0], q).toBe("rgba(0, 0, 0, 0)");
	});

	test("the series tab: the workspace is bg_dim, the series description and each novel's synopsis are cards, and the series pane's lists are not", async ({ page }) => {
		await flipFace(page);
		await page.getByRole("tab", { name: "series" }).click();
		const o = page.getByRole("region", { name: "Series overview" });
		await dim(page, o, "the workspace");
		await dim(page, page.locator(".sf-slot--lore"), "the context panel");
		for (const f of await o.locator(".sf-note-field").all()) await card(page, f, "a description or synopsis");
		expect((await style(page.locator(".sf-left .sf-list").first(), ["background-color"]))[0]).toBe("rgba(0, 0, 0, 0)");
	});

	test("a Codex entry opened in the library side's workspace is a card on bg0 on a bg_dim workspace; so is an archived item", async ({ page }) => {
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await page.locator(".sf-codex-file", { hasText: "Jane" }).first().click();
		const entry = page.locator(".sf-slot--library:not([hidden]) .sf-editor-pane");
		await expect(entry).toBeVisible();
		await dim(page, page.locator(".sf-library-layer"), "the library layer");
		await dim(page, page.locator(".sf-slot--library:not([hidden])"), "the workspace");
		await card(page, entry, "the Codex entry");
		await page.getByRole("tab", { name: "archive" }).click();
		await page.locator(".sf-archive-open, [aria-label='Archive'] .sf-codex-file").first().click().catch(() => undefined);
		const archived = page.locator(".sf-slot--library:not([hidden]) .sf-editor-pane");
		if (await archived.count()) await card(page, archived, "the archived item");
	});

	test("the storytelling side's chapter editor is a bg0 card on bg_dim (a try-out, round five), the left panel on bg_dim", async ({ page }) => {
		expect((await style(page.locator(".sf-slot--centre"), ["background-color"]))[0]).toBe(await probe(page, BG0));
		await dim(page, page.locator(".sf-left"), "the left panel");
		await dim(page, page.locator(".sf-centre-wrap"), "the strip around the editor card"); // bg_dim shows round the card, under the title band and at the window's foot
		const gap = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sf-card-gap")));
		const [card, wrap] = await page.evaluate(() => { const r = (s: string) => { const b = document.querySelector(s)!.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; }; return [r(".sf-slot--centre"), r(".sf-centre-wrap")]; });
		expect(card.top - (wrap.top + 28)).toBeCloseTo(gap, 0); // from the band's foot
		expect(wrap.bottom - card.bottom).toBeCloseTo(gap, 0); // from the window's foot
		expect((await style(page.locator(".sf-slot--centre"), ["border-top-left-radius"]))[0]).toBe("10px");
	});

	test("the first lines of the cards start on the shared top line (48px)", async ({ page }) => {
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await page.locator(".sf-codex-file", { hasText: "Jane" }).first().click();
		const top = await page.locator(".sf-slot--library:not([hidden]) .sf-editor-pane").evaluate((e) => e.getBoundingClientRect().top);
		expect(top).toBeCloseTo(48, 0);
	});
});

test("hints are grey2 at full strength: a placeholder and the Codex list's Empty line are at least 4.5:1 on their card (no extra opacity)", async ({ page }) => {
	await open(page);
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await expect(page.locator(".sf-overview .cm-placeholder").first()).toBeVisible();
	const measure = (sel: string) => page.locator(sel).first().evaluate((e) => {
		let opacity = 1;
		for (let n: Element | null = e; n; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity);
		const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
		let bg = "rgba(0, 0, 0, 0)";
		for (let n: Element | null = e; n; n = n.parentElement) { bg = getComputedStyle(n).backgroundColor; if (!/rgba\(.*, 0\)/.test(bg) && bg !== "transparent") break; }
		const lum = (c: number[]) => { const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
		const [hi, lo] = [lum(rgb(getComputedStyle(e).color)), lum(rgb(bg))].sort((a, b) => b - a);
		return { opacity, ratio: (hi + 0.05) / (lo + 0.05) };
	});
	const placeholder = await measure(".sf-overview .cm-placeholder");
	expect(placeholder.opacity).toBe(1);
	expect(placeholder.ratio).toBeGreaterThanOrEqual(4.5);
	await page.getByRole("tab", { name: "codex" }).click();
	const empty = await measure(".sf-codex-folder-empty");
	expect(empty.opacity).toBe(1);
	expect(empty.ratio).toBeGreaterThanOrEqual(4.5);
});

