import { expect, test, type Page } from "@playwright/test";
import { openPreview, shot } from "./helpers";

const CODEX = "_backstage/storyforge/codex.md";
const BOOK = "_story-library/novel-aaa.md";

async function openProject(page: Page, options: Parameters<typeof openPreview>[1] = {}): Promise<void> {
	await openPreview(page, options);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const reopen = async (page: Page) => {
	await page.waitForTimeout(600); // where you were is saved a moment after it changes
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
};
const onDisk = (page: Page, path: string) => page.evaluate((p) => window.__preview.read(p), path);
const centre = (page: Page) => page.locator(".sf-slot--centre .cm-content");
const lore = (page: Page) => page.locator(".sf-slot--lore .cm-content");
const codexRow = (page: Page, name: string) => page.locator(".sf-codex-tree [data-key]").filter({ hasText: name }).first();

test.describe("the storytelling face", () => {
	test("opens with the navigator, the Codex and the stats on the left, and the chapter in the centre", async ({ page }) => {
		await openProject(page);
		await expect(page.locator(".sf-nav-novel")).toHaveText("Book 1: The Harbour Wakes");
		await expect(page.locator(".sf-nav-current-title")).toHaveText("Chapter 1");
		await expect(page.getByRole("tree", { name: "Codex" })).toBeVisible();
		await expect(page.locator(".sf-stats-value")).toContainText("daily:");
		await expect(centre(page)).toContainText("Synthetic sentence number 1");
		await expect(page.locator(".sf-slot--lore")).toBeVisible(); // there from the start, blank
		await expect(page.locator(".sf-lore-host")).toBeEmpty(); // nothing in it but the special-characters button beside it
		await expect(page.getByRole("button", { name: "Special characters", exact: true })).toBeVisible();
		await shot(page, "storytelling");
	});

	test("the Codex shows its virtual folders, order and type icons", async ({ page }) => {
		await openProject(page);
		const tree = page.locator(".sf-codex-tree");
		await expect(tree.locator(".sf-codex-folder-header")).toHaveText(["Cast", "Harbour"]);
		await expect(tree.locator(".sf-codex-file .sf-codex-name")).toContainText(["Jane", "Sam", "Harbour", "Windows"]);
		await expect(codexRow(page, "Jane").locator("svg").first()).toBeVisible();
		await expect(tree.getByText("Retired")).toHaveCount(0); // archived
	});

	test("the chapter selector expands to the novel's chapters; choosing one opens it in the centre", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).click();
		const rows = page.locator(".sf-nav-row");
		await expect(rows).toHaveCount(4); // three placed and one unplaced
		await rows.filter({ hasText: "The Storm: Part Two" }).click();
		await expect(centre(page)).toContainText("Opening line of a second chapter");
		await expect(page.locator(".sf-nav-current-title")).toHaveText("The Storm: Part Two");
		expect(await page.evaluate(() => window.__app.editors!.pathIn("centre"))).toBe("_story-library/aaa/ch-a2.md");
	});

	test("the list is reachable with the keyboard", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).focus();
		await page.keyboard.press("Enter");
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");
		await page.keyboard.press("Enter");
		await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("centre"))).toBe("_story-library/aaa/ch-a2.md");
	});

	test("'Add the next chapter' appends a chapter after the current one and opens it", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Add the next chapter" }).click();
		await expect.poll(() => page.evaluate(() => window.__app.editors!.pathIn("centre"))).not.toBe("_story-library/aaa/ch-a1.md");
		const book = await onDisk(page, BOOK);
		const order = /chapter-order:\n((?:  - .*\n)+)/.exec(book)![1].trim().split("\n").map((l) => l.replace(/^\s*- /, ""));
		expect(order).toHaveLength(4);
		expect(order[0]).toBe("ch-a1.md");
		expect(order[1]).not.toBe("ch-a2.md"); // after the current chapter (Chapter 1), before the rest
		const opened = await page.evaluate(() => window.__app.editors!.pathIn("centre"));
		expect(opened).toBe(`_story-library/aaa/${order[1]}`);
	});

	test("where you were comes back: the chapter, the panel widths, collapsed Codex folders", async ({ page }) => {
		await openProject(page);
		await page.getByRole("button", { name: "Chapters" }).click();
		await page.locator(".sf-nav-row").filter({ hasText: "The Storm: Part Two" }).click();
		await page.locator(".sf-codex-folder-header", { hasText: "Cast" }).click();
		await expect(codexRow(page, "Jane")).toHaveCount(0);
		const bar = page.getByRole("separator", { name: "Resize the left panel" });
		await bar.focus();
		for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
		const width = await page.locator(".sf-left").evaluate((e) => e.getBoundingClientRect().width);
		expect(width).toBeCloseTo(288 + 80, 0);
		await reopen(page);
		await expect(page.locator(".sf-nav-current-title")).toHaveText("The Storm: Part Two");
		await expect(codexRow(page, "Jane")).toHaveCount(0);
		expect(await page.locator(".sf-left").evaluate((e) => e.getBoundingClientRect().width)).toBeCloseTo(width, 0);
	});

	test("the panels resize by dragging the splitter, within limits", async ({ page }) => {
		await openProject(page);
		const bar = page.getByRole("separator", { name: "Resize the left panel" });
		const box = (await bar.boundingBox())!;
		await page.mouse.move(box.x, box.y + 200);
		await page.mouse.down();
		await page.mouse.move(box.x + 100, box.y + 200, { steps: 5 });
		await page.mouse.up();
		expect(await page.locator(".sf-left").evaluate((e) => e.getBoundingClientRect().width)).toBeCloseTo(388, -1);
		await bar.focus();
		for (let i = 0; i < 30; i++) await page.keyboard.press("Shift+ArrowRight");
		expect(await page.locator(".sf-left").evaluate((e) => e.getBoundingClientRect().width)).toBe(480);
	});

	test.describe("the lore slot", () => {
		test("clicking a Codex entry opens it in the lore slot; clicking it again closes it; another replaces it", async ({ page }) => {
			await openProject(page);
			await codexRow(page, "Jane").click();
			await expect(lore(page)).toBeVisible();
			await expect(page.locator(".sf-slot--lore")).toBeVisible();
			await expect(codexRow(page, "Jane")).toHaveClass(/is-active/);
			await expect(centre(page)).toContainText("Synthetic sentence number 1"); // the chapter stays
			await shot(page, "storytelling-lore");
			await codexRow(page, "Jane").click();
			await expect(lore(page)).toHaveCount(0);
			await expect(page.locator(".sf-slot--lore")).toBeVisible(); // closed, still there, blank
			await codexRow(page, "Sam").click();
			await expect(lore(page)).toBeVisible();
			await codexRow(page, "Windows").click();
			await expect(codexRow(page, "Windows")).toHaveClass(/is-active/);
			await expect(codexRow(page, "Sam")).not.toHaveClass(/is-active/);
			const sessions = await page.evaluate(() => window.__app.running!.opened.writer.openSessions().map((s) => s.path).sort());
			expect(sessions).toEqual(["Codex/Windows.md", "_story-library/aaa/ch-a1.md"]);
		});

		test("a note open in the lore slot is edited and saved there, with its frontmatter kept", async ({ page }) => {
			await openProject(page);
			await codexRow(page, "Jane").click();
			await lore(page).click();
			await page.keyboard.press("ControlOrMeta+ArrowDown");
			await page.keyboard.type(" Written beside the chapter.");
			await expect.poll(() => onDisk(page, "Codex/Jane.md"), { timeout: 4000 }).toContain("Written beside the chapter.");
			const text = await onDisk(page, "Codex/Jane.md");
			expect(text.startsWith("---\naliases:\n  - J\n  - \"Jay: the first\"\ntags: [hero]\ncustom-key: kept\n---\n")).toBe(true);
		});

		test("a folder that is also a note opens the note when its row is clicked, and folds when its folder icon is", async ({ page }) => {
			await openProject(page);
			const row = page.locator(".sf-codex-folder-header", { hasText: "Harbour" });
			await row.click();
			await expect(lore(page)).toBeVisible();
			await row.locator("svg").first().click(); // the folder icon, after the name: there are no chevrons
			await expect(page.locator(".sf-codex-file", { hasText: "Harbour" })).toHaveCount(0);
		});
	});

	test.describe("the Codex pane", () => {
		test("new folder and new note are named in the list, and a new note opens in the lore slot (the strip: strip.ui.ts)", async ({ page }) => {
			await openProject(page);
			await page.getByRole("button", { name: "New folder" }).click();
			await page.getByRole("textbox", { name: "Name of the new folder" }).fill("Ships");
			await page.keyboard.press("Enter");
			await expect(page.locator(".sf-codex-folder-header", { hasText: "Ships" })).toBeVisible();
			await page.getByRole("button", { name: "New note" }).click();
			await page.getByRole("textbox", { name: "Name of the new note" }).fill("Lantern");
			await page.keyboard.press("Enter");
			await expect(lore(page)).toBeVisible();
			await expect(codexRow(page, "Lantern")).toBeVisible();
			expect(await onDisk(page, "Codex/Lantern.md")).toBe("");
		});

		test("a folder is renamed in place from its context menu", async ({ page }) => {
			await openProject(page);
			await page.locator(".sf-codex-folder-header", { hasText: "Cast" }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Rename" }).click();
			await page.getByLabel("Name").fill("People");
			await page.keyboard.press("Enter");
			await expect(page.locator(".sf-codex-folder-header", { hasText: "People" })).toBeVisible();
			expect(await onDisk(page, CODEX)).toContain("name: People");
		});

		test("Set type… changes the type; Archive moves the note out of the tree", async ({ page }) => {
			await openProject(page);
			await codexRow(page, "Windows").click({ button: "right" });
			await page.getByRole("menuitem", { name: "Set type…" }).click();
			await page.getByRole("menuitem", { name: "Place" }).click();
			await expect.poll(() => onDisk(page, CODEX)).toContain("Codex/Windows.md: place");
			await codexRow(page, "Windows").click({ button: "right" });
			await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
			await expect(codexRow(page, "Windows")).toHaveCount(0);
			expect(await onDisk(page, CODEX)).toMatch(/archive:\n(?:  - .*\n)*  - Codex\/Windows\.md/);
		});

		test("dragging an entry above another reorders it", async ({ page }) => {
			await openProject(page);
			const sam = (await codexRow(page, "Sam").boundingBox())!;
			const jane = (await codexRow(page, "Jane").boundingBox())!;
			await page.mouse.move(sam.x + 60, sam.y + sam.height / 2);
			await page.mouse.down();
			await page.mouse.move(sam.x + 60, sam.y - 4, { steps: 4 });
			await page.mouse.move(jane.x + 60, jane.y + 3, { steps: 6 });
			await page.mouse.up();
			await expect.poll(async () => {
				const t = await onDisk(page, CODEX);
				return t.indexOf("Codex/Sam.md") < t.indexOf("Codex/Jane.md");
			}).toBe(true);
		});

		test("rows can be reached by keyboard and moved with Option and the arrow keys", async ({ page }) => {
			await openProject(page);
			await codexRow(page, "Sam").focus();
			await page.keyboard.press("Alt+ArrowUp"); // the plain arrows move between rows (codex.ui.ts)
			await expect.poll(async () => {
				const t = await onDisk(page, CODEX);
				return t.indexOf("Codex/Sam.md") < t.indexOf("Codex/Jane.md");
			}).toBe(true);
		});
	});

	test.describe("the stats", () => {
		test("show the daily, weekly, chapter and novel counts one at a time, with a switch", async ({ page }) => {
			await openProject(page);
			const value = page.locator(".sf-stats-value");
			await expect(value).toHaveText(/^daily: /);
			await page.getByRole("button", { name: "Switch wordcount" }).click();
			await expect(value).toHaveText(/^weekly: /);
			await page.getByRole("button", { name: "Switch wordcount" }).click();
			await expect(value).toHaveText("chapter: 22"); // Chapter 1 has 22 words
			await page.getByRole("button", { name: "Switch wordcount" }).click();
			await expect(value).toHaveText(/^novel: \d/);
		});

		test("the chapter count follows typing once it is saved", async ({ page }) => {
			await openProject(page);
			await page.getByRole("button", { name: "Switch wordcount" }).click();
			await page.getByRole("button", { name: "Switch wordcount" }).click();
			await expect(page.locator(".sf-stats-value")).toHaveText("chapter: 22");
			await centre(page).click();
			await page.keyboard.press("ControlOrMeta+ArrowDown");
			await page.keyboard.type(" three more words");
			await expect(page.locator(".sf-stats-value")).toHaveText("chapter: 25", { timeout: 6000 });
		});
	});

	test("in a read-only project the creating controls are off, with a reason", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(page.getByRole("button", { name: "Add the next chapter" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "New note" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "New folder" })).toBeDisabled();
		await expect(centre(page)).toHaveAttribute("contenteditable", "false");
	});
});
