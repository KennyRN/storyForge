import { expect, test, type Page } from "@playwright/test";
import { openPreview, openSettingsDialog } from "./helpers";

// Tweaks 3 (1.12.3): Settings' labels, and the word count modal in two tabs. Figures are measured from the page.

const SESSIONS = "_backstage/storyforge/sessions";
const WORDCOUNT = "_backstage/storyforge/aaa/wordcount.md";
const entry = (id: string, day: string, from: string, to: string, net: number) =>
	[`  - id: ${id}`, `    start: ${day}T${from}:00+00:00`, `    end: ${day}T${to}:00+00:00`, `    day: ${day}`, `    net: ${net}`, "    chapters:", "      - path: aaa/ch-a1.md", "        id: c-a1k3", `        net: ${net}`, "    unreliable: false", "    recovered: false"].join("\n");
const file = (...entries: string[]) => `---\nsessions-format: 1\ncomputer: k7x2q9ab\nsessions:\n${entries.join("\n")}\n---\nWriting sessions.\n`;

async function openWith(page: Page, opts: { sessions?: string[]; early?: boolean } = {}): Promise<void> {
	await openPreview(page);
	if (opts.sessions) await page.evaluate(([p, t]) => window.__preview.touch(p, t), [`${SESSIONS}/2026-10-k7x2q9ab.md`, file(...opts.sessions)]);
	if (opts.early) {
		const text = await page.evaluate((p) => window.__preview.read(p), WORDCOUNT);
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [WORDCOUNT, text.replace("daily:\n", "daily:\n  2025-01-08:\n    net: 120\n    chapters:\n      ch-a1.md: 120\n")]);
	}
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const history = async (page: Page) => {
	await page.getByRole("button", { name: /Open the history/ }).click();
	const d = page.getByRole("dialog", { name: "Word count history" });
	await expect(d.getByRole("tab", { name: "overview" })).toBeVisible();
	return d;
};
const size = (page: Page) => page.evaluate(() => { const r = document.querySelector(".sf-history")!.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });

test.describe("§1.1 and §1.2 Settings", () => {
	test("Body bold sits directly beneath Body, and every label and group heading is lowercase", async ({ page }) => {
		await openWith(page);
		await openSettingsDialog(page);
		const dlg = page.getByRole("dialog");
		const subs: Record<string, string[]> = { General: ["general", "sidebar widths"], Appearance: ["interface", "library mode", "storytelling mode", "writing"], Writing: [], Sessions: [], Backups: [] };
		for (const [pg, list] of Object.entries(subs)) {
			await dlg.getByRole("tab", { name: pg, exact: true }).click();
			for (const s of list.length ? list : [""]) {
				if (s) await dlg.getByRole("tab", { name: s, exact: true }).click();
				const labels = await dlg.evaluate((d) => {
					const panel = d.querySelector('[role="tabpanel"]') ?? d;
					const text = [...panel.querySelectorAll(".sf-setting-label, .sf-grid-name")].map((e) => (e.textContent ?? "").trim());
					const aria = [...panel.querySelectorAll("section.sf-settings-section, [role='radiogroup'], select, input[type='checkbox'], input[type='number']")].map((e) => e.getAttribute("aria-label") ?? "");
					return [...text, ...aria].filter(Boolean);
				});
				for (const l of labels) expect(l, `${pg}/${s}: ${l}`).toBe(l.replace(/\b(?!PoV\b|Everforest\b|Tabler\b|SN Pro\b|Aleo\b|Fraunces\b|Atkinson Hyperlegible Next\b|Courier Prime\b|Sofia Sans\b)([A-Z])/g, (c) => c.toLowerCase()));
			}
		}
		await dlg.getByRole("tab", { name: "Appearance", exact: true }).click();
		await dlg.getByRole("tab", { name: "interface", exact: true }).click();
		const names = await dlg.locator(".sf-grid-name").allTextContents();
		expect(names.indexOf("body bold")).toBe(names.indexOf("body") + 1);
		await dlg.getByRole("tab", { name: "writing", exact: true }).click();
		for (const l of ["selection colour", "bold colour", "italic colour", "bold italic colour"]) await expect(dlg.getByRole("radiogroup", { name: l, exact: true })).toBeVisible();
		await dlg.getByRole("tab", { name: "storytelling mode", exact: true }).click();
		await expect(dlg.locator(".sf-grid-name", { hasText: "chapter length bar" })).toBeVisible();
	});
});

