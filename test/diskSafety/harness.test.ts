import * as fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { checkOperation } from "../helpers/diskSafety";
import { cleanupFixtures } from "../helpers/fixtures";

afterEach(cleanupFixtures);

const N = "_story-library/novel-aaa.md";

/** The harness itself must fail when an operation does something it shouldn't. */
describe("disk-safety harness catches violations", () => {
	it("a changed file nobody expected", async () => {
		await expect(
			checkOperation({ name: "x", run: (c) => c.project.modifyFrontmatter(N, "", (fm) => (fm["planned-novel-length"] = 1)) }),
		).rejects.toThrow(/changed files/);
	});

	it("an unrelated key changed inside an expected file", async () => {
		await expect(
			checkOperation({
				name: "x",
				run: (c) =>
					c.project.modifyFrontmatter(N, "", (fm) => {
						fm["planned-novel-length"] = 1;
						fm["planned-chapter-length"] = 2;
					}),
				changed: { [N]: { format: "frontmatter", touched: [["planned-novel-length"]] } },
			}),
		).rejects.toThrow(/unexpected change at planned-chapter-length/);
	});

	it("an untouched entry that was reformatted", async () => {
		await expect(
			checkOperation({
				name: "x",
				run: async (c) => {
					const text = c.read(N);
					// reformat a sibling entry's value without changing the data
					fs.writeFileSync(c.abs(N), text.replace("planned-novel-length: 80000", "planned-novel-length:    80000").replace("goal_daily: 500", "goal_daily: 500 # touched"));
					await c.project.index.applyChange({ type: "modified", path: N });
				},
				changed: { [N]: { format: "frontmatter", touched: [] } },
			}),
		).rejects.toThrow(/was rewritten/);
	});

	it("a note body that changed", async () => {
		await expect(
			checkOperation({
				name: "x",
				run: async (c) => {
					fs.writeFileSync(c.abs("Codex/Jane.md"), c.read("Codex/Jane.md") + "\nsneaky\n");
					await c.project.index.applyChange({ type: "modified", path: "Codex/Jane.md" });
				},
				changed: { "Codex/Jane.md": { format: "frontmatter", touched: [] } },
			}),
		).rejects.toThrow(/body/);
	});

	it("a chapter that changed", async () => {
		await expect(
			checkOperation({
				name: "x",
				run: async (c) => {
					fs.writeFileSync(c.abs("_story-library/aaa/ch-a1.md"), "changed prose");
					await c.project.index.applyChange({ type: "modified", path: "_story-library/aaa/ch-a1.md" });
				},
				changed: { "_story-library/aaa/ch-a1.md": { format: "text" } },
			}),
		).rejects.toThrow(/is a chapter and must not change/);
	});

	it("residue that changed", async () => {
		await expect(
			checkOperation({
				name: "x",
				run: async (c) => {
					fs.appendFileSync(c.abs("_backstage/titleforge/settings.json"), " ");
					await c.project.index.applyChange({ type: "modified", path: "_backstage/titleforge/settings.json" });
				},
				changed: {},
			}),
		).rejects.toThrow(/changed files/);
	});

	it("an index that disagrees with the disk", async () => {
		await expect(
			checkOperation({
				name: "x",
				run: async (c) => {
					fs.writeFileSync(c.abs("_backstage/storyforge/aaa/wordcount.md"), c.read("_backstage/storyforge/aaa/wordcount.md") + "# added\n");
					// the index is not told
				},
				changed: { "_backstage/storyforge/aaa/wordcount.md": { format: "text" } },
			}),
		).rejects.toThrow(/index vs disk/);
	});

	it("an operation that should have been refused but wasn't", async () => {
		await expect(checkOperation({ name: "x", run: async () => undefined, throws: true })).rejects.toThrow(/expected the operation to be refused/);
	});

	it("passes a correct operation", async () => {
		await checkOperation({
			name: "ok",
			run: (c) => c.project.modifyFrontmatter(N, "", (fm) => (fm["planned-novel-length"] = 1)),
			changed: { [N]: { format: "frontmatter", touched: [["planned-novel-length"]] } },
		});
	});
});
