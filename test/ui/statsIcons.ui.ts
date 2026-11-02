import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 13, the icons: every icon in the word-count section is Tabler's, the counts and clocks outline icons at 16 px.

async function start(page: Page, readout: boolean): Promise<void> {
	await openPreview(page);
	await page.evaluate((v) => window.__preview.touch("_backstage/storyforge/project.md", `---\nformat-version: 1\nshow-session-readout: ${v}\n---\n`), readout);
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const shape = (page: Page, sel: string) =>
	page.locator(sel).first().evaluate((e) => {
		const s = e as unknown as SVGElement;
		return { w: s.getAttribute("width"), h: s.getAttribute("height"), box: s.getAttribute("viewBox"), fill: s.getAttribute("fill"), stroke: s.getAttribute("stroke"), sw: s.getAttribute("stroke-width"), d: [...s.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|") };
	});

test.describe("the word-count section's icons", () => {
	test("each count's icon is a 16 px Tabler outline (2 px stroke on the 24 px grid), the five all different; the graph stays 24 px", async ({ page }) => {
		await start(page, false);
		const seen = new Set<string>();
		for (let i = 0; i < 5; i++) {
			const s = await shape(page, ".sf-stats-count svg");
			expect(s).toMatchObject({ w: "16", h: "16", box: "0 0 24 24", fill: "none", stroke: "currentColor", sw: "2" });
			seen.add(s.d);
			await page.locator(".sf-stats-count").click();
		}
		expect(seen.size).toBe(5);
		expect((await shape(page, ".sf-stats-chart svg")).w).toBe("24");
	});

	test("the counts are, in order, calendar-due, calendar-week, calendar-clock, file-text and book", async ({ page }) => {
		await start(page, false);
		const first = ["M4 7a2 2 0 0 1 2 -2h12", "M4 7a2 2 0 0 1 2 -2h12", "M10.5 21h-4.5", "M14 3v4a1 1 0 0 0 1 1h4", "M3 19a9 9 0 0 1 9 0"];
		const markers = ["M11 16a1 1 0 1 0 2 0", "M7 14h.013", "M14 18a4 4 0 1 0 8 0", "M9 13l6 0", "M12 6l0 13"];
		for (let i = 0; i < 5; i++) {
			const d = (await shape(page, ".sf-stats-count svg")).d;
			expect(d.startsWith(first[i]), `count ${i}`).toBe(true);
			expect(d.includes(markers[i]), `count ${i}`).toBe(true);
			await page.locator(".sf-stats-count").click();
		}
	});

	test("the readout's clock is Tabler's clock with no session, 16 px outline", async ({ page }) => {
		await start(page, true);
		const s = await shape(page, ".sf-stats-clock svg");
		expect(s).toMatchObject({ w: "16", h: "16", box: "0 0 24 24", fill: "none", stroke: "currentColor", sw: "2" });
		expect(s.d).toBe("M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0|M12 7v5l3 3");
	});
});