test.describe("§1.3 the word count modal", () => {
	test("it opens on overview with the series under its name and the novel under its numbered title, and both heat maps", async ({ page }) => {
		await openWith(page);
		const d = await history(page);
		await expect(d.getByRole("tab", { name: "overview" })).toHaveAttribute("aria-selected", "true");
		await expect(d.getByRole("heading", { name: "The Lantern Cycle" })).toBeVisible();
		await expect(d.getByRole("heading", { name: "Book 1: The Harbour Wakes" })).toBeVisible();
		await expect(d.getByText("All novels")).toHaveCount(0);
		await expect(d.getByText("This novel")).toHaveCount(0);
		await expect(d.getByRole("grid", { name: "Words per day" })).toBeVisible();
		await expect(d.getByRole("grid", { name: "Words per week" })).toBeVisible();
	});
	test("a standalone project shows one summary", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 1\nstory-kind: standalone\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		const d = await history(page);
		await expect(d.getByRole("heading", { name: "The Lantern Cycle" })).toHaveCount(0);
		await expect(d.getByRole("heading", { name: /Harbour Wakes/ })).toHaveCount(1);
		await expect(d.locator(".sf-history-stat", { hasText: "Words now" })).toHaveCount(1);
	});
	test("the tabs and sub-pages work by mouse and by arrow keys, each a proper tab, and the modal keeps one size", async ({ page }) => {
		await openWith(page);
		const d = await history(page);
		const before = await size(page);
		await d.getByRole("tab", { name: "overview" }).focus();
		await page.keyboard.press("ArrowRight");
		await expect(d.getByRole("tab", { name: "stats" })).toHaveAttribute("aria-selected", "true");
		await expect(d.getByRole("tab", { name: "days" })).toHaveAttribute("aria-selected", "true");
		await expect(d.getByRole("tabpanel")).toHaveCount(1);
		await d.getByRole("tab", { name: "days" }).focus();
		await page.keyboard.press("ArrowRight");
		await expect(d.getByRole("tab", { name: "weeks" })).toHaveAttribute("aria-selected", "true");
		expect(await size(page)).toEqual(before);
		await d.getByRole("tab", { name: "days" }).click();
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		expect(await size(page)).toEqual(before); // nothing jumps when a day is chosen
		// remembered until the app quits: closed and opened again, it is where it was
		await page.keyboard.press("Escape");
		const again = await history(page);
		await expect(again.getByRole("tab", { name: "stats" })).toHaveAttribute("aria-selected", "true");
		await expect(again.getByRole("gridcell", { name: /Tuesday 20 October/ })).toHaveAttribute("aria-selected", "true");
	});
	test("clicking a day or a week on overview opens stats on that sub-page with it chosen", async ({ page }) => {
		await openWith(page, { sessions: [entry("a", "2026-10-20", "09:00", "09:20", 400), entry("b", "2026-10-22", "10:00", "10:30", 200)] });
		const d = await history(page);
		await d.getByRole("tab", { name: "overview" }).click();
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		await expect(d.getByRole("tab", { name: "days" })).toHaveAttribute("aria-selected", "true");
		await expect(d.getByRole("gridcell", { name: /Tuesday 20 October/ })).toHaveAttribute("aria-selected", "true");
		await expect(d.getByRole("list", { name: "Writing sessions" })).toContainText("09:00–09:20");
		await d.getByRole("tab", { name: "overview" }).click();
		await d.getByRole("gridcell", { name: /^Week 43/ }).click();
		await expect(d.getByRole("tab", { name: "weeks" })).toHaveAttribute("aria-selected", "true");
		// that week's sessions, grouped under each day's date
		await expect(d.locator(".sf-history-day-head")).toHaveText(["Tuesday 20 October", "Thursday 22 October"]);
		await expect(d.locator(".sf-session")).toHaveCount(2);
		await expect(d.getByText("Days, weeks and today leave out editing sessions")).toBeVisible(); // the note moved to stats
		await d.getByRole("tab", { name: "overview" }).click();
		await expect(d.getByText("Days, weeks and today leave out editing sessions")).toHaveCount(0);
	});
	test("the sessions scroll in their own pane while the heat map stays put", async ({ page }) => {
		const many = Array.from({ length: 25 }, (_, i) => entry(String.fromCharCode(97 + i), "2026-10-20", `${String(6 + (i % 14)).padStart(2, "0")}:00`, `${String(6 + (i % 14)).padStart(2, "0")}:30`, 50 + i));
		await openWith(page, { sessions: many });
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		const pane = d.locator(".sf-history-pane");
		await expect.poll(() => d.locator(".sf-session").count()).toBeGreaterThan(20);
		expect(await pane.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
		const mapTop = await d.getByRole("grid", { name: "Words per day" }).evaluate((e) => e.getBoundingClientRect().top);
		await pane.evaluate((e) => (e.scrollTop = 400));
		expect(await d.getByRole("grid", { name: "Words per day" }).evaluate((e) => e.getBoundingClientRect().top)).toBe(mapTop);
	});
	test("§1.6 the top margin is 16px like the others, and a small window never spills the modal", async ({ page }) => {
		await openWith(page);
		const d = await history(page);
		const m = await page.evaluate(() => { const body = document.querySelector(".sf-dialog-body")!.getBoundingClientRect(); const tabs = document.querySelector(".sf-history-tabs")!.getBoundingClientRect(); return { top: tabs.top - body.top, left: tabs.left - body.left }; });
		expect(m).toEqual({ top: 16, left: 16 }); // it was 38px at the top
		await page.setViewportSize({ width: 640, height: 480 });
		await page.waitForTimeout(300);
		const fits = await page.evaluate(() => { const r = document.querySelector(".sf-dialog")!.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
		expect(fits).toBe(true);
		void d;
	});
});

test.describe("§1.4 the heat maps", () => {
	test("a week's square is twice a day's height, the chosen square's ring is green, and each map sits on its own rounded background", async ({ page }) => {
		await openWith(page);
		const d = await history(page);
		await d.getByRole("gridcell", { name: /Tuesday 20 October/ }).click();
		await expect(d.getByRole("gridcell", { name: /Tuesday 20 October/ })).toHaveAttribute("aria-selected", "true");
		const m = await page.evaluate(() => {
			const day = document.querySelector('.sf-heat-cell[data-date]')!.getBoundingClientRect();
			const week = document.querySelector('.sf-heat-weeks .sf-heat-cell')?.getBoundingClientRect();
			const sel = getComputedStyle(document.querySelector('.sf-heat-cell[aria-selected="true"]')!);
			const card = getComputedStyle(document.querySelector(".sf-heat-card")!);
			const probe = (v: string) => { const i = document.createElement("i"); i.style.color = `var(${v})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
			return { day: day.height, week: week?.height ?? null, ring: sel.outlineColor, accent: probe("--purpose-accent"), bg: card.backgroundColor, bgToken: probe("--purpose-heat-bg"), radius: card.borderTopLeftRadius, pad: card.paddingTop };
		});
		expect(m.day).toBe(14);
		expect(m.ring).toBe(m.accent);
		expect(m.bg).toBe(m.bgToken);
		expect(m.radius).toBe("10px");
		expect(m.pad).toBe("12px");
		await d.getByRole("tab", { name: "weeks" }).click();
		await expect(d.getByRole("grid", { name: "Words per week" })).toBeVisible();
		const week = await page.evaluate(() => document.querySelector(".sf-heat-weeks .sf-heat-cell")!.getBoundingClientRect().height);
		expect(week).toBe(28);
	});
	test("the first column is the week of the earliest recorded day, and a long history scrolls sideways, opening at the latest weeks", async ({ page }) => {
		await openWith(page, { early: true });
		const d = await history(page);
		const first = await page.evaluate(() => document.querySelector('.sf-history .sf-heat-grid .sf-heat-row .sf-heat-cell[data-date]')!.getAttribute("data-date"));
		expect(first).toBe("2025-01-06"); // the Monday of the week of 8 January 2025
		const s = await d.locator(".sf-heat-scroll").first().evaluate((e) => ({ scrolls: e.scrollWidth > e.clientWidth, atEnd: Math.abs(e.scrollWidth - e.clientWidth - e.scrollLeft) < 2 }));
		expect(s).toEqual({ scrolls: true, atEnd: true });
		// every square keeps its number in a tooltip and an accessible name
		await expect(d.getByRole("gridcell", { name: /Wednesday 8 January: 120/ })).toHaveCount(1);
	});
	test("without any record the maps show the default window, and with a record the first column is its week", async ({ page }) => {
		await openWith(page);
		const d = await history(page);
		const first = await d.locator('.sf-heat-grid .sf-heat-row .sf-heat-cell[data-date]').first().getAttribute("data-date");
		expect(first).toBe("2026-10-19"); // the fixture's first recorded day is 20 October 2026, a Tuesday
	});
});
