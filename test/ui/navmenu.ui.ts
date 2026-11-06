import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Fix 7 polish (try-out): focus rings for the keyboard only, the chapter list's row shape, the add button, the invisible title bar,
// the one top line, and the left panel's navigate menu (decisions 104, 105).

async function openProject(page: Page, readOnly = false): Promise<void> {
	await openPreview(page);
	if (readOnly) {
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	}
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
/** Sets the library side's left panel to its 200 px minimum through the stored setting (unlinked, in pixels), as a person would in Settings; the shell applies it from there and keeps it across tab clicks. */
const storeNarrowLibrary = (page: Page) => page.evaluate(() => { const m = window.__app as any; Object.assign(m.nav, { widthUnit: "px", widthsLinked: false, libraryWidth: 200 }); m.touch("nav"); });
const chevron = (page: Page) => page.getByRole("button", { name: "Navigate" });
const menu = (page: Page) => page.getByRole("menu", { name: "Navigate" });
const item = (page: Page, name: string) => menu(page).getByRole("menuitem", { name, exact: true });
const accent = (page: Page) => page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--purpose-accent)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
const accentFill = (page: Page) => page.evaluate(() => { const d = document.createElement("i"); d.style.backgroundColor = "var(--purpose-accent)"; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
const outline = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => getComputedStyle(e).outlineStyle);

test.describe("the navigate menu's chevron", () => {
	test("is the interface accent (green) on hover, like the other icon buttons, and the muted colour at rest", async ({ page }) => {
		await openProject(page);
		await page.mouse.move(0, 0);
		const colour = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => getComputedStyle(e).color);
		const probe = (v: string) => page.evaluate((x) => { const d = document.createElement("i"); d.style.color = x; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, v);
		expect(await colour(chevron(page))).toBe(await probe("var(--purpose-text-muted)"));
		await chevron(page).hover();
		expect(await colour(chevron(page))).toBe(await probe("var(--purpose-accent)"));
	});
});

test.describe("the navigate menu", () => {
	test("the chevron is in the left panel's top band, at its right end, on both sides, named Navigate, and follows a resize", async ({ page }) => {
		await openProject(page);
		for (const side of ["storytelling", "storyforge"]) {
			if (side === "storyforge") await flipFace(page);
			const [b, p] = await Promise.all([chevron(page).boundingBox(), page.locator(".sf-left").boundingBox()]);
			expect(b!.y).toBeLessThan(28);
			expect(b!.y + b!.height).toBeLessThanOrEqual(28.5);
			expect(p!.x + p!.width - (b!.x + b!.width)).toBeLessThan(16);
			await expect(chevron(page).locator("svg")).toHaveCount(1);
		}
		const bar = page.getByRole("separator", { name: "Resize the left panel" });
		await bar.focus();
		const before = (await chevron(page).boundingBox())!.x;
		for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
		expect((await chevron(page).boundingBox())!.x).toBeGreaterThan(before + 20);
	});

	test("the menu holds Storytelling, the four tabs, a gap, Back Up Now, a gap and Open Project, with no project name", async ({ page }) => {
		await openProject(page);
		await chevron(page).click();
		await expect(menu(page)).toBeVisible();
		const rows = await menu(page).getByRole("menuitem").allInnerTexts();
		expect(rows).toEqual(["Storytelling", "Codex", "Series", "Novel", "Archive", "Back Up Now", "Open Project"]);
		await expect(menu(page).locator(".sf-navmenu-name")).toHaveCount(0);
		await expect(menu(page).getByRole("separator")).toHaveCount(2);
		const order = await menu(page).evaluate((m) => Array.from(m.children).map((c) => c.getAttribute("role")));
		expect(order).toEqual(["menuitem", "menuitem", "menuitem", "menuitem", "menuitem", "separator", "menuitem", "separator", "menuitem"]);
		expect(await menu(page).evaluate((e) => { const s = getComputedStyle(e); return [s.borderTopWidth, s.backgroundColor]; })).toEqual(["0px", await page.evaluate(() => { const d = document.createElement("i"); d.style.background = "var(--purpose-raised-bg)"; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; })]);
	});

	test("the seven rows carry Kenny's icons at 32px, 0.5em before the text, the middle of the text's capital height on the icon's middle; all the text lines up in the one column; icons take the row's colour (decision 106, amended in 1.6.5)", async ({ page }) => {
		await openProject(page);
		await chevron(page).click();
		const geo = await menu(page).evaluate((m) => Array.from(m.querySelectorAll<HTMLElement>("[role=menuitem]")).map((row) => {
			const svg = row.querySelector("svg")!;
			const label = row.querySelector<HTMLElement>(".sf-navmenu-label")!;
			const range = document.createRange();
			range.selectNodeContents(label.firstChild!);
			const t = range.getBoundingClientRect();
			// The label's box is trimmed to its capital height (text-box: trim-both cap alphabetic), so its middle is the capitals' middle.
			const box = label.getBoundingClientRect();
			const cs = getComputedStyle(row);
			const ctx = document.createElement("canvas").getContext("2d")!;
			ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
			const cap = ctx.measureText("H").actualBoundingBoxAscent;
			const s = svg.getBoundingClientRect();
			return { label: row.textContent, em: parseFloat(cs.fontSize), textLeft: t.left, capMid: (box.top + box.bottom) / 2, capBox: box.height, cap, iconMid: (s.top + s.bottom) / 2, svg: { w: s.width, h: s.height, right: s.right }, fill: getComputedStyle(svg).fill, color: cs.color };
		}));
		const column = geo[0].textLeft;
		for (const g of geo) {
			expect(Math.abs(g.textLeft - column), `${g.label}: one text column`).toBeLessThan(1);
			expect(g.svg.w).toBeCloseTo(32, 0);
			expect(g.svg.h).toBeCloseTo(32, 0);
			expect(g.textLeft - g.svg.right, `${g.label}: the gap`).toBeCloseTo(0.5 * g.em, 0);
			expect(Math.abs(g.capMid - g.iconMid), `${g.label}: capital height centred on the icon`).toBeLessThan(0.75);
			expect(Math.abs(g.capBox - g.cap), `${g.label}: the label's box is its capital height`).toBeLessThan(1);
			expect(g.fill, `${g.label}: the row's colour`).toBe(g.color);
		}
		expect(geo).toHaveLength(7);
	});

	test("where you are is a highlighted row (rule 1), on each side and each tab; every item does its job from both sides", async ({ page }) => {
		await openProject(page);
		const green = await accent(page); // the accent fill, the surface's colour on it
		const fill = (l: ReturnType<typeof item>) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
		await chevron(page).click();
		expect(await fill(item(page, "Storytelling"))).toBe(await accentFill(page));
		expect(await fill(item(page, "Codex"))).not.toBe(await accentFill(page));
		await item(page, "Series").click();
		await expect(page.getByRole("tab", { name: "series", selected: true })).toBeVisible();
		await expect(page.locator(".sf-overview")).toBeVisible();
		await chevron(page).click();
		expect(await fill(item(page, "Series"))).toBe(await accentFill(page));
		expect(await fill(item(page, "Storytelling"))).not.toBe(await accentFill(page));
		await item(page, "Codex").click();
		await expect(page.getByRole("tab", { name: "codex", selected: true })).toBeVisible();
		await chevron(page).click();
		await item(page, "Archive").click();
		await expect(page.getByRole("tab", { name: "archive", selected: true })).toBeVisible();
		await chevron(page).click();
		await item(page, "Novel").click();
		await expect(page.getByRole("tab", { name: "novel", selected: true })).toBeVisible();
		await chevron(page).click();
		await item(page, "Storytelling").click();
		await expect(page.locator(".sf-nav-novel")).toBeVisible();
		await chevron(page).click(); // from the storytelling side to a tab
		await item(page, "Archive").click();
		await expect(page.getByRole("tab", { name: "archive", selected: true })).toBeVisible();
	});

	test("Back Up Now does what File's does; Open Project closes through the normal close and reaches the start screen", async ({ page }) => {
		await openProject(page);
		await chevron(page).click();
		await item(page, "Back Up Now").click();
		await expect(page.getByText(/Backed up \d+ files/)).toBeVisible();
		await chevron(page).click();
		await item(page, "Open Project").click();
		await expect(page.getByRole("button", { name: "Open Project…" })).toBeVisible();
		await expect(page.locator(".sf-left")).toHaveCount(0);
	});

	test("in a read-only project Back Up Now is greyed out with the reason", async ({ page }) => {
		await openProject(page, true);
		await chevron(page).click();
		await expect(item(page, "Back Up Now")).toBeDisabled();
		// clearly dimmer than an ordinary muted row (same colour, half the strength)
		const opacity = (n: string) => item(page, n).evaluate((e) => Number(getComputedStyle(e).opacity));
		expect(await opacity("Back Up Now")).toBeLessThanOrEqual(0.5);
		expect(await opacity("Codex")).toBe(1);
		await expect(item(page, "Back Up Now")).toHaveAttribute("title", "This project is open read-only.");
		await expect(item(page, "Open Project")).toBeEnabled();
	});

	test("keys: ↓ and ↑ move, Return chooses, Escape closes and returns focus to the chevron, with its ring", async ({ page }) => {
		await openProject(page);
		await chevron(page).focus();
		await page.keyboard.press("Enter");
		await expect(item(page, "Storytelling")).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(item(page, "Codex")).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await expect(item(page, "Storytelling")).toBeFocused();
		await page.keyboard.press("End");
		await expect(item(page, "Open Project")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(menu(page)).toHaveCount(0);
		await expect(chevron(page)).toBeFocused();
		expect(await outline(chevron(page))).not.toBe("none");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await expect(page.getByRole("tab", { name: "codex", selected: true })).toBeVisible();
	});

	test("a click outside closes it", async ({ page }) => {
		await openProject(page);
		await chevron(page).click();
		await page.locator(".sf-slot--centre").click({ position: { x: 300, y: 300 } });
		await expect(menu(page)).toHaveCount(0);
	});
});

test.describe("focus rings are for the keyboard", () => {
	test("clicking the chevron, the selector, a chapter and a Codex row shows no ring; Tab and Escape do", async ({ page }) => {
		await openProject(page);
		const selector = page.getByRole("button", { name: "Chapters" });
		await selector.click();
		expect(await outline(selector)).toBe("none");
		await page.locator(".sf-select-row", { hasText: "Chapter 2" }).click();
		await expect(page.locator(".sf-select-current-title")).toHaveText("Chapter 2");
		expect(await outline(selector)).toBe("none"); // the redraw gave it focus again after the click
		await selector.click();
		await page.keyboard.press("Escape");
		await expect(selector).toBeFocused();
		expect(await outline(selector)).not.toBe("none"); // Escape is the keyboard
		await page.locator(".sf-codex-file").first().click();
		expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe("none");
		await chevron(page).click();
		expect(await outline(chevron(page))).toBe("none");
		await page.keyboard.press("Escape");
		expect(await outline(chevron(page))).not.toBe("none");
	});
});

test.describe("the chapter list's rows, the add button and the title bar", () => {
	test("rows are 6px in from the dropdown's edges with 4px corners and a Codex row's padding (3px, plus half the 2px gap that rule 1 folded in, so the rows touch); the add row is centred, its icon 1em", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).click();
		const list = page.locator(".sf-select-list");
		const row = page.locator(".sf-select-row").first();
		const [l, r] = await Promise.all([list.boundingBox(), row.boundingBox()]);
		expect(r!.x - l!.x).toBeCloseTo(6, 0);
		expect(l!.x + l!.width - (r!.x + r!.width)).toBeCloseTo(6, 0);
		const s = await row.evaluate((e) => { const c = getComputedStyle(e); return [c.paddingTop, c.paddingBottom, c.borderTopLeftRadius]; });
		expect(s).toEqual(["4px", "4px", "4px"]); // 3px and half the 2px gap that was between rows: the rows touch, the text has not moved
		const add = page.getByRole("button", { name: "Add the next chapter" });
		const [a, i, size] = await Promise.all([add.boundingBox(), add.locator("svg").boundingBox(), add.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))]);
		expect(i!.width).toBeCloseTo(size, 0);
		expect(i!.x + i!.width / 2).toBeCloseTo(a!.x + a!.width / 2, 0);
	});

	test("the title bar is an empty draggable band the traffic lights sit in; the panels run to the top; nothing interactive sits under it", async ({ page }) => {
		await openProject(page);
		const bar = page.locator(".sf-titlebar");
		await expect(bar).toHaveAttribute("data-tauri-drag-region", "");
		const b = (await bar.boundingBox())!;
		expect([b.x, b.y, b.height]).toEqual([0, 0, 28]);
		expect(b.width).toBe(1280);
		for (const sel of [".sf-left", ".sf-slot--lore", ".sf-centre-wrap"]) expect((await page.locator(sel).boundingBox())!.y, sel).toBe(0);
		expect(await bar.evaluate((e) => e.children.length)).toBe(0);
		const under = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("button, [tabindex], input, textarea, .cm-content, a")).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top < 28 && !e.classList.contains("sf-navmenu-button") && !e.classList.contains("sf-splitter") && !e.closest(".sf-notice,.sf-visually-hidden"); }).map((e) => e.className));
		expect(under).toEqual([]);
	});

	test("one top line: the series name and the chapter's first line start at the same height (the boxes start at 28px: Brief 19); the library side's first tab sits 4px above it", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await expect(page.locator(".sf-lore-host > .sf-editor-pane")).toBeVisible();
		const top = (sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top);
		const want = await top(".sf-nav-series");
		expect(want).toBeCloseTo(48, 0);
		// Brief 19 §3 (amending decision 106's top line for the boxes): the context card and the chapter box start 28px from the window's top, clearing the title band
		expect(await top(".sf-lore-host > .sf-editor-pane")).toBeCloseTo(28, 0);
		expect(await top(".sf-slot--centre")).toBeCloseTo(28, 0);
		expect(await top(".sf-slot--centre .cm-line")).toBeCloseTo(want, 0); // the chapter's text is on the one top line again: the band, then the editor's own top padding (--top-gap)
		await flipFace(page);
		expect(await top(".sf-tab")).toBeCloseTo(44, 0); // 28 + 16: 4px above the shared line, accepted
	});

	test("the chapter list's and the closed selector's text start where the Codex list's does", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).click();
		const left = (sel: string) => page.locator(sel).first().evaluate((e) => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n: Node | null; while ((n = w.nextNode())) if (n.textContent!.trim()) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1); return r.getBoundingClientRect().left; } return -1; });
		const codex = await left(".sf-codex-tree .sf-codex-folder-header, .sf-codex-tree .sf-codex-file");
		expect(Math.abs((await left(".sf-select-current-title")) - codex)).toBeLessThan(1);
		expect(Math.abs((await left(".sf-select-row")) - codex)).toBeLessThan(1);
	});
});

