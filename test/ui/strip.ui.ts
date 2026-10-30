import { expect, test, type Page } from "@playwright/test";
import { openPreview } from "./helpers";

// Brief 10, commit 4: the strip of buttons down the Codex list's left edge, and naming a new folder or note in place
// (decision 56, rulings 5 and 7): nothing is created until the name is confirmed with Return; Escape creates nothing.

const CODEX = "_backstage/storyforge/codex.md";
async function openProject(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
}
const flipSide = (page: Page) => page.getByRole("button", { name: "Flip side" }).click();
const onDisk = (page: Page, path: string): Promise<string | null> => page.evaluate((p) => window.__preview.read(p).catch(() => null), path);
const tree = (page: Page) => page.getByRole("tree", { name: "Codex" });
const noteBox = (page: Page) => page.getByRole("textbox", { name: "Name of the new note" });
const folderBox = (page: Page) => page.getByRole("textbox", { name: "Name of the new folder" });

const SIDES = [
	{ name: "storytelling side", show: async (_p: Page) => {}, opened: (p: Page) => p.locator(".sf-slot--lore .cm-content"), notOpened: (p: Page) => p.locator(".sf-slot--lore .cm-content") },
	{
		name: "library side",
		show: async (p: Page) => {
			await flipSide(p);
			await p.getByRole("tab", { name: "codex" }).click();
		},
		opened: (p: Page) => p.locator(".sf-slot--centre .cm-content"),
		notOpened: (p: Page) => p.locator(".sf-slot--lore .cm-content"),
	},
];

