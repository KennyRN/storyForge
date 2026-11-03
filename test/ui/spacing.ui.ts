import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 13, commit 5 (decision 84): the Codex list's spacing on the storytelling side. The library side's codex tab is unchanged.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await page.waitForTimeout(500);
}
const setCodexSize = async (page: Page, rem: string) => {
	await page.evaluate(() => window.__preview.emit("menu", "settings"));
	await page.getByRole("dialog").getByRole("tab", { name: "Appearance", exact: true }).click();
	await page.getByRole("dialog").getByLabel("Codex list size (rem)").fill(rem);
	await page.getByRole("dialog").getByLabel("Codex list size (rem)").press("Enter");
	await expect.poll(() => page.evaluate(() => window.__preview.read("_backstage/storyforge/project.md").catch(() => ""))).toContain("appearance-codex-size");
	await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
};
/** Measures the first folder (Cast, with Jane and Sam inside), the folder-and-location row (Harbour), and a plain note. */
const measure = (page: Page) =>
	page.evaluate(() => {
		const box = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
		const rowOf = (name: string) => [...document.querySelectorAll<HTMLElement>(".sf-codex-tree .sf-codex-file, .sf-codex-tree .sf-codex-folder-header")].find((e) => e.querySelector(".sf-codex-name")?.textContent?.trim() === name)!;
		const cast = rowOf("Cast");
		const jane = rowOf("Jane");
		const sam = rowOf("Sam");
		const harbour = rowOf("Harbour");
		const container = cast.nextElementSibling as HTMLElement; // the folder's children
		const before = getComputedStyle(container, "::before");
		const fs = parseFloat(getComputedStyle(cast).fontSize);
		const castName = cast.querySelector(".sf-codex-name")!;
		const hit = cast.querySelector(".sf-codex-hit")!;
		const castIcon = hit.querySelector("svg")!;
		const janeName = jane.querySelector(".sf-codex-name")!;
		const janeIcon = jane.querySelector(".sf-codex-name + svg")!;
		const harbourIcons = [...harbour.querySelectorAll("svg")];
		const lineLeft = container.getBoundingClientRect().left + parseFloat(before.left);
		return {
			fs,
			lineHeight: parseFloat(getComputedStyle(cast).lineHeight) / fs,
			rowH: box(cast).h,
			castName: box(castName), castIcon: box(castIcon), hit: box(hit), castRow: box(cast),
			janeRow: box(jane), samRow: box(sam), janeName: box(janeName), janeIcon: box(janeIcon),
			harbourIcons: harbourIcons.map(box), harbourName: box(harbour.querySelector(".sf-codex-name")!),
			container: box(container), lineLeft, lineW: parseFloat(before.width),
			nameToFolderGlyph: box(castIcon).l - box(castName).r,
			nameToTypeGlyph: box(janeIcon).l - box(janeName).r,
		};
	});

