import { expect, test, type Locator, type Page } from "@playwright/test";
import { flipFace, openPreview, openSettingsDialog } from "./helpers";

// Two default rules (docs/interface.md): a selected text row is highlighted as in the Codex list (accent fill, the surface's colour on it,
// hover the same), and every floating surface has the one shared shadow.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const resolved = (page: Page, prop: "color" | "background-color" | "box-shadow" | "filter", value: string) =>
	page.evaluate(([p, v]) => { const d = document.createElement("i"); d.style.setProperty(p, v); document.body.append(d); const c = getComputedStyle(d).getPropertyValue(p); d.remove(); return c; }, [prop, value] as const);
const style = (l: Locator, prop: string) => l.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);
const chevron = (page: Page) => page.getByRole("button", { name: "Navigate" });

test.describe("rule 2: one shadow for every floating surface", () => {
	test("the Navigate menu, the filter popover, the special-characters palette, a context menu and the chapter dropdown all use it", async ({ page }) => {
		await openProject(page);
		const shadow = await resolved(page, "box-shadow", "var(--floating-shadow)");
		expect(shadow).not.toBe("none");
		await chevron(page).click();
		expect(await style(page.getByRole("menu", { name: "Navigate" }), "box-shadow")).toBe(shadow);
		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Filter by type" }).click();
		expect(await style(page.getByRole("menu", { name: "Filter by type" }), "box-shadow")).toBe(shadow);
		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Special characters" }).click();
		expect(await style(page.locator(".sf-chars-palette").first(), "box-shadow")).toBe(shadow);
		await page.keyboard.press("Escape");
		await page.getByRole("treeitem", { name: "Windows", exact: true }).click({ button: "right" });
		expect(await style(page.locator(".sf-menu").first(), "box-shadow")).toBe(shadow);
		await page.keyboard.press("Escape");
		// the chapter selector and its dropdown are one piece: the shadow is a filter round the pair, and neither box has its own
		await page.getByRole("button", { name: "Chapters" }).click();
		const select = page.locator(".sf-select--chapters");
		expect(await style(select, "filter")).toBe(await resolved(page, "filter", "var(--floating-shadow-filter)"));
		expect(await style(page.locator(".sf-select-list"), "box-shadow")).toBe("none");
		expect(await style(page.locator(".sf-select--chapters .sf-select-current"), "box-shadow")).toBe("none");
		await page.keyboard.press("Escape");
		expect(await style(select, "filter")).toBe("none"); // closed, no shadow
	});
});

test.describe("rule 1: a selected text row is highlighted", () => {
	test("the Navigate menu's current place, the chapter list's selected chapter, the Settings section list's selected section and the filter popover's chosen rows", async ({ page }) => {
		await openProject(page);
		const accent = await resolved(page, "background-color", "var(--purpose-accent)");
		const surface = await resolved(page, "color", "var(--purpose-raised-bg)");
		const lit = async (l: Locator, what: string): Promise<void> => {
			expect(await style(l, "background-color"), `${what}: the accent fill`).toBe(accent);
			expect(await style(l, "color"), `${what}: the surface's colour on it`).toBe(surface);
		};
		// the Navigate menu: where you are
		await chevron(page).click();
		const here = page.getByRole("menuitem", { name: "Storytelling", exact: true });
		await lit(here, "the Navigate menu's current place");
		const other = page.getByRole("menuitem", { name: "Codex", exact: true });
		expect(await style(other, "background-color")).not.toBe(accent); // not selected, not hovered
		const muted = await resolved(page, "color", "var(--purpose-text-muted)");
		expect(await style(other, "color"), "an unselected Navigate row is muted").toBe(muted);
		await other.hover();
		await lit(other, "hover is the same"); // decision 62
		await page.keyboard.press("Escape");
		// the chapter list
		await page.getByRole("button", { name: "Chapters" }).click();
		const chosen = page.locator(".sf-select-row.is-active");
		await lit(chosen, "the chapter list's selected chapter");
		await page.keyboard.press("Escape");
		// the Settings section list
		await openSettingsDialog(page);
		await lit(page.getByRole("dialog").getByRole("tab", { name: "General", exact: true }), "the Settings section list's selected section");
		const writing = page.getByRole("dialog").getByRole("tab", { name: "Writing", exact: true });
		expect(await style(writing, "background-color")).not.toBe(accent);
		await writing.hover();
		await lit(writing, "hover is the same");
		await page.keyboard.press("Escape");
		// the filter popover: Show all while no filter is on; every ticked row once there is one, each keeping its tick
		await page.getByRole("button", { name: "Filter by type" }).click();
		const pop = page.getByRole("menu", { name: "Filter by type" });
		await lit(pop.getByRole("menuitem", { name: "Show all" }), "Show all, with no filter");
		await pop.getByRole("menuitemcheckbox", { name: "Person", exact: true }).click();
		await pop.getByRole("menuitemcheckbox", { name: "Place", exact: true }).click();
		await page.mouse.move(700, 700);
		for (const n of ["Person", "Place"]) {
			const r = pop.getByRole("menuitemcheckbox", { name: n, exact: true });
			await lit(r, `${n}, ticked`);
			await expect(r).toHaveAttribute("aria-checked", "true");
			expect(await style(r.locator(".sf-filter-tick"), "visibility")).toBe("visible"); // the tick stays: it doesn't rely on colour
		}
		expect(await style(pop.getByRole("menuitem", { name: "Show all" }), "background-color")).not.toBe(accent);
		expect(await style(pop.getByRole("menuitem", { name: "Show all" }), "color"), "an unticked filter row is muted").toBe(await resolved(page, "color", "var(--purpose-text-muted)"));
		expect(await style(pop.getByRole("menuitemcheckbox", { name: "Populace", exact: true }), "background-color")).not.toBe(accent);
		await flipFace(page); // (keeps the page honest: the highlight rule is not tied to the side)
	});
});

