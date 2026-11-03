import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 14, commit 1: the chapter bars return to the plugin's look (docs/novel-2.md): one colour, 34 px, the name drawn once over the bar
// (dark text with a 4px outer stroke in the data colour), dots for overrun flush with the fill, the marker in the bar's colour, no notch.

async function openNovel(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await expect(overview(page)).toBeVisible();
}
const overview = (page: Page) => page.getByRole("region", { name: "Novel overview" });
const setChapterLength = async (page: Page, n: number) => {
	await overview(page).getByRole("button", { name: /^[\d,]+$|Not set/ }).first().click();
	await page.keyboard.type(String(n));
	await page.keyboard.press("Enter");
};

/** WCAG contrast of two computed `rgb(...)` colours. */
const contrast = (a: string, b: string): number => {
	const lum = (c: string): number => {
		const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

test.describe("the chapter bars", () => {
	test.beforeEach(async ({ page }) => openNovel(page));

	test("34 px high with the name drawn once over the bar, one line, bottom-pinned; the series overview's bars stay 12 px", async ({ page }) => {
		const bars = overview(page).locator(".sf-card .sf-bar");
		expect(await bars.count()).toBeGreaterThan(1);
		for (let i = 0; i < (await bars.count()); i++) {
			const bar = bars.nth(i);
			expect((await bar.boundingBox())!.height).toBeCloseTo(34, 0);
			await expect(bar.locator(".sf-bar-name:not(.sf-bar-name--clear)")).toHaveCount(1); // one name layer: the two-layer split is retired (a clearance layer under it only where dots or the marker are)
			await expect(bar.locator(".sf-bar-name").first()).toHaveAttribute("aria-hidden", "true");
			await expect(bar.locator(".sf-bar-name--clear")).toHaveCount(await bar.evaluate((b) => (b.classList.contains("sf-bar--over") || b.classList.contains("sf-bar--under") ? 1 : 0)));
		}
		await expect(overview(page).locator(".sf-card-head .sf-overview-name")).toHaveCount(0); // the name is no longer above the bar
		await page.getByRole("tab", { name: "series" }).click();
		const plain = page.getByRole("region", { name: "Series overview" }).locator(".sf-bar").first();
		expect((await plain.boundingBox())!.height).toBeCloseTo(12, 0);
		await expect(plain.locator(".sf-bar-name")).toHaveCount(0);
	});

	test("the name's dark text on its data-blue backing is at least 4.5:1, by measurement", async ({ page }) => {
		const m = await overview(page).locator(".sf-card .sf-bar").first().evaluate((b) => {
			const t = getComputedStyle(b.querySelector(".sf-bar-name:not(.sf-bar-name--clear) .sf-bar-name-text")!);
			return { text: t.color, stroke: t.webkitTextStrokeColor, strokeWidth: t.webkitTextStrokeWidth, weight: t.fontWeight, size: t.fontSize, fill: getComputedStyle(b.querySelector(".sf-bar-fill")!).backgroundColor };
		});
		expect(contrast(m.text, m.stroke), "dark text on the stroke").toBeGreaterThanOrEqual(4.5);
		expect(m.stroke).toBe(m.fill); // the backing is the data colour
		expect(m).toMatchObject({ strokeWidth: "4px", weight: "600", size: "15px" }); // 2px beyond the letters (Kenny: 4px turned the i's dot and the colon into blobs); the plugin's weight; 15px is an assumption (docs/novel-2.md)
	});

	test("the stroke is never clipped: its box leaves 5px round the text, inside the bar, whatever the name", async ({ page }) => {
		const long = "A very long chapter name that cannot possibly fit across one bar however wide the window is made, so it must be cut short ".repeat(3);
		const bar = overview(page).locator(".sf-card .sf-bar").first();
		await bar.evaluate((b, text) => b.querySelectorAll(".sf-bar-name-text").forEach((n) => (n.textContent = text)), long);
		for (const [i, name] of [[0, "long"], [1, "short"]] as const) {
			const bars = overview(page).locator(".sf-card .sf-bar");
			const m = await bars.nth(i).evaluate((b) => {
				const el = b.querySelector<HTMLElement>(".sf-bar-name:not(.sf-bar-name--clear) .sf-bar-name-text")!;
				const cs = getComputedStyle(el);
				const range = document.createRange();
				range.selectNodeContents(el.firstChild!);
				const glyphs = range.getBoundingClientRect(); // the text's own box (ascent to descent)
				const box = el.getBoundingClientRect();
				const bb = b.getBoundingClientRect();
				// the visible part of the text is clipped to the element's padding box (overflow: hidden)
				return { pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat), room: { top: glyphs.top - box.top, bottom: box.bottom - Math.min(glyphs.bottom, box.bottom), left: Math.max(0, Math.min(glyphs.left, box.right) - box.left) }, inBar: { top: glyphs.top - 5 - bb.top, bottom: bb.bottom - (glyphs.bottom + 5), left: glyphs.left - 5 - bb.left }, overflowing: el.scrollWidth > el.clientWidth, ellipsis: cs.textOverflow };
			});
			expect(m.pad, `${name}: 5px of padding all round the text (the stroke is 2px, the clearance layer 5px)`).toEqual([5, 5, 5, 5]);
			expect(m.room.top, `${name}: room above the glyphs`).toBeGreaterThanOrEqual(4.5);
			expect(m.room.bottom, `${name}: room below the glyphs`).toBeGreaterThanOrEqual(4.5);
			expect(m.room.left, `${name}: room left of the glyphs`).toBeGreaterThanOrEqual(4.5);
			expect(m.inBar.top, `${name}: the stroke is inside the bar's top edge`).toBeGreaterThanOrEqual(0);
			expect(m.inBar.bottom, `${name}: the stroke is inside the bar's bottom edge`).toBeGreaterThanOrEqual(0);
			expect(m.inBar.left, `${name}: the stroke is inside the bar's left edge`).toBeGreaterThanOrEqual(0);
			expect(m.ellipsis).toBe("ellipsis");
			if (i === 0) expect(m.overflowing, "the long name is cut short").toBe(true);
		}
	});

	test("over the dots a clearance of 3px beyond the stroke is kept round every letter: no dot pixel within it, by pixels", async ({ page }) => {
		await setChapterLength(page, 3); // "The Storm: Part Two" runs from the fill into the dots
		// Measured with the track in pure magenta and the text in pure black, so no colour is ambiguous (the real dark text is near the track's grey); the geometry is unchanged.
		await page.addStyleTag({ content: ":root { --purpose-bar-track: #ff00ff !important; --purpose-text-on-data: #000000 !important; }" });
		const bar = overview(page).locator(".sf-card .sf-bar--over").nth(1);
		await page.mouse.move(2, 2);
		const fillRight = await bar.evaluate((b) => b.querySelector(".sf-bar-fill")!.getBoundingClientRect().right - b.getBoundingClientRect().left);
		const png = (await bar.screenshot()).toString("base64");
		const r = await page.evaluate(async ({ png, fillRight }) => {
			const img = new Image();
			img.src = "data:image/png;base64," + png;
			await img.decode();
			const c = document.createElement("canvas");
			c.width = img.width;
			c.height = img.height;
			const x = c.getContext("2d")!;
			x.drawImage(img, 0, 0);
			const { data, width: W, height: H } = x.getImageData(0, 0, c.width, c.height);
			const dpr = img.height / 34;
			const letter = (i: number) => data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40;
			const blue = (i: number) => Math.abs(data[i] - 127) + Math.abs(data[i + 1] - 187) + Math.abs(data[i + 2] - 179) < 30;
			const reach = Math.ceil(5 * dpr); // the clearance's whole depth: 2px of stroke and 3px beyond it
			const inner = 2.6 * dpr; // up to here a blue pixel is the stroke (and its anti-aliasing)
			const outer = 5 * dpr - 1; // from here out a blue pixel is beyond the clearance
			let letters = 0;
			let dotsInside = 0;
			let dotsSeen = 0;
			for (let y = 3; y < H - 3; y++) {
				for (let px = Math.ceil(fillRight * dpr) + 2; px < W - 3; px++) {
					const i = (y * W + px) * 4;
					if (!blue(i)) continue;
					dotsSeen++;
					// the distance to the nearest letter pixel
					let nearest = 99;
					for (let dy = -reach; dy <= reach && nearest > inner; dy++) {
						for (let dx = -reach; dx <= reach; dx++) {
							const yy = y + dy;
							const xx = px + dx;
							if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
							if (letter((yy * W + xx) * 4)) nearest = Math.min(nearest, Math.hypot(dx, dy));
						}
					}
					if (nearest > inner && nearest < outer) dotsInside++;
				}
			}
			for (let y = 3; y < H - 3; y++) for (let px = 3; px < W - 3; px++) if (letter((y * W + px) * 4)) letters++;
			return { letters, dotsInside, dotsSeen };
		}, { png, fillRight });
		expect(r.letters, "letters were found in the picture").toBeGreaterThan(100);
		expect(r.dotsSeen, "dots and strokes were found beyond the fill").toBeGreaterThan(100);
		expect(r.dotsInside, "no blue (dot) pixel between the stroke and 5px from a letter").toBe(0);
	});

	test("each dot is round with a solid centre: its centre device pixels are the full data colour; only edge pixels are blended", async ({ page }) => {
		await setChapterLength(page, 3);
		await page.mouse.move(2, 2);
		const bar = overview(page).locator(".sf-card .sf-bar--over").first(); // Chapter 1: dots from the target to its end, its name short at the left
		const dots = bar.locator(".sf-bar-dots");
		const left = await dots.evaluate((e) => e.getBoundingClientRect().left);
		expect(Math.abs(left - Math.round(left)), "the dots start on a whole CSS pixel").toBeLessThan(0.01);
		const colours = await page.evaluate(() => { const c = (v: string) => { const i = document.createElement("i"); i.style.color = v; document.body.append(i); const x = getComputedStyle(i).color; i.remove(); return x; }; return { blue: c("var(--purpose-data-fill)"), track: c("var(--purpose-bar-track)") }; });
		const png = (await dots.screenshot()).toString("base64");
		const r = await page.evaluate(async ({ png, colours }) => {
			const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
			const blue = rgb(colours.blue);
			const track = rgb(colours.track);
			const img = new Image();
			img.src = "data:image/png;base64," + png;
			await img.decode();
			const c = document.createElement("canvas");
			c.width = img.width;
			c.height = img.height;
			const x = c.getContext("2d")!;
			x.drawImage(img, 0, 0);
			const { data, width: W, height: H } = x.getImageData(0, 0, c.width, c.height);
			const dpr = W / (document.querySelector(".sf-bar-dots") as HTMLElement).getBoundingClientRect().width;
			const near = (px: number, py: number, col: number[]) => { const i = (py * W + px) * 4; return Math.abs(data[i] - col[0]) + Math.abs(data[i + 1] - col[1]) + Math.abs(data[i + 2] - col[2]) <= 6; };
			let centres = 0;
			let solid = 0;
			let corners = 0;
			const block = (bx: number, by: number) => [[bx, by], [bx + 1, by], [bx, by + 1], [bx + 1, by + 1]].every(([a, b]) => near(a, b, blue));
			// the lattice: centres at (8k, 1 + 8m) and (4 + 8k, 5 + 8m) CSS px from the dots' left edge and top (the top can sit between device pixels, so each
			// dot's solid 2 by 2 centre is looked for within a device pixel of where it should be); whole dots only (skip the half dots at the seam and the ends)
			for (const [ox, oy] of [[0, 1], [4, 5]]) {
				for (let cx = ox + 16; cx < W / dpr - 16; cx += 8) {
					for (let cy = oy; cy < 34 - 1; cy += 8) {
						const px = Math.round(cx * dpr);
						const py = Math.round(cy * dpr);
						if (py < 4 || py > H - 4) continue;
						centres++;
						let found: [number, number] | null = null;
						for (let dy = -2; dy <= 1 && !found; dy++) for (let dx = -2; dx <= 1 && !found; dx++) if (block(px + dx, py + dy)) found = [px + dx, py + dy];
						if (!found) continue;
						solid++;
						// round, not square: the full-colour pixels of this dot (flood-filled from its centre) have a bounding box whose four corners are anti-aliased
						const seen = new Set<string>();
						const queue: [number, number][] = [found];
						let [x0, y0, x1, y1] = [found[0], found[1], found[0], found[1]];
						while (queue.length) {
							const [qx, qy] = queue.pop()!;
							if (seen.has(qx + "," + qy) || Math.abs(qx - px) > 5 || Math.abs(qy - py) > 5 || !near(qx, qy, blue)) continue;
							seen.add(qx + "," + qy);
							[x0, y0, x1, y1] = [Math.min(x0, qx), Math.min(y0, qy), Math.max(x1, qx), Math.max(y1, qy)];
							queue.push([qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]);
						}
						if ([[x0, y0], [x1, y0], [x0, y1], [x1, y1]].every(([a, b]) => !near(a, b, blue))) corners++;
					}
				}
			}
			return { centres, solid, corners, track: near(0, 0, track) };
		}, { png, colours });
		expect(r.centres, "dots were found").toBeGreaterThan(100);
		expect(r.solid, "every dot's centre pixels are the full data colour").toBe(r.centres);
		expect(r.corners, "the dots are round: their corner pixels are not full colour").toBe(r.centres);
	});

	test("past its plan: dots in the bar's own colour flush with the fill, no notch, no orange; short of it: the dashed marker in the bar's colour", async ({ page }) => {
		await setChapterLength(page, 4);
		const over = overview(page).locator(".sf-bar--over").first();
		await expect(over.locator(".sf-bar-dots")).toBeAttached();
		await expect(overview(page).locator(".sf-bar-notch, .sf-bar-over, .sf-bar-marker")).toHaveCount(0);
		const m = await over.evaluate((b) => {
			const fill = b.querySelector<HTMLElement>(".sf-bar-fill")!.getBoundingClientRect();
			const dots = b.querySelector<HTMLElement>(".sf-bar-dots")!;
			const r = dots.getBoundingClientRect();
			const cs = getComputedStyle(dots);
			return { gap: r.left - fill.right, width: r.width, bg: cs.backgroundColor, left: r.left, fillColour: getComputedStyle(b.querySelector(".sf-bar-fill")!).backgroundColor };
		});
		expect(Math.abs(m.gap), "no gap between the fill and the dots").toBeLessThan(0.6);
		expect(((m.width - 1) / 4) % 1, "whole dots only: the width is 4n+1").toBeCloseTo(0, 1);
		const probe = await page.evaluate(() => { const i = document.createElement("i"); i.style.color = "var(--purpose-data-fill)"; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; });
		expect(m.fillColour).toBe(probe);
		expect(m.bg).toBe(probe); // the dots are solid data colour (a mask gives them their shape)
		expect(Number.isInteger(Math.round(m.left * 100) / 100) , "the dots start on a whole CSS pixel").toBe(true);
		await setChapterLength(page, 15);
		await expect(overview(page).locator(".sf-bar--under .sf-bar-marker").first()).toBeAttached();
		const stroke = await overview(page).locator(".sf-bar-marker").first().evaluate((e) => getComputedStyle(e).stroke);
		expect(stroke).toBe(probe);
	});

	test("a long name is one line, cut short with an ellipsis; the tooltip has the full name", async ({ page }) => {
		const bar = overview(page).locator(".sf-card .sf-bar").first();
		const css = await bar.locator(".sf-bar-name:not(.sf-bar-name--clear) .sf-bar-name-text").evaluate((e) => { const s = getComputedStyle(e); return { ws: s.whiteSpace, to: s.textOverflow, ov: s.overflow }; });
		expect(css).toEqual({ ws: "nowrap", to: "ellipsis", ov: "hidden" });
		await overview(page).locator(".sf-card .sf-bar").nth(1).hover();
		await expect(page.getByRole("tooltip")).toContainText("The Storm: Part Two");
	});
});