test.describe("the Codex list's spacing on the storytelling side", () => {
	for (const rem of ["1", "1.5"]) {
		test(`at ${rem} rem: the line height is 1.1, icons are 1em, the name's icon is 0.75em after it, folder and type icons are 6px apart`, async ({ page }) => {
			await openProject(page);
			if (rem !== "1") await setCodexSize(page, rem);
			const m = await measure(page);
			expect(m.fs).toBeCloseTo(16 * Number(rem), 1);
			expect(m.lineHeight).toBeCloseTo(1.1, 2); // it was 1.4, then 1; 1 clipped accents on capitals (decision 93)
			expect(m.rowH).toBeCloseTo(m.fs * 1.1 + 6, 0); // the row is its line plus 3px above and below
			for (const icon of [m.castIcon, m.janeIcon, ...m.harbourIcons]) {
				expect(icon.w).toBeCloseTo(m.fs, 1);
				expect(icon.h).toBeCloseTo(m.fs, 1);
			}
			expect(m.nameToFolderGlyph).toBeCloseTo(0.75 * m.fs, 0.5);
			expect(m.nameToTypeGlyph).toBeCloseTo(0.75 * m.fs, 0.5);
			expect(m.harbourIcons[1].l - m.harbourIcons[0].r).toBeCloseTo(6, 0.5);
		});
	}

	test("the folder icon's hit area is as tall as its row and at least 28px wide, and never reaches the rows above or below", async ({ page }) => {
		for (const rem of ["0.75", "1", "1.75"]) {
			await openProject(page);
			if (rem !== "1") await setCodexSize(page, rem);
			const m = await measure(page);
			expect(m.hit.h).toBeCloseTo(m.castRow.h, 0.5);
			expect(m.hit.t).toBeGreaterThanOrEqual(m.castRow.t - 0.5);
			expect(m.hit.b).toBeLessThanOrEqual(m.castRow.b + 0.5);
			expect(m.hit.w).toBeGreaterThanOrEqual(28);
		}
	});

	test("a folder's line is flush with its name, its highlight starts at the line, its text is 6px from it, and it runs from the first child's top to the last child's bottom", async ({ page }) => {
		await openProject(page);
		const m = await measure(page);
		expect(m.lineW).toBe(2);
		expect(m.lineLeft).toBeCloseTo(m.castName.l, 0.5); // flush with the folder's name
		expect(m.janeRow.l).toBeCloseTo(m.lineLeft + 2, 0.5); // the highlight starts flush at the line
		expect(m.janeName.l - m.janeRow.l).toBeCloseTo(6, 0.5); // 6px between the line and the text (was 14)
		expect(m.container.t).toBeCloseTo(m.janeRow.t, 0.5);
		expect(m.container.b).toBeCloseTo(m.samRow.b, 0.5);
	});

	test("the library side's codex tab has the storytelling list's measures: the same line height, rows, icons, gap after the name and line-to-text distance", async ({ page }) => {
		await openProject(page);
		await page.waitForTimeout(400);
		const story = await measure(page);
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await page.waitForTimeout(400);
		const m = await measure(page);
		expect(m.fs).toBe(story.fs);
		expect(m.lineHeight).toBeCloseTo(story.lineHeight, 2);
		expect(m.rowH).toBeCloseTo(story.rowH, 0);
		expect(m.castIcon.w).toBe(story.castIcon.w);
		expect(m.janeIcon.w).toBe(story.janeIcon.w);
		expect(m.nameToTypeGlyph).toBeCloseTo(story.nameToTypeGlyph, 0.5);
		expect(m.janeName.l - (m.lineLeft + 2)).toBeCloseTo(story.janeName.l - (story.lineLeft + 2), 0.5);
	});

	test("the strip's icons keep their size on both sides", async ({ page }) => {
		await openProject(page);
		const size = () => page.getByRole("button", { name: "New folder" }).locator("svg").evaluate((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; });
		const story = await size();
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		expect(await size()).toEqual(story);
	});

	test("the series name and the novel's name sit 4px apart (was 8px)", async ({ page }) => {
		await openProject(page);
		const gap = await page.evaluate(() => document.querySelector(".sf-nav-novel")!.getBoundingClientRect().top - document.querySelector(".sf-nav-series")!.getBoundingClientRect().bottom);
		expect(gap).toBe(4);
	});
});

