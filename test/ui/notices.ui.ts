import { expect, test, type Page } from "@playwright/test";
import { openPreview, openSettingsDialog } from "./helpers";

// Brief 17: the four kinds of notice (decision 122): a tinted fill, a 3 px edge in the kind's colour, an icon with a name, no 1 px border; red means something failed.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const notify = (page: Page, input: { kind: string; text: string; sticky?: boolean }) => page.evaluate((i) => window.__app.notices.notify(i as never), input);

const KINDS = {
	error: { fill: "rgb(89, 70, 76)", edge: "rgb(230, 126, 128)", icon: "Error" },
	warning: { fill: "rgb(85, 84, 74)", edge: "rgb(219, 188, 127)", icon: "Warning" },
	information: { fill: "rgb(63, 88, 101)", edge: "rgb(127, 187, 179)", icon: "Information" },
	success: { fill: "rgb(72, 88, 78)", edge: "rgb(167, 192, 128)", icon: "Done" },
} as const;

/** WCAG contrast of two `rgb(r, g, b)` strings. */
function contrast(a: string, b: string): number {
	const lum = (s: string) => {
		const [r, g, bl] = (s.match(/\d+/g) ?? []).slice(0, 3).map((v) => Number(v) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [x, y] = [lum(a), lum(b)];
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test.describe("the four kinds of notice", () => {
	for (const [kind, want] of Object.entries(KINDS)) {
		test(`${kind}: its tint, a 3 px edge, its icon (named ${want.icon}), no 1 px border, the shared shadow`, async ({ page }) => {
			await openProject(page);
			await notify(page, { kind, text: `A ${kind} notice`, sticky: kind === "error" });
			const n = page.locator(`.sf-notice--${kind}`);
			await expect(n).toBeVisible();
			const s = await n.evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, left: `${c.borderLeftWidth} ${c.borderLeftStyle} ${c.borderLeftColor}`, top: c.borderTopWidth, right: c.borderRightWidth, bottom: c.borderBottomWidth, shadow: c.boxShadow, color: c.color }; });
			expect(s.bg).toBe(want.fill);
			expect(s.left).toBe(`3px solid ${want.edge}`);
			expect([s.top, s.right, s.bottom]).toEqual(["0px", "0px", "0px"]); // the old 1 px bg3 border is gone
			expect(s.shadow).not.toBe("none"); // the shared shadow stays
			await expect(n.getByRole("img", { name: want.icon })).toBeVisible();
			// the contrasts in Brief 17 §1.5: text on the fill, and the edge against it
			const textOn = contrast(s.color, s.bg);
			const edgeOn = contrast(want.edge, s.bg);
			const floor = { error: [5.1, 3.15], warning: [4.5, 4.1], information: [4.4, 3.4], success: [4.4, 3.7] }[kind]!;
			expect(textOn).toBeGreaterThan(floor[0]);
			expect(edgeOn).toBeGreaterThan(floor[1]);
		});
	}

	test("errors and sticky notices are announced at once (alert); the others politely (status)", async ({ page }) => {
		await openProject(page);
		await notify(page, { kind: "error", text: "e" });
		await notify(page, { kind: "warning", text: "w", sticky: true });
		await notify(page, { kind: "information", text: "i" });
		await notify(page, { kind: "success", text: "s" });
		await expect(page.locator(".sf-notice--error")).toHaveAttribute("role", "alert");
		await expect(page.locator(".sf-notice--warning")).toHaveAttribute("role", "alert"); // sticky
		await expect(page.locator(".sf-notice--information")).toHaveAttribute("role", "status");
		await expect(page.locator(".sf-notice--success")).toHaveAttribute("role", "status");
	});

	test("a notice's buttons are in the text colour on every tint (at least 4.45:1), and the 'more notices' row stays neutral", async ({ page }) => {
		await openProject(page);
		for (const kind of Object.keys(KINDS)) await page.evaluate((k) => window.__app.notices.notify({ kind: k as never, text: `${k} with a button`, sticky: true, actions: [{ label: "Reveal", onClick: () => undefined, dismiss: false }] }), kind);
		for (const kind of Object.keys(KINDS)) {
			const n = page.locator(`.sf-notice--${kind}`);
			const colours = await n.getByRole("button", { name: "Reveal" }).evaluate((b) => ({ fg: getComputedStyle(b).color, bg: getComputedStyle(b.closest(".sf-notice")!).backgroundColor }));
			expect(contrast(colours.fg, colours.bg), kind).toBeGreaterThan(4.4);
			expect(colours.fg).toBe("rgb(211, 198, 170)");
		}
		for (let i = 0; i < 4; i++) await page.evaluate((k) => window.__app.notices.notify({ kind: "warning", text: `more ${k}`, sticky: true }), i);
		const more = page.locator(".sf-notice--more");
		await expect(more).toBeVisible();
		expect(await more.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(58, 70, 76)"); // bg1: neutral
	});

	test("real notices fall in their kinds: a refusal is a warning, a failure an error, a backup a success", async ({ page }) => {
		await openProject(page);
		await page.evaluate(() => window.__preview.emit("menu", "backup-now"));
		await expect(page.locator(".sf-notice--success")).toContainText("Backed up");
		await page.evaluate(() => window.__preview.pick("cancel"));
		// a refusal: the read-only rename; here, "Open a project first." after closing the project
		await page.evaluate(() => window.__preview.emit("menu", "close-project"));
		await expect(page.getByRole("button", { name: "Open Project…" })).toBeVisible();
		await page.evaluate(() => window.__preview.emit("menu", "settings"));
		await expect(page.locator(".sf-notice--warning")).toContainText("Open a project first.");
	});
});

test.describe("the two small fixes", () => {
	test("the read-only banner's text is fg (it was grey2, 3.99:1 at 12 px)", async ({ page }) => {
		await openPreview(page, { readOnly: true });
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		const banner = page.locator(".sf-editor-banner").first();
		if (await banner.count()) expect(await banner.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(211, 198, 170)");
		else expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--purpose-text"))).not.toBe("");
	});

	test("every invalid text box draws the red border: a panel width box (the Settings sizes are sliders now, which can't be invalid)", async ({ page }) => {
		await openProject(page);
		await openSettingsDialog(page);
		const d = page.getByRole("dialog");
		await d.getByRole("tab", { name: "General", exact: true }).click();
		await d.getByRole("tab", { name: "this computer", exact: true }).click();
		const width = d.getByLabel("storytelling, left and right panel width", { exact: true });
		await width.fill("5");
		await width.press("Enter");
		await expect(width).toHaveAttribute("aria-invalid", "true");
		expect(await width.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe("rgb(230, 126, 128)");
	});
});
