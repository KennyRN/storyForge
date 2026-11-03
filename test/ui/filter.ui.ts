import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { flipFace, openPreview, shot } from "./helpers";

// The Codex filter by type (decision 107). The fixture's Codex: Cast (Jane and Sam, people), Places (a folder that is also the note
// Harbour, a place), Windows (a populace), NoNewline and a name in other scripts (both untyped). Retired is archived and untyped.

const CODEX_MD = "_backstage/storyforge/codex.md";

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const tree = (page: Page) => page.getByRole("tree", { name: "Codex" });
const row = (page: Page, name: string): Locator => tree(page).getByRole("treeitem", { name, exact: true });
const popover = (page: Page) => page.getByRole("menu", { name: "Filter by type" });
const filterButton = (page: Page) => page.getByRole("button", { name: "Filter by type" });
const purpose = (page: Page, v: string) => page.evaluate((x) => { const d = document.createElement("i"); d.style.color = `var(--purpose-${x})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, v);
const color = (l: Locator) => l.evaluate((e) => getComputedStyle(e).color);
const shownNames = (page: Page) => tree(page).getByRole("treeitem").evaluateAll((els) => els.map((e) => (e.querySelector(".sf-codex-name") ?? e).textContent!.trim()));
const tick = (page: Page, name: string) => popover(page).getByRole("menuitemcheckbox", { name, exact: true }).click();

const LISTS = [
	{ name: "the storytelling Codex list", show: async (_: Page) => {} },
	{ name: "the library's Codex list", show: async (page: Page) => (await flipFace(page), await page.getByRole("tab", { name: "codex" }).click()) },
];

/** Every file under the project folder, with a hash of what it holds. */
function folderState(root: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const full = path.join(dir, name);
			if (statSync(full).isDirectory()) walk(full);
			else out.set(path.relative(root, full), createHash("sha1").update(readFileSync(full)).digest("hex"));
		}
	};
	walk(root);
	return out;
}
const root = async (page: Page) => (await page.evaluate(() => window.__preview.root()))!;

for (const list of LISTS) {
	test.describe(`the filter, ${list.name}`, () => {
		test.beforeEach(async ({ page }) => {
			await openProject(page);
			await list.show(page);
			await expect(tree(page)).toBeVisible();
		});

		test("is the third icon in the strip, under New Folder and New Note, named Filter by type, with a lowercase tooltip", async ({ page }) => {
			const names = await page.locator(".sf-codex-strip button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
			expect(names).toEqual(["New folder", "New note", "Filter by type"]);
			const tops = await page.locator(".sf-codex-strip button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
			expect(tops[0]).toBeLessThan(tops[1]);
			expect(tops[1]).toBeLessThan(tops[2]);
			await expect(filterButton(page)).toHaveAttribute("aria-haspopup", "menu");
			await filterButton(page).hover();
			await expect(page.getByRole("tooltip")).toHaveText("filter by type");
		});

		test("the popover: Show all, then Untyped, then each type with its icon and a tick; ticking applies at once and it stays open", async ({ page }) => {
			await filterButton(page).click();
			await expect(popover(page)).toBeVisible();
			const items = await popover(page).locator('[role="menuitem"], [role="menuitemcheckbox"]').allInnerTexts();
			expect(items.map((t) => t.trim())).toEqual(["Show all", "Untyped", "Person", "Place", "Populace"]);
			await expect(popover(page).getByRole("menuitem", { name: "Show all" })).toBeFocused();
			for (const t of ["Person", "Place", "Populace"]) await expect(popover(page).getByRole("menuitemcheckbox", { name: t, exact: true }).locator("svg").first()).toBeVisible();
			await shot(page, `filter-popover-${list.name.replace(/[^a-z]/gi, "-")}`);
			await tick(page, "Person");
			await expect(popover(page)).toBeVisible(); // stays open
			await expect(popover(page).getByRole("menuitemcheckbox", { name: "Person", exact: true })).toHaveAttribute("aria-checked", "true");
			expect(await shownNames(page)).toEqual(["Cast", "Jane", "Sam"]); // applied at once
			// several at once, either matching
			await tick(page, "Place");
			expect(await shownNames(page)).toEqual(["Cast", "Jane", "Sam", "Harbour"]);
			await tick(page, "Person");
			expect(await shownNames(page)).toEqual(["Harbour"]);
		});

		test("Untyped shows the notes with no type; Show all clears everything", async ({ page }) => {
			await filterButton(page).click();
			await tick(page, "Untyped");
			expect(await shownNames(page)).toEqual(["NoNewline", "Zoë Åberg — 日本語"]);
			await tick(page, "Populace");
			expect(await shownNames(page)).toEqual(["Windows", "NoNewline", "Zoë Åberg — 日本語"]);
			await popover(page).getByRole("menuitem", { name: "Show all" }).click();
			expect((await shownNames(page)).length).toBeGreaterThan(7);
			for (const t of ["Untyped", "Person", "Place", "Populace"]) await expect(popover(page).getByRole("menuitemcheckbox", { name: t, exact: true })).toHaveAttribute("aria-checked", "false");
		});

		test("the icon is the Codex colour while anything is chosen, and rests like its neighbours otherwise", async ({ page }) => {
			await page.mouse.move(700, 700);
			expect(await color(filterButton(page))).toBe(await purpose(page, "codex-rest"));
			await filterButton(page).click();
			await tick(page, "Person");
			await page.keyboard.press("Escape");
			await page.mouse.move(700, 700);
			await expect.poll(() => color(filterButton(page))).toBe(await purpose(page, "codex")); // the colour fades in
			await shot(page, `filter-active-${list.name.replace(/[^a-z]/gi, "-")}`);
			await filterButton(page).click();
			await popover(page).getByRole("menuitem", { name: "Show all" }).click();
			await page.keyboard.press("Escape");
			await filterButton(page).evaluate((e) => (e as HTMLElement).blur()); // keyboard focus on it is the Codex colour, by design
			await page.mouse.move(700, 700);
			await expect.poll(() => color(filterButton(page))).toBe(await purpose(page, "codex-rest"));
		});

		test("keys: the arrows move, Space ticks, Escape closes and returns focus to the button; a click outside closes it", async ({ page }) => {
			await filterButton(page).focus();
			await page.keyboard.press("Enter");
			await expect(popover(page)).toBeVisible();
			await page.keyboard.press("ArrowDown"); // Untyped
			await page.keyboard.press("ArrowDown"); // Person
			await expect(popover(page).getByRole("menuitemcheckbox", { name: "Person", exact: true })).toBeFocused();
			await page.keyboard.press("Space");
			expect(await shownNames(page)).toEqual(["Cast", "Jane", "Sam"]);
			await page.keyboard.press("End");
			await expect(popover(page).getByRole("menuitemcheckbox", { name: "Populace", exact: true })).toBeFocused();
			await page.keyboard.press("Escape");
			await expect(popover(page)).toHaveCount(0);
			await expect(filterButton(page)).toBeFocused();
			await filterButton(page).click();
			await expect(popover(page)).toBeVisible();
			await page.mouse.click(700, 500);
			await expect(popover(page)).toHaveCount(0);
		});

		test("folders: one with a match inside shows, an empty folder and a folder with nothing matching go, and there is no Empty line", async ({ page }) => {
			expect(await tree(page).getByText("Empty", { exact: true }).count()).toBe(1); // unfiltered, the note-folder says so
			await filterButton(page).click();
			await tick(page, "Place");
			expect(await shownNames(page)).toEqual(["Harbour"]);
			await expect(tree(page).getByText("Empty", { exact: true })).toHaveCount(0);
			await expect(row(page, "Cast")).toHaveCount(0);
			await shot(page, `filter-folder-note-${list.name.replace(/[^a-z]/gi, "-")}`);
		});

		test("rows are only what is drawn: the arrow keys walk the filtered list and stop at its ends", async ({ page }) => {
			await filterButton(page).click();
			await tick(page, "Person");
			await page.keyboard.press("Escape");
			await row(page, "Cast").focus();
			await page.keyboard.press("ArrowDown");
			await expect(row(page, "Jane")).toBeFocused();
			await page.keyboard.press("ArrowDown");
			await expect(row(page, "Sam")).toBeFocused();
			await page.keyboard.press("ArrowDown");
			await expect(row(page, "Sam")).toBeFocused(); // nothing below it: the hidden rows are not there
			await page.keyboard.press("End");
			await expect(row(page, "Sam")).toBeFocused();
			await expect(tree(page).getByRole("treeitem")).toHaveCount(3);
		});

		test("a note or folder created while filtered stays shown until the filter next changes", async ({ page }) => {
			await filterButton(page).click();
			await tick(page, "Person");
			await page.keyboard.press("Escape");
			await page.getByRole("button", { name: "New note" }).click();
			await page.getByRole("textbox", { name: "Name of the new note" }).fill("Fresh");
			await page.keyboard.press("Enter");
			await expect(row(page, "Fresh")).toBeVisible(); // it has no type, yet it is shown
			await page.getByRole("button", { name: "New folder" }).click();
			await page.getByRole("textbox", { name: "Name of the new folder" }).fill("Tidy");
			await page.keyboard.press("Enter");
			await expect(row(page, "Tidy")).toBeVisible(); // an empty folder, shown
			await expect(row(page, "Fresh")).toBeVisible();
			await filterButton(page).click();
			await tick(page, "Place"); // the filter changes: they go
			await expect(row(page, "Fresh")).toHaveCount(0);
			await expect(row(page, "Tidy")).toHaveCount(0);
			await tick(page, "Place"); // back to Person alone: still gone, since they were let go when the filter changed
			await expect(row(page, "Fresh")).toHaveCount(0);
			await expect(row(page, "Tidy")).toHaveCount(0);
			expect(await shownNames(page)).toEqual(["Cast", "Jane", "Sam"]);
		});
	});
}

test.describe("the filter, across lists and sessions", () => {
	test("each list has its own filter, and it is kept while flipping; a new open starts with none", async ({ page }) => {
		await openProject(page);
		await filterButton(page).click();
		await tick(page, "Person");
		await page.keyboard.press("Escape");
		expect(await shownNames(page)).toEqual(["Cast", "Jane", "Sam"]);
		await flipFace(page);
		await page.getByRole("tab", { name: "codex" }).click();
		expect((await shownNames(page)).length).toBeGreaterThan(7); // the library's list is unfiltered
		await filterButton(page).click();
		await tick(page, "Untyped");
		await page.keyboard.press("Escape");
		expect(await shownNames(page)).toEqual(["NoNewline", "Zoë Åberg — 日本語"]);
		await page.getByRole("tab", { name: "archive" }).click();
		await page.getByRole("tab", { name: "codex" }).click();
		expect(await shownNames(page)).toEqual(["NoNewline", "Zoë Åberg — 日本語"]); // kept across tabs
		await flipFace(page);
		expect(await shownNames(page)).toEqual(["Cast", "Jane", "Sam"]); // the storytelling list's own
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		expect((await shownNames(page)).length).toBeGreaterThan(7); // session only: every open starts unfiltered
	});

	test("a folder whose own note matches shows with nothing inside it matching, and with no Empty line", async ({ page }) => {
		await openPreview(page);
		const text = (await page.evaluate((p) => window.__preview.read(p), CODEX_MD)).replace("      - Codex/Harbour.md\n    linkedNotePath", "      - Codex/Windows.md\n    linkedNotePath");
		expect(text).toContain("Codex/Windows.md");
		await page.evaluate(([p, t]) => window.__preview.touch(p, t), [CODEX_MD, text]);
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await filterButton(page).click();
		await tick(page, "Place"); // Harbour (the folder's own note) is a place; the Windows inside it are not
		await page.keyboard.press("Escape");
		expect(await shownNames(page)).toEqual(["Harbour"]);
		await expect(tree(page).getByText("Empty", { exact: true })).toHaveCount(0);
		await shot(page, "filter-kept-folder-note");
	});

	test("the Archive has the same button and filters the archived Codex items, matching a nested type under its parent", async ({ page }) => {
		await openProject(page);
		await flipFace(page);
		await page.getByRole("tab", { name: "archive" }).click();
		const section = page.getByRole("region", { name: "Archived Codex items" });
		await expect(section).toContainText("Retired");
		const names = await page.locator(".sf-codex-strip button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
		expect(names).toEqual(["Filter by type"]);
		await filterButton(page).click();
		await tick(page, "Person");
		await page.keyboard.press("Escape");
		await expect(section).toContainText("Nothing archived matches the filter.");
		await expect(section).not.toContainText("Retired");
		await expect(page.getByRole("region", { name: /Archived chapters of/ }).first()).toBeVisible(); // chapters have no type: untouched
		await filterButton(page).click();
		await tick(page, "Untyped");
		await page.keyboard.press("Escape");
		await expect(section).toContainText("Retired");
		await page.mouse.move(700, 700);
		await expect.poll(() => color(filterButton(page))).toBe(await purpose(page, "codex"));
		await shot(page, "filter-archive");
	});

	test("filtering, clearing and creating under a filter write nothing: the project folder is byte for byte as it was, apart from what was created", async ({ page }) => {
		await openProject(page);
		const dir = await root(page);
		const before = folderState(dir);
		await filterButton(page).click();
		await tick(page, "Person");
		await tick(page, "Untyped");
		await tick(page, "Person");
		await popover(page).getByRole("menuitem", { name: "Show all" }).click();
		await tick(page, "Place");
		await page.keyboard.press("Escape");
		await page.waitForTimeout(600);
		expect(folderState(dir)).toEqual(before); // identical after filtering and clearing
		await page.getByRole("button", { name: "New note" }).click();
		await page.getByRole("textbox", { name: "Name of the new note" }).fill("Fresh");
		await page.keyboard.press("Enter");
		await expect(row(page, "Fresh")).toBeVisible();
		await page.waitForTimeout(600);
		const after = folderState(dir);
		const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
		expect(changed.filter((k) => !/Fresh\.md$/.test(k) && !/codex\.md$/.test(k)), `only the new note, and the Codex index that lists it (changed: ${changed.join(", ")})`).toEqual([]);
		expect(changed.some((k) => /Fresh\.md$/.test(k))).toBe(true);
	});

	test("a read-only project can still filter", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => window.__preview.touch("_backstage/storyforge/project.md", "---\nformat-version: 99\n---\n"));
		await page.reload();
		await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
		await page.locator("[data-recent='0']").click();
		await page.waitForFunction(() => !!window.__app?.editors);
		await expect(filterButton(page)).toBeEnabled();
		await filterButton(page).click();
		await tick(page, "Person");
		expect(await shownNames(page)).toEqual(["Cast", "Jane", "Sam"]);
	});
});