test.describe("the workspace belongs to the side", () => {
	const layer = (page: Page) => page.locator(".sf-library-layer");
	const shown = (page: Page) => page.locator(".sf-library-layer .sf-slot--library:not([hidden]) .cm-content");
	const typed = async (page: Page) => {
		await page.locator(".sf-slot--centre .cm-content").first().click();
		await page.keyboard.type(" unsaved words");
	};

	test("Codex and Archive tabs cover the chapter with their own entry or a blank; the chapter's editor stays open and inert underneath", async ({ page }) => {
		await openProject(page);
		await typed(page);
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await expect(layer(page)).toBeVisible();
		await expect(shown(page)).toHaveCount(0); // blank: nothing selected
		await expect(page.locator(".sf-slot--centre")).toHaveAttribute("inert", "");
		await page.locator(".sf-codex-file", { hasText: "Jane" }).first().click();
		await expect(shown(page)).toContainText("Jane");
		await page.getByRole("tab", { name: "archive" }).click();
		await expect(shown(page)).toHaveCount(0); // the Codex entry doesn't show on the Archive tab
		await page.getByRole("tab", { name: "codex" }).click();
		await expect(shown(page)).toContainText("Jane"); // each tab remembers its own
		await page.getByRole("tab", { name: "novel" }).click();
		await expect(layer(page)).toBeHidden();
		await expect(page.locator(".sf-overview")).toBeVisible();
	});

	test("flipping swaps the workspace both ways without closing the chapter: its unsaved text survives, over a blank Codex tab too", async ({ page }) => {
		await openProject(page);
		await typed(page);
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await flipFace(page); // back to the storytelling side
		await expect(layer(page)).toBeHidden();
		await expect(page.locator(".sf-slot--centre")).not.toHaveAttribute("inert", "");
		await expect(page.locator(".sf-slot--centre .cm-content")).toContainText("unsaved words");
		await flipFace(page);
		await expect(layer(page)).toBeVisible(); // the library side comes back to its Codex tab, blank as it was
		await flipFace(page);
		await expect(page.locator(".sf-slot--centre .cm-content")).toContainText("unsaved words");
	});
});

