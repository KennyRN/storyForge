import { expect, test, type Locator, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Tweaks 1 (decision 170): the novel page, the selectors and the cover's error state. Figures are measured from the page, never assumed.

const SETTINGS = "_backstage/storyforge/project.md";

async function open(page: Page, tab: "novel" | "series" | "storytelling" = "novel", chapter = true): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	if (tab === "storytelling") return;
	await flipFace(page);
	await page.getByRole("tab", { name: tab }).click();
	await expect(page.locator(".sf-overview-title")).toBeVisible();
	if (tab === "novel" && chapter) {
		await page.locator('.sf-card[data-chapter="ch-a1.md"] .sf-bar').click();
		await expect(page.locator(".sf-chapter-context .sf-ctx-plot")).toBeVisible();
	}
}
const rect = async (loc: Locator) => (await loc.boundingBox())!;
const overview = (page: Page) => page.locator(".sf-overview");
/** The y of the title's text baseline, read from a zero-size probe set on it. */
async function baselineOf(title: Locator): Promise<number> {
	return title.evaluate((t) => {
		const probe = document.createElement("span");
		probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
		(t.querySelector(".sf-select-current-title") ?? t).append(probe);
		const y = probe.getBoundingClientRect().bottom;
		probe.remove();
		return y;
	});
}
const tabBottom = (page: Page) => page.locator(".sf-rail .sf-tab").first().evaluate((e) => e.getBoundingClientRect().bottom);
const setProject = (page: Page, text: string) =>
	page.evaluate(async ({ path, text }) => {
		await window.__preview.touch(path, text);
		window.__preview.emit("watch-batch", { paths: [path], rescan: false });
	}, { path: SETTINGS, text });

for (const tab of ["novel", "series"] as const) {
	test.describe(`the ${tab} page's title`, () => {
		test("its baseline is level with the bottom edge of the library tabs' icon boxes, and holds when its size changes (a larger title grows upwards)", async ({ page }) => {
			await open(page, tab, false);
			const title = page.locator(".sf-overview-title");
			const level = async () => Math.abs((await baselineOf(title)) - (await tabBottom(page)));
			expect(await level()).toBeLessThan(0.75);
			const before = (await rect(title)).y;
			await setProject(page, "---\nformat-version: 1\nappearance-title-size: 28\n---\n");
			await expect.poll(level).toBeLessThan(0.75);
			expect((await rect(title)).y).toBeLessThan(before); // grew upwards from the line, its baseline unmoved
		});

		test("12px between the title's box and what is beneath it", async ({ page }) => {
			await open(page, tab, false);
			const titleBox = tab === "novel" ? await rect(page.locator(".sf-select-current")) : await rect(page.locator(".sf-overview-title"));
			const head = await rect(page.locator(".sf-overview-head"));
			expect(Math.round((head.y - (titleBox.y + titleBox.height)) * 10) / 10).toBe(12);
		});
	});
}

test.describe("selectors line up with the content beneath", () => {
	test("the novel page: the title's text is the cover's left edge, the fill sticks out to the left, and the open list's highlighted text is the title's", async ({ page }) => {
		await open(page, "novel", false);
		const cover = await rect(page.locator(".sf-cover"));
		const text = await rect(page.locator(".sf-select-current-title"));
		const fill = await rect(page.locator(".sf-select-current"));
		expect(Math.abs(text.x - cover.x)).toBeLessThan(1);
		expect(fill.x).toBeLessThan(cover.x - 6);
		await page.locator(".sf-select-current").click();
		const row = page.locator(".sf-select-row.is-active");
		const rowText = await row.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().left; });
		expect(Math.abs(rowText - cover.x)).toBeLessThan(1);
		expect((await rect(page.locator(".sf-select-list"))).x).toBeLessThan(cover.x - 6);
	});

	test("the storytelling side: the chapter selector's text is the Codex card's left edge, the fill and list stick out to its left, and nothing is cut off", async ({ page }) => {
		await open(page, "storytelling");
		const card = await rect(page.locator(".sf-left[data-face='storytelling'] .sf-codex-tree"));
		const text = await rect(page.locator(".sf-select-current-title"));
		const fill = await rect(page.locator(".sf-select-current"));
		const panel = await rect(page.locator(".sf-left"));
		expect(Math.abs(text.x - card.x)).toBeLessThan(1);
		expect(fill.x).toBeLessThan(card.x);
		expect(fill.x).toBeGreaterThanOrEqual(panel.x); // not cut off by the panel's edge
	});
});

