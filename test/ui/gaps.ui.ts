import { expect, test, type Page } from "@playwright/test";
import { BAND, flipFace, openPreview } from "./helpers";

// Brief 19, commit 6 (§3): one fixed gap, 28 px, between boxes everywhere. Nothing moves when a divider is dragged.

const GAP = 28;
async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await page.waitForTimeout(500);
}
const box = async (page: Page, sel: string) => {
	const b = (await page.locator(sel).first().boundingBox())!;
	return { l: b.x, t: b.y, r: b.x + b.width, b: b.y + b.height };
};
const near = (a: number, b: number, why: string) => expect(Math.abs(a - b), `${why}: ${a} vs ${b}`).toBeLessThanOrEqual(1);

for (const size of [{ width: 1440, height: 900 }, { width: 1100, height: 760 }]) {
	test.describe(`at ${size.width}×${size.height}`, () => {
		test.use({ viewport: size });

		test("the storytelling side: the chapter box and the context Codex card start 28px from the window's top, and all three boxes end on one line", async ({ page }) => {
			await openProject(page);
			await page.evaluate(() => (window.__app as any).toggleLore("Codex/Windows.md"));
			await expect(page.locator(".sf-lore-host > .sf-editor-pane")).toBeVisible();
			const chapter = await box(page, ".sf-slot--centre");
			const note = await box(page, ".sf-lore-host > .sf-editor-pane");
			const codex = await box(page, ".sf-left .sf-codex-tree");
			near(chapter.t, BAND, "the chapter box's top");
			near(note.t, BAND, "the context card's top");
			near(chapter.b, codex.b, "the chapter box's foot and the Codex index card's");
			near(note.b, codex.b, "the context card's foot and the Codex index card's");
			// the gaps between the boxes, and to the window's edge
			near(chapter.l - codex.r, GAP, "Codex card to chapter box");
			near(note.l - chapter.r, GAP, "chapter box to context card");
			near(size.width - note.r, GAP, "context card to the window's edge");
		});

		test("the novel tab's two gutters are equal: the Placed box to the workspace's content, and the synopsis box to the context panel's boxes", async ({ page }) => {
			await openProject(page);
			await flipFace(page);
			await page.getByRole("tab", { name: "novel" }).click();
			await expect(page.getByRole("region", { name: "Novel overview" })).toBeVisible();
			const placed = await box(page, ".sf-placed-zone .sf-chapter-list");
			const cover = await box(page, ".sf-overview .sf-cover");
			const synopsis = await box(page, ".sf-overview .sf-note-field");
			const plot = await box(page, ".sf-ctx-plot");
			near(cover.l - placed.r, GAP, "Placed box to the cover");
			near(plot.l - synopsis.r, GAP, "synopsis box to the context boxes");
		});

		test("nothing moves when a divider is dragged: the gaps are the same figure at every panel width", async ({ page }) => {
			await openProject(page);
			const gapAt = async () => {
				const chapter = await box(page, ".sf-slot--centre");
				const codex = await box(page, ".sf-left .sf-codex-tree");
				return { top: chapter.t, left: chapter.l - codex.r };
			};
			const before = await gapAt();
			await page.locator(".sf-splitter--left").focus();
			for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
			const after = await gapAt();
			expect(after).toEqual(before);
		});
	});
}