test.describe("the library side's tabs and Codex", () => {
	test("a Codex note typed in the context panel arrives in the library's Codex workspace, and back, with no conflict and no recovery file", async ({ page }) => {
		await openProject(page);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		const lore = page.locator(".sf-lore-host .cm-content");
		await expect(lore).toBeVisible();
		await lore.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" moved words");
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await page.locator(".sf-codex-file", { hasText: "Jane" }).first().click();
		const there = page.locator(".sf-library-layer .sf-slot--library:not([hidden]) .cm-content");
		await expect(there).toContainText("moved words");
		await expect(page.getByRole("alert")).toHaveCount(0);
		await there.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.type(" and back");
		await flipFace(page);
		await page.locator(".sf-codex-tree [data-key]").filter({ hasText: "Jane" }).first().click();
		await expect(page.locator(".sf-lore-host .cm-content")).toContainText("moved words and back");
		await expect(page.getByRole("alert")).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => window.__preview.read("Codex/Jane.md"))).toContain("moved words and back");
		const root = (await page.evaluate(() => window.__preview.root()))!;
		const { readdirSync, existsSync } = await import("node:fs");
		const rec = `${root}/_sf-backup/recovery`;
		expect(existsSync(rec) ? readdirSync(rec, { recursive: true }) : []).toEqual([]);
	});

	test("the library's Codex list is on a card with the storytelling side's font, size, line height and icon gap, the strip outside it", async ({ page }) => {
		await openProject(page);
		const read = () => page.locator(".sf-codex-tree").first().evaluate((t) => {
			const s = getComputedStyle(t);
			const row = t.querySelector(".sf-codex-file")!;
			const name = row.querySelector(".sf-codex-name")!.getBoundingClientRect();
			const icon = row.querySelector("svg")?.getBoundingClientRect();
			return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, line: getComputedStyle(row).lineHeight, bg: s.backgroundColor, radius: s.borderRadius, gap: icon ? icon.left - name.right : null, iconW: icon?.width ?? null };
		});
		const story = await read();
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		const library = await read();
		expect(library).toEqual(story);
		expect(library.radius).toBe("10px");
		const strip = await page.locator(".sf-codex-strip").boundingBox();
		const tree = await page.locator(".sf-codex-tree").boundingBox();
		expect(strip!.x + strip!.width).toBeLessThanOrEqual(tree!.x + 1);
	});
});

test("the panes under the tab row start where the Codex card's top is, so nothing jumps between tabs", async ({ page }) => {
	await openProject(page);
	await flipFace(page);
	let narrow = false;
	const top = async (name: string) => {
		await page.getByRole("tab", { name }).click();
		await page.waitForTimeout(150);
		return page.evaluate(() => {
			const pane = document.querySelector(".sf-forge-tab")!;
			const first = pane.querySelector(".sf-codex-tree, .sf-series-title, .sf-forge-body > *")!;
			const text = first.querySelector(".sf-series-title-text, .sf-row, .sf-codex-file") ?? first;
			return (first.classList.contains("sf-series-title") ? text : first).getBoundingClientRect().top;
		});
	};
	// at the default width and at the panel's 200 px minimum
	for (const width of [null, "200px"]) {
		narrow = width !== null;
		if (narrow) await storeNarrowLibrary(page);
		const card = await top("codex");
		for (const t of ["series", "novel", "archive"]) expect(Math.abs((await top(t)) - card), `${t} at ${width ?? "default"}`).toBeLessThan(6);
		if (narrow) expect(await page.locator(".sf-left").evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(201);
	}
});