test.describe("the novel selector lists the placed novels only", () => {
	test("Spare Draft (unplaced) is not listed; its page, reached from the series page, keeps its title with no row highlighted", async ({ page }) => {
		await open(page, "novel", false);
		await page.locator(".sf-select-current").click();
		const rows = page.locator(".sf-select-list .sf-select-row");
		await expect(rows).toHaveCount(2);
		await expect(page.locator(".sf-select-list")).not.toContainText("Spare Draft");
		await page.keyboard.press("Escape");
		// The route to an unplaced novel's page: the series page's Unplaced list.
		await page.getByRole("tab", { name: "series" }).click();
		await page.locator(".sf-overview-row--unplaced .sf-overview-name", { hasText: "Spare Draft" }).first().click();
		await page.getByRole("tab", { name: "novel" }).click();
		await expect(page.locator(".sf-select-current-title")).toHaveText("Spare Draft");
		await page.locator(".sf-select-current").click();
		await expect(page.locator(".sf-select-row.is-active")).toHaveCount(0);
		await expect(page.locator(".sf-select-row")).toHaveCount(2);
	});
});

test.describe("an open list is never covered", () => {
	test("the novel selector's list is above the synopsis box, whatever sits there", async ({ page }) => {
		await open(page, "novel", false);
		await page.locator(".sf-select-current").click();
		const covered = await page.evaluate(() => {
			const list = document.querySelector(".sf-select-list")!;
			const r = list.getBoundingClientRect();
			const syn = document.querySelector(".sf-overview-head .sf-section-field")!.getBoundingClientRect();
			// points inside the list where it overlaps the synopsis box (and the cover): the topmost element there must belong to the list
			const bad: string[] = [];
			for (const [x, y] of [[r.left + r.width / 2, r.top + 8], [r.left + r.width / 2, r.bottom - 8], [r.right - 10, r.top + r.height / 2]]) {
				if (y < syn.top || y > syn.bottom || x < syn.left || x > syn.right) continue;
				const top = document.elementFromPoint(x, y);
				if (!top || !list.contains(top)) bad.push(`${Math.round(x)},${Math.round(y)}: ${top?.className}`);
			}
			return bad;
		});
		expect(covered).toEqual([]);
	});

	test("the synopsis label's own stacking can't rise above it: the list has the shared floating layer", async ({ page }) => {
		await open(page, "novel", false);
		await page.locator(".sf-select-current").click();
		expect(await page.locator(".sf-select-list").evaluate((e) => getComputedStyle(e).zIndex)).toBe("50");
		expect(await page.locator(".sf-select").evaluate((e) => getComputedStyle(e).zIndex)).toBe("50");
	});
});

test.describe("the context panel on the novel page", () => {
	const plotTop = async (page: Page) => (await rect(page.locator(".sf-ctx-plot"))).y;
	const synopsisTop = async (page: Page) => (await rect(page.locator(".sf-overview-head .sf-section-field"))).y;

	test("the chapter information box's top is level with the synopsis box's, and the PoV and Location rows sit 12px above it", async ({ page }) => {
		await open(page, "novel");
		await expect.poll(async () => Math.abs((await plotTop(page)) - (await synopsisTop(page)))).toBeLessThan(1);
		const rows = await rect(page.locator(".sf-chapter-rows"));
		expect(Math.round(((await plotTop(page)) - (rows.y + rows.height)) * 10) / 10).toBe(12);
		// the rows stay below the panel's top line (the 48px line, decision 106) at the default size
		expect(rows.y).toBeGreaterThanOrEqual(48);
		expect(await page.locator(".sf-chapter-context").getAttribute("data-align-short-by")).toBe("0");
	});

	test("it is worked out live: a larger title moves the synopsis, and the box follows it; scrolling the centre pane leaves the panel where it is", async ({ page }) => {
		await open(page, "novel");
		const before = await plotTop(page);
		await setProject(page, "---\nformat-version: 1\nappearance-title-size: 28\n---\n");
		await expect.poll(async () => Math.abs((await plotTop(page)) - (await synopsisTop(page)))).toBeLessThan(1);
		expect(await plotTop(page)).not.toBe(before);
		const at = await plotTop(page);
		await overview(page).evaluate((e) => ((e as HTMLElement).scrollTop = 120));
		await page.waitForTimeout(150);
		expect(await plotTop(page)).toBe(at);
	});
});

