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
		const select = page.locator(".sf-nav-select");
		expect(await style(select, "filter")).toBe(await resolved(page, "filter", "var(--floating-shadow-filter)"));
		expect(await style(page.locator(".sf-nav-list"), "box-shadow")).toBe("none");
		expect(await style(page.locator(".sf-nav-current"), "box-shadow")).toBe("none");
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
		await other.hover();
		await lit(other, "hover is the same"); // decision 62
		await page.keyboard.press("Escape");
		// the chapter list
		await page.getByRole("button", { name: "Chapters" }).click();
		const chosen = page.locator(".sf-nav-row.is-active");
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
		expect(await style(pop.getByRole("menuitemcheckbox", { name: "Populace", exact: true }), "background-color")).not.toBe(accent);
		await flipFace(page); // (keeps the page honest: the highlight rule is not tied to the side)
	});
});
