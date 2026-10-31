import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 11, commit 4: the Codex list refined (docs/look-2.md, decisions 62 and 65), on both sides. The fixture's Codex: Cast
// (Jane, Sam), Places (a folder that is also the note Harbour, and whose own order also lists Harbour), Windows, and others.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const SIDES = [
	{ name: "storytelling side", show: async (_p: Page) => {} },
	{ name: "library side", show: async (p: Page) => { await p.getByRole("button", { name: "Flip side" }).click(); await p.getByRole("tab", { name: "codex" }).click(); } },
];
const tree = (p: Page) => p.locator(".sf-codex-tree");
const row = (p: Page, name: string) => tree(p).locator('[role="treeitem"]').filter({ has: p.locator(".sf-codex-name", { hasText: new RegExp(`^${name}$`) }) });
const box = (l: Locator) => l.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width }; });

for (const side of SIDES) {
	test.describe(`the Codex list, ${side.name}`, () => {
		test.beforeEach(async ({ page }) => { await openProject(page); await side.show(page); });

		test("a note that is also a folder appears once, as the folder's row, and the folder then reads Empty", async ({ page }) => {
			await expect(row(page, "Harbour")).toHaveCount(1);
			await expect(row(page, "Harbour")).toHaveAttribute("aria-expanded", "true");
			await expect(tree(page).locator(".sf-codex-folder-empty")).toHaveCount(1);
		});

		test("no heading; the list is still named Codex", async ({ page }) => {
			await expect(page.locator(".sf-pane-title", { hasText: /codex/i })).toHaveCount(0);
			await expect(page.getByRole("tree", { name: "Codex" })).toBeVisible();
		});

		test("16 px text; icons are the text's colour", async ({ page }) => {
			expect(await tree(page).evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
			const [text, icon] = await row(page, "Jane").evaluate((e) => [getComputedStyle(e.querySelector(".sf-codex-name")!).color, getComputedStyle(e.querySelector("svg")!).color]);
			expect(icon).toBe(text);
		});

		test("the highlight is a block in the Codex colour with the panel's colour on it, for hover and selected alike", async ({ page }) => {
			const [codex, panel] = await tree(page).evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e.closest(".sf-left")!).backgroundColor]);
			const jane = row(page, "Jane");
			expect(await jane.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
			await jane.hover();
			const hovered = await jane.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color, getComputedStyle(e.querySelector("svg")!).color]);
			expect(hovered).toEqual([codex, panel, panel]);
			await jane.click();
			await page.mouse.move(0, 0);
			await expect(jane).toHaveAttribute("aria-selected", "true");
			expect(await jane.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color])).toEqual([codex, panel]);
		});

		test("a folder's line is flush with its name, and a nested row's highlight starts at that line", async ({ page }) => {
			const cast = row(page, "Cast");
			const nameX = (await box(cast.locator(".sf-codex-name"))).x;
			const lineLeft = await cast.locator("xpath=..").locator(".sf-codex-children").evaluate((e) => e.getBoundingClientRect().x + parseFloat(getComputedStyle(e, "::before").left));
			expect(lineLeft).toBeCloseTo(nameX, 0);
			const jane = (await box(row(page, "Jane"))).x;
			expect(jane - lineLeft).toBeGreaterThanOrEqual(0);
			expect(jane - lineLeft).toBeLessThanOrEqual(3);
			// a top-level row highlights from the list's own left edge
			expect((await box(row(page, "Windows"))).x).toBeCloseTo((await box(cast)).x, 0);
		});
	});
}

for (const side of SIDES) {
	test.describe(`the Codex strip, ${side.name}`, () => {
		test.beforeEach(async ({ page }) => { await openProject(page); await side.show(page); });

		test("hover icons: only the icon's colour changes, from the faint resting shade to the Codex colour, on hover and on keyboard focus; never a block or a shape", async ({ page }) => {
			const btn = page.getByRole("button", { name: "New folder" });
			const codex = await tree(page).evaluate((e) => getComputedStyle(e).color);
			const rest = await resolved(page, "--purpose-codex-rest");
			const state = () => btn.evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, border: s.borderTopColor, color: s.color }; });
			expect(await state()).toEqual({ bg: "rgba(0, 0, 0, 0)", border: "rgba(0, 0, 0, 0)", color: rest });
			expect(rest).toBe("rgb(93, 107, 102)"); // bg5, #5d6b66
			await btn.hover();
			await expect.poll(state).toEqual({ bg: "rgba(0, 0, 0, 0)", border: "rgba(0, 0, 0, 0)", color: codex });
			await page.mouse.move(0, 0);
			await expect.poll(state).toEqual({ bg: "rgba(0, 0, 0, 0)", border: "rgba(0, 0, 0, 0)", color: rest });
			await btn.focus();
			await page.keyboard.press("Shift+Tab");
			await page.keyboard.press("Tab"); // by the keyboard, so the focus shows
			await expect.poll(state).toEqual({ bg: "rgba(0, 0, 0, 0)", border: "rgba(0, 0, 0, 0)", color: codex });
		});

		test("still buttons: focusable with a tooltip and the focus ring, and ↓ moves between them", async ({ page }) => {
			const folder = page.getByRole("button", { name: "New folder" });
			await folder.focus();
			await page.keyboard.press("Shift+Tab");
			await page.keyboard.press("Tab"); // by the keyboard, so the focus shows
			await expect(folder).toBeFocused();
			await expect(page.getByRole("tooltip")).toHaveText("New folder");
			expect(await folder.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none");
			await page.keyboard.press("ArrowDown");
			await expect(page.getByRole("button", { name: "New note" })).toBeFocused();
		});
	});
}