test.describe("one inset for every working card's text: 16px", () => {
	/** How far the first line of a card's text starts from its card's left edge (the editor's content edge, so the font can't change it). */
	const inset = (card: Locator, line: string) => card.evaluate((c, sel) => {
		const l = c.querySelector(sel) as HTMLElement;
		return Math.round((l.getBoundingClientRect().left - c.getBoundingClientRect().left) * 10) / 10;
	}, line);

	test("the plot note and the read-only chapter text, and the novel synopsis, are 16px from their cards' edges", async ({ page }) => {
		await open(page, "novel");
		expect(await inset(page.locator(".sf-ctx-plot"), ".cm-line")).toBe(16);
		expect(await inset(page.locator(".sf-ctx-text"), ".cm-line")).toBe(16);
		expect(await inset(page.locator(".sf-overview-head .sf-section-field"), ".cm-line")).toBe(16);
		expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--card-text-inset").trim())).toBe("16px");
	});

	test("the series description, and the synopsis in the series tab's context panel, too", async ({ page }) => {
		await open(page, "series");
		expect(await inset(page.locator(".sf-overview-head .sf-section-field"), ".cm-line")).toBe(16);
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		await expect(page.locator(".sf-ctx-synopsis")).toBeVisible();
		expect(await inset(page.locator(".sf-ctx-synopsis"), ".cm-line")).toBe(16);
	});
});

test.describe("a cover that can't be shown", () => {
	/** WCAG 2 contrast of two rgb() strings. */
	const ratio = (a: string, b: string): number => {
		const lum = (c: string): number => {
			const [r, g, bl] = (c.match(/\d+/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
			return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
		};
		const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	};

	test("the cover box is bg_red with the '!' rounded square cut out in the colour it sits on, named for the screen reader, still a menu button", async ({ page }) => {
		await open(page, "novel", false);
		const box = page.locator('[data-cover="book:aaa"]');
		await expect(box).toHaveAttribute("data-state", "error"); // the fixture's cover is not a real picture
		const fill = await box.evaluate((e) => getComputedStyle(e).backgroundColor);
		expect(fill).toBe("rgb(89, 70, 76)"); // bg_red #59464c
		const icon = box.locator("svg");
		await expect(icon).toHaveAttribute("aria-label", "The cover could not be shown");
		const cut = await icon.evaluate((e) => getComputedStyle(e).color);
		expect(cut).toBe("rgb(41, 49, 54)"); // bg_dim, the colour the box sits on
		const w = await rect(box);
		const i = await rect(icon);
		expect(Math.abs(i.width - w.width / 2)).toBeLessThan(1.5); // half the box's width, as the no-cover icon is
		expect(Math.abs(i.x + i.width / 2 - (w.x + w.width / 2))).toBeLessThan(1); // centred
		console.log(`COVER-CONTRAST>> cut-out ${cut} on ${fill}: ${ratio(cut, fill).toFixed(2)}:1`);
		await expect(box).toHaveAttribute("aria-label", /^The cover of .* could not be shown\. Change or remove it$/);
		await box.click();
		await expect(page.getByRole("menuitem")).toHaveText(["Change Cover…", "Remove Cover"]);
	});

	test("the series cover and the context panel's novel cover are the same", async ({ page }) => {
		await open(page, "series");
		await expect(page.locator('[data-cover="series"]')).toHaveAttribute("data-state", "error");
		await page.locator(".sf-overview-row[data-book='aaa'] .sf-overview-name").click();
		await expect(page.locator(".sf-novel-context [data-cover='book:aaa']")).toHaveAttribute("data-state", "error");
	});

	test("a start card with a cover it can't draw shows the red box too", async ({ page }) => {
		await openPreview(page, { recent: true });
		const image = page.locator(".sf-project-card-image").first();
		await expect(image).toHaveClass(/is-error/);
		await expect(image.locator("svg")).toHaveAttribute("aria-label", "The cover could not be shown");
		expect(await image.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(89, 70, 76)");
	});
});