// Decision 86: the Codex list on the storytelling side sits on a card.
test.describe("the Codex card on the storytelling side", () => {
	const rect = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; });
	const colourOf = (page: Page, purpose: string) => page.evaluate((p) => { const d = document.createElement("i"); d.style.color = `var(${p})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, purpose);

	test("the card is the editor's background, rounded, with no border; only the list is on it (the strip stays on the panel)", async ({ page }) => {
		await openProject(page);
		const card = await page.locator(".sf-left[data-face='storytelling'] .sf-codex-tree").evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], overflowY: s.overflowY }; });
		expect(card.bg).toBe(await colourOf(page, "--purpose-editor-bg"));
		expect(card.radius).toBe("10px");
		expect(card.border).toEqual(["0px", "0px", "0px", "0px"]);
		expect(card.overflowY).toMatch(/auto|scroll/); // it scrolls inside the card, clipped by its corners
		const [strip, tree, panel] = await Promise.all([rect(page, ".sf-codex-strip"), rect(page, ".sf-codex-tree"), rect(page, ".sf-left")]);
		expect(strip.r).toBeLessThanOrEqual(tree.l); // the strip is beside the card, not on it
		expect(await page.locator(".sf-codex-strip").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
		expect(await colourOf(page, "--purpose-panel-bg")).not.toBe(card.bg); // the two shades separate card from panel
		expect(panel.w).toBeGreaterThan(0);
	});

	test("its top and left are where the list's own were before the card (4px and 8px); its right is 10% of the body's width (12px at least) and follows the panel as it's resized", async ({ page }) => {
		await openProject(page);
		const margins = async () => {
			const [tree, body] = await Promise.all([rect(page, ".sf-codex-tree"), rect(page, ".sf-codex-body")]);
			const strip = await rect(page, ".sf-codex-strip");
			return { right: body.r - tree.r, top: tree.t - body.t, left: tree.l - strip.r, panel: body.w };
		};
		const m1 = await margins();
		expect(m1.top).toBeCloseTo(4, 0);
		expect(m1.left).toBeCloseTo(8, 0);
		expect(m1.right).toBeCloseTo(Math.max(12, m1.panel * 0.1), 0);
		const bar = page.getByRole("separator", { name: "Resize the left panel" });
		await bar.focus();
		for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
		const m2 = await margins();
		expect(m2.panel).toBeGreaterThan(m1.panel + 50);
		expect(m2.right).toBeCloseTo(Math.max(12, m2.panel * 0.1), 0);
		expect(m2.right).toBeGreaterThan(m1.right);
		expect(m2.top).toBeCloseTo(4, 0);
		expect(m2.left).toBeCloseTo(8, 0);
	});

	test("the highlight keeps 6px from the card's edges with corners that sit inside the card's; inside a folder it starts flush at the line; its text is the card's colour", async ({ page }) => {
		await openProject(page);
		await page.getByRole("treeitem", { name: "Windows", exact: true }).first().hover();
		const m = await page.evaluate(() => {
			const tree = document.querySelector(".sf-codex-tree")!.getBoundingClientRect();
			const rows = [...document.querySelectorAll<HTMLElement>(".sf-codex-tree .sf-codex-file, .sf-codex-tree .sf-codex-folder-header")];
			const first = rows[0].getBoundingClientRect();
			const win = rows.find((r) => r.textContent!.includes("Windows"))!;
			const jane = rows.find((r) => r.textContent!.includes("Jane"))!;
			return {
				left: first.left - tree.left, top: first.top - tree.top, right: tree.right - first.right,
				radius: getComputedStyle(rows[0]).borderTopLeftRadius,
				janeRadii: [getComputedStyle(jane).borderTopLeftRadius, getComputedStyle(jane).borderBottomLeftRadius, getComputedStyle(jane).borderTopRightRadius],
				hoverColour: getComputedStyle(win).color,
			};
		});
		expect(m.left).toBeCloseTo(6, 0.5);
		expect(m.top).toBeCloseTo(6, 0.5);
		expect(m.right).toBeCloseTo(6, 0.5);
		expect(m.radius).toBe("4px"); // 10px less the 6px inset: concentric with the card
		expect(m.janeRadii).toEqual(["0px", "0px", "4px"]); // flush at the folder's line
		expect(m.hoverColour).toBe(await colourOf(page, "--purpose-editor-bg"));
		const sp = await measure(page);
		expect(sp.janeRow.l).toBeCloseTo(sp.lineLeft + 2, 0.5); // the card didn't move the line or the highlight apart
	});

	test("the chapter dropdown opens over the top of the card", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).click();
		const list = await rect(page, ".sf-nav-list");
		const tree = await rect(page, ".sf-codex-tree");
		expect(list.b).toBeGreaterThan(tree.t); // it covers the card's top
		const top = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement).closest(".sf-nav-list") !== null, [list.l + list.w / 2, tree.t + 4] as const);
		expect(top).toBe(true);
	});

	test("every Codex colour is at least 4.5:1 on the card, and the card's colour on it (the highlight) the same", async ({ page }) => {
		await openProject(page);
		const worst = await page.evaluate(() => {
			const lum = (c: string) => { const [r, g, b] = c.match(/\d+/g)!.slice(0, 3).map((x) => { const v = Number(x) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
			const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
			const probe = (v: string) => { const d = document.createElement("i"); d.style.color = `var(${v})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
			const card = probe("--purpose-editor-bg");
			const out: Record<string, number> = {};
			for (const name of ["text", "yellow", "green", "aqua", "blue", "purple", "orange", "grey"]) out[name] = ratio(probe(`--purpose-codex-choice-${name}`), card);
			return out;
		});
		for (const [name, r] of Object.entries(worst)) expect(r, name).toBeGreaterThanOrEqual(4.5);
	});

	test("the library side's codex tab has the same card (Fix 7 polish)", async ({ page }) => {
		await openProject(page);
		const read = () => page.locator(".sf-codex-tree").evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, radius: c.borderTopLeftRadius, margin: c.marginTop, pad: c.paddingTop }; });
		const story = await read();
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		expect(await read()).toEqual(story);
		expect(story.radius).toBe("10px");
	});

	// Decision 93: both cards end 12px above the stats section, which is a fixed height, with or without the session readout.
	const withReadout = async (page: Page, on: boolean) => {
		await openPreview(page);
		await page.evaluate((v) => window.__preview.touch("_backstage/storyforge/project.md", `---\nformat-version: 1\nshow-session-readout: ${v}\n---\n`), on);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await page.waitForTimeout(500);
	};
	const bottoms = async (page: Page) => {
		const [tree, lore, stats, left, loreSlot] = await Promise.all([rect(page, ".sf-codex-tree"), rect(page, ".sf-lore-host"), rect(page, ".sf-stats"), rect(page, ".sf-left"), rect(page, ".sf-slot--lore")]);
		return { tree: tree.b, lore: lore.b, stats: stats.t, statsH: stats.h, left: left.b, loreSlot: loreSlot.b, loreTop: lore.t };
	};

	for (const on of [false, true]) {
		test(`with the session readout ${on ? "on" : "off"}: both cards end together, 12px above the stats section, which is 64px tall`, async ({ page }) => {
			await withReadout(page, on);
			const b = await bottoms(page);
			expect(b.statsH).toBeCloseTo(64, 0);
			expect(b.tree).toBeCloseTo(b.stats - 12, 0);
			expect(b.lore).toBeCloseTo(b.stats - 12, 0);
			expect(b.left).toBeCloseTo(b.loreSlot, 0); // the panels end together, so the two bottoms are comparable
			// the bottom row, with the special-characters button, is still beneath the card
			const button = await rect(page, ".sf-chars-button");
			expect(button.t).toBeGreaterThanOrEqual(b.lore);
			expect(button.b).toBeLessThanOrEqual(b.loreSlot);
		});
	}

	test("switching the readout on or off moves neither card", async ({ page }) => {
		await withReadout(page, false);
		const off = await bottoms(page);
		const offTree = await rect(page, ".sf-codex-tree");
		await withReadout(page, true);
		const on = await bottoms(page);
		const onTree = await rect(page, ".sf-codex-tree");
		expect(on.tree).toBeCloseTo(off.tree, 1);
		expect(on.lore).toBeCloseTo(off.lore, 1);
		expect(on.stats).toBeCloseTo(off.stats, 1);
		expect(onTree.t).toBeCloseTo(offTree.t, 1);
	});

	test("the context panel's card does not move when the side flips", async ({ page }) => {
		await openProject(page);
		const before = await rect(page, ".sf-lore-host");
		await flipFace(page);
		await page.waitForTimeout(300);
		const after = await rect(page, ".sf-lore-host");
		expect(after.t).toBeCloseTo(before.t, 1);
		expect(after.b).toBeCloseTo(before.b, 1);
		expect(after.l).toBeCloseTo(before.l, 1);
		expect(after.r).toBeCloseTo(before.r, 1);
		const left = await rect(page, ".sf-left");
		expect(after.b).toBeCloseTo(left.b - 64 - 12, 0); // the same bottom as on the storytelling side
	});
});