test("in a read-only project the strip's icons are greyed out, with the reason as the tooltip", async ({ page }) => {
	await openPreview(page);
	await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n")); // a project made by a newer storyForge
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	const btn = page.getByRole("button", { name: "New folder" });
	await expect(btn).toBeDisabled();
	await btn.hover({ force: true });
	await page.waitForTimeout(400);
	expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)"); // no highlight on a disabled one
	expect(await btn.evaluate((e) => getComputedStyle(e).opacity)).not.toBe("1");
});

// The Codex colour setting (decision 62).
const PROJECT = "_backstage/storyforge/project.md";
const tokens: Record<string, string> = { text: "--purpose-codex-choice-text", yellow: "--purpose-codex-choice-yellow", green: "--purpose-codex-choice-green", aqua: "--purpose-codex-choice-aqua", blue: "--purpose-codex-choice-blue", purple: "--purpose-codex-choice-purple", orange: "--purpose-codex-choice-orange", grey: "--purpose-codex-choice-grey" };
// The strip rests on the colour's own Everforest background shade where there is one, else on bg5 (decision 67).
const rests: Record<string, string> = { text: "rgb(93, 107, 102)", yellow: "rgb(85, 84, 74)", green: "rgb(72, 88, 78)", aqua: "rgb(93, 107, 102)", blue: "rgb(63, 88, 101)", purple: "rgb(78, 73, 83)", orange: "rgb(93, 107, 102)", grey: "rgb(93, 107, 102)" };
const resolved = (page: Page, token: string) => page.evaluate((t) => { const d = document.createElement("i"); d.style.color = `var(${t})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, token);
const read = (page: Page, p: string): Promise<string | null> => page.evaluate((x) => window.__preview.read(x).catch(() => null), p);

test.describe("the Codex colour setting", () => {
	test("each choice recolours the whole list on both sides at once, and is written to project.md only when changed", async ({ page }) => {
		await openProject(page);
		expect(await read(page, PROJECT)).toBeNull(); // opening writes nothing
		const setting = (choice: string) => page.getByRole("radio", { name: new RegExp(`^${choice}$`, "i") });
		const openSettings = async () => { await page.evaluate(() => window.__preview.emit("menu", "settings")); await expect(page.getByRole("radiogroup", { name: "Codex colour" })).toBeVisible(); };
		await openSettings();
		await expect(setting("Text")).toHaveAttribute("aria-checked", "true");
		for (const choice of ["yellow", "green", "aqua", "blue", "purple", "orange", "grey"]) {
			await setting(choice).click();
			await expect(setting(choice)).toHaveAttribute("aria-checked", "true");
			const want = await resolved(page, tokens[choice]);
			// the storytelling list, then (after closing the dialog and flipping) the library list: both read the same page colour
			expect(await tree(page).evaluate((e) => getComputedStyle(e).color)).toBe(want);
			expect(await tree(page).locator(".sf-codex-name").first().evaluate((e) => getComputedStyle(e).color)).toBe(want);
			expect(await tree(page).locator("svg").first().evaluate((e) => getComputedStyle(e).color)).toBe(want);
			await expect.poll(() => page.getByRole("button", { name: "New folder" }).evaluate((e) => getComputedStyle(e).color)).toBe(rests[choice]); // at rest (after its colour transition); the Codex colour on hover
			await expect.poll(() => read(page, PROJECT)).toContain(`codex-colour: ${choice}`);
		}
		// grey is chosen: the library side's list wears it too
		await page.getByRole("button", { name: "Done" }).click();
		await page.getByRole("button", { name: "Flip side" }).click();
		await page.getByRole("tab", { name: "codex" }).click();
		const grey = await resolved(page, tokens.grey);
		expect(await tree(page).evaluate((e) => getComputedStyle(e).color)).toBe(grey);
		expect(await tree(page).locator("svg").first().evaluate((e) => getComputedStyle(e).color)).toBe(grey);
		await expect.poll(() => page.getByRole("button", { name: "New folder" }).evaluate((e) => getComputedStyle(e).color)).toBe(rests.grey);
		// and back to the default
		await openSettings();
		await setting("Text").click();
		await expect.poll(() => read(page, PROJECT)).toContain("codex-colour: text");
		expect(await tree(page).evaluate((e) => getComputedStyle(e).color)).toBe(await resolved(page, tokens.text));
	});

	test("an unknown value falls back to the default and the file is not rewritten", async ({ page }) => {
		await openPreview(page);
		const original = "---\ncodex-colour: red\n---\n";
		await page.evaluate((t) => window.__preview.touch("_backstage/storyforge/project.md", t), original);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		expect(await tree(page).evaluate((e) => getComputedStyle(e).color)).toBe(await resolved(page, tokens.text));
		expect(await read(page, PROJECT)).toBe(original);
	});
});

test.describe("decision 67", () => {
	test("the keyboard focus ring stays visible on a highlighted row with green chosen: it is not the highlight's colour", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await page.getByRole("radio", { name: /^Green$/ }).click();
		await page.getByRole("button", { name: "Done" }).click();
		await row(page, "Sam").click(); // selected: highlighted
		await row(page, "Sam").focus();
		await page.keyboard.press("Shift+Tab");
		await page.keyboard.press("Tab"); // by the keyboard, so the ring shows
		await expect(row(page, "Sam")).toBeFocused();
		const [ring, block, text] = await row(page, "Sam").evaluate((e) => { const s = getComputedStyle(e); return [s.outlineColor, s.backgroundColor, getComputedStyle(e.querySelector(".sf-codex-name")!).color]; });
		expect(await row(page, "Sam").evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
		expect(block).toBe(await resolved(page, "--purpose-codex-choice-green"));
		expect(ring).not.toBe(block);
		expect(ring).toBe(await resolved(page, "--purpose-text")); // fg, drawn as the ring when the Codex colour is green
		void text;
	});

	for (const side of SIDES) {
		test(`${side.name}: inside a folder the highlight's left edge is straight, and a folder's line runs exactly from the top of its first child's box to the bottom of its last, nested folders too`, async ({ page }) => {
			await openProject(page);
			await side.show(page);
			// a folder inside Cast, made from the strip: Cast is the target (the last folder clicked)
			await row(page, "Cast").click();
			await page.getByRole("button", { name: "New folder" }).click();
			await page.getByRole("textbox", { name: "Name of the new folder" }).fill("Inner");
			await page.keyboard.press("Enter");
			await expect(row(page, "Inner")).toBeVisible();
			// a nested row's corners
			const corners = (name: string) => row(page, name).evaluate((e) => { const s = getComputedStyle(e); return [s.borderTopLeftRadius, s.borderBottomLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius].map(parseFloat); });
			const [tl, bl, tr, br] = await corners("Jane");
			expect([tl, bl]).toEqual([0, 0]);
			expect(tr).toBeGreaterThan(0);
			expect(br).toBeGreaterThan(0);
			const [wtl, wbl, wtr, wbr] = await corners("Windows"); // a top-level row is unchanged
			expect(wtl).toBeGreaterThan(0);
			expect(wbl).toBeGreaterThan(0);
			expect(wtr).toBeGreaterThan(0);
			expect(wbr).toBeGreaterThan(0);
			// every folder's line, against its first and last child's box
			const ends = await tree(page).locator(".sf-codex-children").evaluateAll((els) =>
				els.map((c) => {
					const before = getComputedStyle(c, "::before");
					const box = c.getBoundingClientRect();
					const lineTop = box.top + parseFloat(before.top);
					const lineBottom = lineTop + parseFloat(before.height);
					const first = c.firstElementChild!.getBoundingClientRect();
					const last = c.lastElementChild!.getBoundingClientRect();
					return { topGap: Math.abs(lineTop - first.top), bottomGap: Math.abs(lineBottom - last.bottom), kids: c.children.length };
				}),
			);
			expect(ends.length).toBeGreaterThanOrEqual(3); // Cast, Harbour, Inner
			for (const e of ends) {
				expect(e.topGap).toBeLessThan(0.5);
				expect(e.bottomGap).toBeLessThan(0.5);
			}
		});
	}
});