for (const side of SIDES) {
	test.describe(`the Codex strip, ${side.name}`, () => {
		test.beforeEach(async ({ page }) => {
			await openProject(page);
			await side.show(page);
		});

		test("two icon buttons down the list's left edge, New Folder above New Note, each with a tooltip", async ({ page }) => {
			const strip = page.getByRole("toolbar", { name: "Codex actions" });
			await expect(strip).toBeVisible();
			const buttons = strip.getByRole("button");
			await expect(buttons).toHaveCount(2);
			await expect(buttons.nth(0)).toHaveAccessibleName("New folder");
			await expect(buttons.nth(1)).toHaveAccessibleName("New note");
			const [s, t, b0, b1] = await Promise.all([strip.boundingBox(), tree(page).boundingBox(), buttons.nth(0).boundingBox(), buttons.nth(1).boundingBox()]);
			expect(s!.x + s!.width).toBeLessThanOrEqual(t!.x + 1); // the strip is at the list's left edge
			expect(b0!.y).toBeLessThan(b1!.y);
			// from the keyboard: focus shows a tooltip and the accent focus ring; the arrows move between the two
			await page.keyboard.press("Tab");
			await buttons.nth(0).focus();
			await page.keyboard.press("ArrowDown");
			await expect(buttons.nth(1)).toBeFocused();
			await expect(page.getByRole("tooltip")).toHaveText("New note");
		});

		test("a new note is named in the list; nothing exists until Return; it goes in and opens where this side opens notes", async ({ page }) => {
			const before = await onDisk(page, CODEX);
			await page.getByRole("button", { name: "New note" }).click();
			await expect(noteBox(page)).toBeFocused();
			await noteBox(page).fill("Lantern");
			expect(await onDisk(page, "Codex/Lantern.md")).toBeNull(); // typing the name has made nothing
			expect(await onDisk(page, "Codex/New Note.md")).toBeNull();
			expect(await onDisk(page, CODEX)).toBe(before);
			await page.keyboard.press("Enter");
			await expect(tree(page).getByRole("treeitem", { name: "Lantern", exact: true })).toBeVisible();
			expect(await onDisk(page, "Codex/Lantern.md")).toBe("");
			await expect(side.opened(page)).toBeVisible();
			expect(await onDisk(page, CODEX)).toContain("Codex/Lantern.md");
		});

		test("Escape creates nothing, for a note and for a folder", async ({ page }) => {
			const before = await onDisk(page, CODEX);
			await page.getByRole("button", { name: "New note" }).click();
			await noteBox(page).fill("Ghost");
			await page.keyboard.press("Escape");
			await expect(noteBox(page)).toHaveCount(0);
			await page.getByRole("button", { name: "New folder" }).click();
			await folderBox(page).fill("Ghosts");
			await page.keyboard.press("Escape");
			await expect(folderBox(page)).toHaveCount(0);
			expect(await onDisk(page, "Codex/Ghost.md")).toBeNull();
			expect(await onDisk(page, CODEX)).toBe(before);
			await expect(tree(page).getByRole("treeitem", { name: "Ghosts" })).toHaveCount(0);
		});

		test("a name the rename would refuse is refused here: empty, [ ] # ^ |, file-name characters, and a note that is there", async ({ page }) => {
			await page.getByRole("button", { name: "New note" }).click();
			const alert = page.locator(".sf-codex-draft [role=alert]");
			for (const [typed, message] of [
				["a|b", /can't contain/],
				["a#b", /can't contain/],
				["a/b", /can't contain/],
				["Jane", /already a note called/],
				["jane", /already a note called/],
			] as const) {
				await noteBox(page).fill(typed);
				await expect(alert).toContainText(message);
				await page.keyboard.press("Enter");
				await expect(noteBox(page)).toBeVisible(); // still asking
			}
			await noteBox(page).fill("");
			await page.keyboard.press("Enter");
			await expect(alert).toHaveText("Type a name.");
			expect(await onDisk(page, "Codex/a|b.md")).toBeNull();
		});

		test("a new folder refuses a name already used by a folder beside it, ignoring case and accents; another parent's is fine", async ({ page }) => {
			await page.getByRole("button", { name: "New folder" }).click();
			const alert = page.locator(".sf-codex-draft [role=alert]");
			for (const typed of ["Cast", "cast", "CÁST ", "Places"]) {
				await folderBox(page).fill(typed);
				await expect(alert).toContainText("There is already a folder called");
				await page.keyboard.press("Enter");
				await expect(folderBox(page)).toBeVisible(); // still asking
			}
			await folderBox(page).fill("Crew"); // free
			await expect(alert).toHaveText("");
			await page.keyboard.press("Escape");
			// inside Cast, "Cast" is free (it is a different parent), and a name there is checked against Cast's folders
			await tree(page).getByRole("treeitem", { name: "Cast", exact: true }).locator("svg").first().click();
			await tree(page).getByRole("treeitem", { name: "Cast", exact: true }).locator("svg").first().click(); // closed, then open again
			await page.getByRole("button", { name: "New folder" }).click();
			await folderBox(page).fill("Cast");
			await expect(alert).toHaveText("");
			await page.keyboard.press("Enter");
			await expect(tree(page).getByRole("treeitem", { name: "Cast", exact: true })).toHaveCount(2);
			await page.getByRole("button", { name: "New folder" }).click();
			await folderBox(page).fill("cast");
			await expect(alert).toContainText("There is already a folder called"); // the new one, now in the target
			await page.keyboard.press("Escape");
		});

		test("a redraw of the list while the name box is open keeps the typed text, the caret and the focus", async ({ page }) => {
			await page.getByRole("button", { name: "New note" }).click();
			await noteBox(page).pressSequentially("Lant");
			await page.keyboard.press("ArrowLeft"); // the caret is between "Lan" and "t"
			const text = (await onDisk(page, CODEX))!;
			// an outside change to codex.md: the project reloads it and the list is drawn again
			await page.evaluate(({ path, changed }) => {
				void window.__preview.touch(path, changed);
				window.__preview.emit("watch-batch", { paths: [path], rescan: false });
			}, { path: CODEX, changed: text.replace("x-unknown-key: kept", "x-unknown-key: kept elsewhere") });
			await expect.poll(async () => (await onDisk(page, CODEX)) ?? "").toContain("kept elsewhere");
			await page.waitForTimeout(600);
			await expect(noteBox(page)).toBeFocused();
			await expect(noteBox(page)).toHaveValue("Lant");
			await page.keyboard.type("x");
			await expect(noteBox(page)).toHaveValue("Lanxt"); // the caret was kept
			await page.keyboard.press("Escape");
		});

		test("a new folder is made with the name given, never as 'New Folder'", async ({ page }) => {
			await page.getByRole("button", { name: "New folder" }).click();
			await folderBox(page).fill("Ships");
			await page.keyboard.press("Enter");
			await expect(tree(page).getByRole("treeitem", { name: "Ships", exact: true })).toBeVisible();
			const codex = (await onDisk(page, CODEX))!;
			expect(codex).toContain("name: Ships");
			expect(codex).not.toContain("New Folder");
			await expect(tree(page).getByRole("treeitem", { name: "Ships", exact: true })).toBeFocused();
		});

		test("things go at the end of the last folder clicked, and a closed folder opens to show them", async ({ page }) => {
			const cast = tree(page).getByRole("treeitem", { name: "Cast", exact: true });
			await cast.locator("svg").first().click(); // closes Cast (by its icon), and it is now the target
			await expect(cast).toHaveAttribute("aria-expanded", "false");
			await page.getByRole("button", { name: "New note" }).click();
			await expect(cast).toHaveAttribute("aria-expanded", "true"); // opened, so the new thing is seen
			await noteBox(page).fill("Mira");
			// the box is inside Cast, after Jane and Sam
			expect(await page.locator(".sf-codex-draft").evaluate((el) => !!el.closest(".sf-codex-children") && el.previousElementSibling?.textContent?.includes("Sam"))).toBe(true);
			await page.keyboard.press("Enter");
			await expect.poll(async () => (await onDisk(page, CODEX)) ?? "").toContain("Codex/Mira.md");
			const text = (await onDisk(page, CODEX))!;
			expect(text.indexOf("Codex/Mira.md")).toBeGreaterThan(text.indexOf("Codex/Sam.md"));
			expect(text.indexOf("Codex/Mira.md")).toBeLessThan(text.indexOf("f-places")); // still inside Cast
			await page.getByRole("button", { name: "New folder" }).click();
			await expect(folderBox(page)).toBeVisible();
			await page.keyboard.press("Escape");
		});

		test("the name box takes none of the typing aids (decision 53)", async ({ page }) => {
			await page.getByRole("button", { name: "New note" }).click();
			await noteBox(page).pressSequentially("sam's -- \"x\" ~th");
			await expect(noteBox(page)).toHaveValue("sam's -- \"x\" ~th");
			await page.keyboard.press("Escape");
		});

		test("leaving the box confirms a good name and otherwise creates nothing", async ({ page }) => {
			await page.getByRole("button", { name: "New note" }).click();
			await noteBox(page).fill("Brooch");
			await tree(page).getByRole("treeitem", { name: "Windows", exact: true }).click(); // clicks elsewhere
			await expect.poll(() => onDisk(page, "Codex/Brooch.md")).toBe("");
			await page.getByRole("button", { name: "New note" }).click();
			await noteBox(page).fill("Jane"); // refused: a note is there
			await tree(page).getByRole("treeitem", { name: "Windows", exact: true }).click();
			await expect(noteBox(page)).toHaveCount(0);
			expect(await onDisk(page, "Codex/Jane 2.md")).toBeNull();
		});
	});
}
