import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { updateChapterFingerprint } from "../chapterSidecar";
import { chapterSidecarPath } from "../paths";
import { makeTFile } from "./obsidianStub";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeSidecarApp(): { app: App; store: Map<string, string> } {
	const store = new Map<string, string>();
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	const folders = new Set<string>();
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? (folders.has(path) ? { path } : null),
			createFolder: async (path: string) => {
				folders.add(path);
			},
			read: async (file: { path: string }) => {
				await delay(20);
				return store.get(file.path) ?? "";
			},
			create: async (path: string, content: string) => {
				store.set(path, content);
				const file = makeTFile(path);
				files.set(path, file);
				return file;
			},
			modify: async (file: { path: string }, content: string) => {
				store.set(file.path, content);
			},
		},
		fileManager: {
			processFrontMatter: async () => undefined,
			trashFile: async () => undefined,
		},
	} as unknown as App;
	return { app, store };
}

describe("updateChapterFingerprint", () => {
	it("serializes overlapping writes so one fingerprint wins whole", async () => {
		const { app, store } = fakeSidecarApp();
		const path = chapterSidecarPath("BookA", "ch1.md");
		await Promise.all([
			updateChapterFingerprint(app, "BookA", "ch1.md", { opening: "AAA", closing: "aaa" }),
			updateChapterFingerprint(app, "BookA", "ch1.md", { opening: "BBB", closing: "bbb" }),
		]);
		const final = store.get(path) ?? "";
		expect(final.includes("AAA") && final.includes("BBB")).toBe(false);
		expect(final.includes("AAA") || final.includes("BBB")).toBe(true);
	});
});
