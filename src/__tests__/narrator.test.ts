import { describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import { bookFilePath } from "../paths";
import { resolveChapterNarrator } from "../recommend/narrator";

function makeFakeApp(frontmatter: Record<string, unknown>): App {
	const novelPath = bookFilePath("BookA");
	return {
		vault: {
			getAbstractFileByPath: (path: string) => {
				if (path === novelPath) return makeTFile(path);
				return makeTFolder(path);
			},
		},
		metadataCache: {
			getCache: (path: string) => (path === novelPath ? { frontmatter } : null),
		},
	} as unknown as App;
}

describe("resolveChapterNarrator", () => {
	it("uses the first chapter PoV when the list is set", () => {
		const app = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					pov: [
						{ path: "Codex/Alice.md", name: "Alice" },
						{ path: "Codex/Bob.md", name: "Bob" },
					],
				},
			},
			"default-pov-path": "Codex/Default.md",
			"default-pov-name": "Default",
		});
		expect(resolveChapterNarrator(app, "BookA", "ch1.md")).toEqual({
			path: "Codex/Alice.md",
			name: "Alice",
		});
	});

	it("falls back to the book default when the chapter list is empty", () => {
		const app = makeFakeApp({
			chapters: {
				"ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" },
			},
			"default-pov-path": "Codex/Default.md",
			"default-pov-name": "Default",
		});
		expect(resolveChapterNarrator(app, "BookA", "ch1.md")).toEqual({
			path: "Codex/Default.md",
			name: "Default",
		});
	});

	it("is unset when neither chapter nor default PoV is set", () => {
		const app = makeFakeApp({
			chapters: {
				"ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" },
			},
		});
		expect(resolveChapterNarrator(app, "BookA", "ch1.md")).toBeNull();
	});

	it("reads a leftover scalar chapter PoV as the narrator", () => {
		const app = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": "Codex/Alice.md",
					"pov-name": "Alice",
				},
			},
		});
		expect(resolveChapterNarrator(app, "BookA", "ch1.md")).toEqual({
			path: "Codex/Alice.md",
			name: "Alice",
		});
	});
});
