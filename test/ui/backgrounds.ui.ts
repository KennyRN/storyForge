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

	test("the novel tab: the left panel, the workspace and the context panel are bg_dim; the synopsis, the plot note, the chapter's text and the two lists are cards on bg0", async ({ page }) => {
		await novelTab(page);
		await dim(page, page.locator(".sf-left"), "the left panel");
		await dim(page, page.getByRole("region", { name: "Novel overview" }), "the workspace");
		await dim(page, page.locator(".sf-slot--lore"), "the context panel");
		await dim(page, page.locator(".sf-centre-wrap"), "the strip under the title band");
		await card(page, page.getByRole("region", { name: "Novel overview" }).locator(".sf-note-field").first(), "the synopsis");
		await card(page, page.locator(".sf-ctx-plot"), "the plot note");
		await card(page, page.locator(".sf-ctx-text"), "the chapter's text");
		await card(page, page.locator("[aria-label='Placed chapters']"), "the placed list");
		await card(page, page.locator("[aria-label='Unplaced chapters']"), "the unplaced list");
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

	test("the storytelling side is unchanged: the chapter editor stays on bg0, the left panel on bg_dim", async ({ page }) => {
		expect((await style(page.locator(".sf-slot--centre"), ["background-color"]))[0]).toBe(await probe(page, BG0));
		await dim(page, page.locator(".sf-left"), "the left panel");
		expect((await style(page.locator(".sf-centre-wrap"), ["background-color"]))[0]).toBe(await probe(page, BG0)); // the strip under the title band is the editor's colour here
	});

	test("the first lines of the cards start on the shared top line (48px)", async ({ page }) => {
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await page.locator(".sf-codex-file", { hasText: "Jane" }).first().click();
		const top = await page.locator(".sf-slot--library:not([hidden]) .sf-editor-pane").evaluate((e) => e.getBoundingClientRect().top);
		expect(top).toBeCloseTo(48, 0);
	});
});
