import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPreview, shot, flipFace } from "./helpers";

// Brief 10, commit 3: the Codex list's look and keys, on the storytelling side (entries open in the context panel) and the
// library side (they open in the workspace). The fixture's Codex: Cast (Jane, Sam), Places (a folder that is also the note
// Harbour, holding Harbour), Windows, NoNewline and a name with other scripts.

async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const flipSide = (page: Page) => flipFace(page);
const lore = (page: Page) => page.locator(".sf-slot--lore .cm-content");
const centre = (page: Page) => page.locator(".sf-slot--centre .cm-content");

const SIDES = [
	{
		name: "storytelling side",
		show: async (_page: Page) => {},
		opened: (page: Page) => lore(page),
	},
	{
		name: "library side",
		show: async (page: Page) => {
			await flipSide(page);
			await page.getByRole("tab", { name: "codex" }).click();
		},
		opened: (page: Page) => centre(page),
	},
];

for (const side of SIDES) {
	test.describe(`the Codex list, ${side.name}`, () => {
		const tree = (page: Page) => page.getByRole("tree", { name: "Codex" });
		const row = (page: Page, name: string): Locator => tree(page).getByRole("treeitem", { name, exact: true }).first();

		test.beforeEach(async ({ page }) => {
			await openProject(page);
			await side.show(page);
			await expect(tree(page)).toBeVisible();
		});

		test("has no chevrons, and an icon sits after each name", async ({ page }) => {
			await expect(tree(page).locator(".sf-codex-toggle")).toHaveCount(0);
			for (const name of ["Jane", "Windows", "Cast"]) {
				const r = row(page, name);
				const where = await r.evaluate((el) => {
					const n = el.querySelector(".sf-codex-name")!.getBoundingClientRect();
					const icons = [...el.querySelectorAll("svg")].map((i) => i.getBoundingClientRect());
					return { nameRight: n.right, icons: icons.map((i) => i.left), first: el.firstElementChild!.className };
				});
				expect(where.first, `${name}: the name comes first`).toContain("sf-codex-name");
				expect(where.icons.length, `${name}: an icon`).toBeGreaterThan(0);
				for (const left of where.icons) expect(left, `${name}: the icon is after the name`).toBeGreaterThanOrEqual(where.nameRight - 1);
			}
			// the first icon is 1em after the end of the name (0.75em on the storytelling side, decision 84), which is only as wide as its text
			for (const name of ["Jane", "Windows", "Cast", "Harbour"]) {
				const g = await row(page, name).evaluate((el) => {
					const n = el.querySelector(".sf-codex-name") as HTMLElement;
					const r = document.createRange();
					r.selectNodeContents(n);
					const text = r.getBoundingClientRect();
					return { gap: el.querySelector("svg")!.getBoundingClientRect().left - n.getBoundingClientRect().right, nameIsText: Math.abs(n.getBoundingClientRect().width - text.width) < 1, em: parseFloat(getComputedStyle(el).fontSize) };
				});
				expect(g.nameIsText, `${name}: the name is as wide as its text`).toBe(true);
				expect(g.gap, `${name}: the gap between the name and its icon`).toBeCloseTo(side.name.startsWith("storytelling") ? 0.75 * g.em : g.em, 0);
			}
			// A note with no tag linked has no icon at all; a folder always has its folder icon.
			expect(await tree(page).locator('[data-key="Codex/NoNewline.md"] svg').count()).toBe(0);
			expect(await row(page, "Cast").locator("svg").count()).toBe(1);
			// A folder that is also a note shows its folder icon and then its type icon, both after the name.
			expect(await row(page, "Harbour").locator("svg").count()).toBe(2);
			await shot(page, `look-codex-${side.name.replace(/ /g, "-")}`);
		});

		test("a long name is cut short with an ellipsis and its icon stays in view", async ({ page }) => {
			const r = tree(page).locator('[data-key="Codex/Windows.md"]'); // by its key: the name is about to change
			await r.evaluate((el) => (el.querySelector(".sf-codex-name")!.textContent = "A very long name that cannot possibly fit beside its icon in a narrow panel ".repeat(3)));
			const m = await r.evaluate((el) => {
				const name = el.querySelector<HTMLElement>(".sf-codex-name")!;
				const icon = el.querySelector("svg")!.getBoundingClientRect();
				const box = el.getBoundingClientRect();
				return { cut: name.scrollWidth > name.clientWidth, overflow: getComputedStyle(name).textOverflow, iconRight: icon.right, boxRight: box.right, iconWidth: icon.width };
			});
			expect(m.cut).toBe(true);
			expect(m.overflow).toBe("ellipsis");
			expect(m.iconRight).toBeLessThanOrEqual(m.boxRight);
			expect(m.iconWidth).toBeGreaterThanOrEqual(15);
		});

		test("an open folder has a line beside its contents; a closed one has none; the screen reader is told which", async ({ page }) => {
			const cast = row(page, "Cast");
			await expect(cast).toHaveAttribute("aria-expanded", "true");
			const line = (name: string) =>
				page.locator(".sf-codex-folder", { has: page.getByRole("treeitem", { name, exact: true }) }).first().locator("> .sf-codex-children").evaluate((el) => {
					const b = getComputedStyle(el, "::before");
					return { shown: b.content !== "none", width: b.width, colour: b.backgroundColor };
				});
			const open = await line("Cast");
			expect(open.shown).toBe(true);
			expect(open.width).toBe("2px");
			await cast.click(); // the rest of a plain folder's row does not fold it with the mouse
			await expect(cast).toHaveAttribute("aria-expanded", "true");
			await cast.locator("svg").first().click(); // its icon does
			await expect(cast).toHaveAttribute("aria-expanded", "false");
			await expect(page.locator(".sf-codex-folder", { has: cast }).locator("> .sf-codex-children")).toHaveCount(0);
			await cast.locator("svg").first().click();
			await expect(cast).toHaveAttribute("aria-expanded", "true");
			// notes are not folders: they carry no expanded state
			expect(await row(page, "Windows").getAttribute("aria-expanded")).toBeNull();
		});

		test("the folder icon is a comfortable mouse target: as tall as the row and at least 28px wide, a pointer; a click beside the glyph inside it still folds", async ({ page }) => {
			const cast = row(page, "Cast");
			const hit = cast.locator(".sf-codex-hit");
			const [h, r, glyph, cursor] = await Promise.all([hit.boundingBox(), cast.boundingBox(), hit.locator("svg").boundingBox(), hit.evaluate((el) => getComputedStyle(el).cursor)]);
			expect(h!.width).toBeGreaterThanOrEqual(28);
			expect(h!.height).toBeGreaterThanOrEqual(r!.height - 1);
			expect(h!.height).toBeLessThanOrEqual(r!.height + 1); // never into the rows above or below
			expect(h!.width).toBeGreaterThan(glyph!.width + 8);
			expect(cursor).toBe("pointer");
			// just outside the glyph (its top-left corner of the hit area), well inside the hit area
			await page.mouse.click(h!.x + 2, h!.y + 2);
			await expect(cast).toHaveAttribute("aria-expanded", "false");
			await page.mouse.click(h!.x + h!.width - 2, h!.y + h!.height - 2);
			await expect(cast).toHaveAttribute("aria-expanded", "true");
			// and the rest of the row still does nothing with the mouse
			const name = (await cast.locator(".sf-codex-name").boundingBox())!;
			await page.mouse.click(name.x + 4, name.y + name.height / 2);
			await expect(cast).toHaveAttribute("aria-expanded", "true");
		});

		test("an open folder with nothing in it says it is empty, to the eye and to the screen reader", async ({ page }) => {
			await page.getByRole("button", { name: "New folder" }).click();
			await page.getByRole("textbox", { name: "Name of the new folder" }).fill("Ships");
			await page.keyboard.press("Enter");
			const folder = row(page, "Ships");
			await expect(folder).toBeVisible();
			const empty = folder.locator("xpath=..").getByRole("treeitem", { name: "Empty folder" }); // Ships' own (Harbour, holding only its own note, reads Empty too)
			await expect(empty).toBeVisible();
			await expect(empty).toHaveText("Empty");
			// in the muted text colour, not the row's
			const [emptyColour, nameColour] = await Promise.all([empty.evaluate((el) => getComputedStyle(el).color), row(page, "Windows").evaluate((el) => getComputedStyle(el.querySelector(".sf-codex-name")!).color)]);
			expect(emptyColour).not.toBe(nameColour);
			await shot(page, `look-codex-empty-folder-${side.name.replace(/ /g, "-")}`);
		});

		test("the keys: the arrows move between rows, → opens or goes in, ← closes or goes to the parent, Return opens or closes", async ({ page }) => {
			const cast = row(page, "Cast");
			await cast.focus();
			await page.keyboard.press("ArrowDown");
			await expect(row(page, "Jane")).toBeFocused();
			await page.keyboard.press("ArrowDown");
			await expect(row(page, "Sam")).toBeFocused();
			await page.keyboard.press("ArrowUp");
			await expect(row(page, "Jane")).toBeFocused();
			await page.keyboard.press("ArrowLeft"); // a note: to its folder
			await expect(cast).toBeFocused();
			await page.keyboard.press("ArrowLeft"); // an open folder: closes
			await expect(cast).toHaveAttribute("aria-expanded", "false");
			await expect(cast).toBeFocused();
			await expect(tree(page).getByRole("treeitem", { name: "Jane", exact: true })).toHaveCount(0);
			await page.keyboard.press("ArrowRight"); // a closed folder: opens
			await expect(cast).toHaveAttribute("aria-expanded", "true");
			await page.keyboard.press("ArrowRight"); // an open folder: goes in
			await expect(row(page, "Jane")).toBeFocused();
			await page.keyboard.press("End");
			await expect(tree(page).getByRole("treeitem").last()).toBeFocused();
			await page.keyboard.press("Home");
			await expect(cast).toBeFocused();
			await page.keyboard.press("Enter"); // a plain folder: Return closes it
			await expect(cast).toHaveAttribute("aria-expanded", "false");
			await page.keyboard.press("Enter");
			await expect(cast).toHaveAttribute("aria-expanded", "true");
		});

		test("Return on a note opens it where this side opens notes", async ({ page }) => {
			await row(page, "Windows").focus();
			await page.keyboard.press("Enter");
			await expect(side.opened(page)).toContainText("Windows");
			await expect(row(page, "Windows")).toHaveAttribute("aria-selected", "true");
		});

		test("Return on a folder that is also a note opens the note; ← and → fold it", async ({ page }) => {
			const places = row(page, "Harbour");
			await places.focus();
			await page.keyboard.press("Enter");
			await expect(side.opened(page)).toBeVisible();
			await expect(places).toHaveAttribute("aria-expanded", "true"); // opening the note did not fold it
			await places.focus(); // opening a note takes the writing's focus
			await page.keyboard.press("ArrowLeft");
			await expect(places).toHaveAttribute("aria-expanded", "false");
			await page.keyboard.press("ArrowRight");
			await expect(places).toHaveAttribute("aria-expanded", "true");
		});

		test("the list is one tab stop, and keeps the row you were on when it is redrawn", async ({ page }) => {
			const stops = () => tree(page).locator('[role="treeitem"][tabindex="0"]').count();
			expect(await stops()).toBe(1);
			await row(page, "Sam").focus();
			await row(page, "Cast").focus();
			await page.keyboard.press("Enter"); // folds Cast: the list is redrawn
			await expect(row(page, "Cast")).toHaveAttribute("aria-expanded", "false");
			await expect(row(page, "Cast")).toBeFocused();
			expect(await stops()).toBe(1);
			await expect(row(page, "Cast")).toHaveAttribute("tabindex", "0");
		});

		test("Option and the arrows still reorder, and say so", async ({ page }) => {
			const sam = row(page, "Sam");
			await expect(sam).toHaveAttribute("aria-keyshortcuts", /Alt\+ArrowUp/);
			await sam.focus();
			await page.keyboard.press("ArrowUp"); // plain: only moves focus
			await expect(row(page, "Jane")).toBeFocused();
			const order = () => tree(page).getByRole("treeitem").evaluateAll((els) => els.map((e) => e.querySelector(".sf-codex-name")?.textContent));
			const before = await order();
			expect(before.indexOf("Jane")).toBeLessThan(before.indexOf("Sam"));
			await sam.focus();
			await page.keyboard.press("Alt+ArrowUp");
			await expect.poll(async () => { const o = await order(); return o.indexOf("Sam") < o.indexOf("Jane"); }).toBe(true);
		});

		test("the rows are a proper tree: levels, and groups of children", async ({ page }) => {
			await expect(row(page, "Cast")).toHaveAttribute("aria-level", "1");
			await expect(row(page, "Jane")).toHaveAttribute("aria-level", "2");
			await expect(tree(page).getByRole("group").first()).toBeVisible();
		});
	});
}
