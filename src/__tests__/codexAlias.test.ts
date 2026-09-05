import { describe, expect, it } from "vitest";
import type { App, FrontMatterCache, TFile } from "obsidian";
import { addCodexNoteAlias } from "../codex";
import { ForbiddenWriteError } from "../writeGuard";
import { makeTFile } from "./obsidianStub";

function fakeAliasApp(
	path: string,
	initial: Record<string, unknown> = {},
): {
	app: App;
	frontmatter: Record<string, unknown>;
	processCalls: number;
} {
	const file = makeTFile(path);
	const frontmatter: Record<string, unknown> = { ...initial };
	let processCalls = 0;
	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => (p === path ? file : null),
		},
		fileManager: {
			processFrontMatter: async (_file: TFile, fn: (fm: FrontMatterCache) => void) => {
				processCalls += 1;
				fn(frontmatter as FrontMatterCache);
			},
		},
	} as unknown as App;
	return {
		app,
		frontmatter,
		get processCalls() {
			return processCalls;
		},
	};
}

describe("addCodexNoteAlias", () => {
	it("appends a new alias", async () => {
		const fake = fakeAliasApp("Codex/Arsenal.md", { book: "TECa" });
		await addCodexNoteAlias(fake.app, "Codex/Arsenal.md", "The Gunners");
		expect(fake.frontmatter.aliases).toEqual(["The Gunners"]);
		expect(fake.frontmatter.book).toBe("TECa");
		expect(fake.processCalls).toBe(1);
	});

	it("skips a duplicate alias case-insensitively", async () => {
		const fake = fakeAliasApp("Codex/Arsenal.md", { aliases: ["The Gunners"] });
		await addCodexNoteAlias(fake.app, "Codex/Arsenal.md", "the gunners");
		expect(fake.frontmatter.aliases).toEqual(["The Gunners"]);
	});

	it("skips an alias that matches the file basename", async () => {
		const fake = fakeAliasApp("Codex/Arsenal.md");
		await addCodexNoteAlias(fake.app, "Codex/Arsenal.md", "Arsenal");
		expect(fake.frontmatter.aliases).toBeUndefined();
	});

	it("no-ops on a blank alias without writing", async () => {
		const fake = fakeAliasApp("Codex/Arsenal.md");
		await addCodexNoteAlias(fake.app, "Codex/Arsenal.md", "   ");
		expect(fake.processCalls).toBe(0);
	});

	it("refuses non-Codex paths", async () => {
		const fake = fakeAliasApp("notes/Jane.md");
		await expect(addCodexNoteAlias(fake.app, "notes/Jane.md", "The Gunners")).rejects.toBeInstanceOf(
			ForbiddenWriteError,
		);
		expect(fake.processCalls).toBe(0);
	});
});
