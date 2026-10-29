import { expect, test } from "@playwright/test";
import { openPreview } from "./helpers";

/**
 * A measurement, not a check: how long the novel overview takes to appear with 60 extended chapter cards
 * (docs/typing-aids.md, decision 47: if the field editors add more than about 100 ms, they mount only when focused).
 * Skipped unless MEASURE=1, so `npm run test:ui` never depends on how fast the machine is.
 *   MEASURE=1 npx playwright test test/ui/measure.ui.ts
 */
test.skip(!process.env.MEASURE, "a measurement: run with MEASURE=1");

const CARDS = 60;
const pad = (n: number) => String(n).padStart(2, "0");

test(`opening the novel overview with ${CARDS} extended cards`, async ({ page }) => {
	await openPreview(page);
	const files = Array.from({ length: CARDS }, (_, i) => `ch-m${pad(i + 1)}.md`);
	const entries = files.map((f, i) => `  ${f}:\n    chapter-id: c-m${pad(i + 1)}\n    chapter-title: Chapter ${i + 1}\n    plot: "A plot note for chapter ${i + 1} that runs on for long enough to wrap onto a second line when it is shown inside a card, with 'quotes' and a dash - here."`).join("\n");
	const novel = `---\nbook-id-reference: b-aaa1\nbook-title-reference: "Book #: Measured"\nseries-order-reference: 1\nchapter-order:\n${files.map((f) => `  - ${f}`).join("\n")}\nplanned-chapter-length: 2500\nchapters:\n${entries}\n---\n`;
	await page.evaluate(([p, t]) => window.__preview.touch(p, t), ["_story-library/novel-aaa.md", novel]);
	for (const f of files) await page.evaluate(([p, t]) => window.__preview.touch(p, t), [`_story-library/aaa/${f}`, `Words for ${f} in a chapter that has some text in it.\n`]);
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	// The chapters appeared while the app was closed: the opening summary says so. Dismiss it.
	const ok = page.getByRole("dialog").getByRole("button", { name: "OK" });
	if (await ok.isVisible({ timeout: 3000 }).catch(() => false)) await ok.click();
	await page.getByRole("button", { name: "Flip side" }).click();

	const times: number[] = [];
	for (let run = 0; run < 6; run++) {
		await page.getByRole("tab", { name: "series" }).click();
		await expect(page.locator(".sf-card")).toHaveCount(0);
		const t = await page.getByRole("tab", { name: "novel" }).evaluate(async (tab, n) => {
			const start = performance.now();
			(tab as HTMLElement).click();
			await new Promise<void>((resolve) => {
				const check = () => {
					const cards = document.querySelectorAll(".sf-card").length;
					const filled = [...document.querySelectorAll(".sf-note-field")].filter((f) => (("value" in f ? (f as HTMLTextAreaElement).value : f.textContent) ?? "").includes("A plot note")).length;
					if (cards >= n && filled >= n) resolve();
					else if (performance.now() - start > 8000) {
						(window as unknown as { __measureDebug: string }).__measureDebug = `cards ${cards}, filled ${filled}`;
						resolve();
					} else requestAnimationFrame(check);
				};
				check();
			});
			return performance.now() - start;
		}, CARDS);
		times.push(t);
		const debug = await page.evaluate(() => (window as unknown as { __measureDebug?: string }).__measureDebug);
		if (debug) console.log(`DEBUG ${debug}`);
	}
	const sorted = [...times].sort((a, b) => a - b);
	console.log(`MEASURED ${CARDS} cards: runs ${times.map((x) => x.toFixed(0)).join(", ")} ms; median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} ms`);
});