test.describe("rule 1: highlighted rows touch, as in the Codex list", () => {
	/** Every pair of neighbouring rows meets: no gap, no overlap. */
	const touch = async (rows: Locator, what: string): Promise<void> => {
		const boxes = await rows.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }));
		expect(boxes.length, `${what}: rows`).toBeGreaterThan(1);
		for (let i = 1; i < boxes.length; i++) expect(Math.abs(boxes[i][0] - boxes[i - 1][1]), `${what}: row ${i} meets the one above`).toBeLessThan(0.6);
	};

	test("the filter popover's adjacent ticked types are touching blocks, and so are the rows of the Navigate menu, the chapter list and the Settings list", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Filter by type" }).click();
		const pop = page.getByRole("menu", { name: "Filter by type" });
		await pop.getByRole("menuitemcheckbox", { name: "Person", exact: true }).click();
		await pop.getByRole("menuitemcheckbox", { name: "Place", exact: true }).click();
		await touch(pop.locator("button"), "the filter popover");
		const [a, b] = await Promise.all([pop.getByRole("menuitemcheckbox", { name: "Person", exact: true }).boundingBox(), pop.getByRole("menuitemcheckbox", { name: "Place", exact: true }).boundingBox()]);
		expect(Math.abs(b!.y - (a!.y + a!.height))).toBeLessThan(0.6); // the two ticked, highlighted rows meet
		await page.keyboard.press("Escape");
		await chevron(page).click();
		await touch(page.getByRole("menu", { name: "Navigate" }).getByRole("menuitem").filter({ hasText: /^(Storytelling|Codex|Series|Novel|Archive)$/ }), "the Navigate menu");
		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Chapters" }).click();
		await touch(page.locator(".sf-select-list .sf-select-row"), "the chapter list");
		await page.keyboard.press("Escape");
		await openSettingsDialog(page);
		await touch(page.getByRole("dialog").locator(".sf-settings-tabs").getByRole("tab"), "the Settings section list");
	});

	test("the library panes' rows touch, and the selected one is highlighted as the others are", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		for (const tab of ["novel", "series"]) {
			await page.getByRole("tab", { name: tab }).click();
			const placed = page.locator(".sf-forge-pane .sf-list").first().locator(".sf-row");
			await touch(placed, `the ${tab} pane`);
			if (tab === "series") await placed.first().click(); // the series tab marks only the library's chosen novel (Brief 19)
			const selected = page.locator(".sf-forge-pane .sf-row.is-selected").first();
			expect(await style(selected, "background-color"), `${tab}: the accent fill`).toBe(await resolved(page, "background-color", "var(--purpose-accent)"));
			// the surface's colour on it: the Novel tab's list is on a card (bg0), the series pane's is on the panel (bg_dim)
			expect(await style(selected, "color"), `${tab}: the surface's colour on it`).toBe(await resolved(page, "color", tab === "novel" ? "var(--purpose-editor-bg)" : "var(--purpose-panel-bg)"));
		}
	});

	test("the shortcode popup's selected option is highlighted the same way, and its options touch", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\ntyping-shortcodes-list:\n  th: the Right Honourable\n  tm: the Most Noble\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await page.locator(".sf-slot--centre .cm-content").click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" He met ~t");
		const options = page.locator(".sf-shortcode-option");
		await expect(options.first()).toBeVisible();
		const selected = page.locator(".sf-shortcode-option.is-selected");
		expect(await style(selected, "background-color")).toBe(await resolved(page, "background-color", "var(--purpose-accent)"));
		expect(await style(selected, "color")).toBe(await resolved(page, "color", "var(--purpose-raised-bg)"));
		await touch(options, "the shortcode popup");
		// rule 2: the popup really has the shared shadow on screen (CodeMirror's own tooltip rules zero it on the wrapper, not on the popup)
		expect(await style(page.locator(".sf-shortcode-popup"), "box-shadow")).toBe(await resolved(page, "box-shadow", "var(--floating-shadow)"));
	});
});
