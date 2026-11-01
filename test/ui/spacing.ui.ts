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
		test(`at ${rem} rem: the line height is a third less, icons are 1em, the name's icon is 0.75em after it, folder and type icons are 6px apart`, async ({ page }) => {
			await openProject(page);
			if (rem !== "1") await setCodexSize(page, rem);
			const m = await measure(page);
			expect(m.fs).toBeCloseTo(16 * Number(rem), 1);
			expect(m.lineHeight).toBeCloseTo(1.4 * (2 / 3), 2); // 1.4, a third less
			expect(m.rowH).toBeCloseTo(m.fs * (1.4 * (2 / 3)) + 6, 0); // the row is its line plus 3px above and below
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

	test("the library side's codex tab is unchanged: 1.4 line height, 28px rows, 16px icons, 1em after the name, 14px between line and text", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		await page.waitForTimeout(400);
		const m = await measure(page);
		expect(m.fs).toBe(16);
		expect(m.lineHeight).toBeCloseTo(1.4, 2);
		expect(m.rowH).toBeGreaterThanOrEqual(28);
		expect(m.castIcon.w).toBe(16);
		expect(m.janeIcon.w).toBe(16);
		expect(m.nameToTypeGlyph).toBeCloseTo(16, 0.5);
		expect(m.janeName.l - (m.lineLeft + 2)).toBeCloseTo(14, 0.5);
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
