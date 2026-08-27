import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import {
	createCodexNote,
	renameCodexNoteFile,
	sanitizeCodexBasename,
	uniqueCodexFilename,
} from "../codex";
import { CODEX_ROOT } from "../paths";
import { makeTFile } from "./obsidianStub";

function fakeCodexApp(existingPaths: string[] = []): {
	app: App;
	created: string[];
	renamed: Array<[string, string]>;
} {
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	for (const path of existingPaths) files.set(path, makeTFile(path));
	const created: string[] = [];
	const renamed: Array<[string, string]> = [];
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => {
				if (path === CODEX_ROOT) return { path: CODEX_ROOT };
				return files.get(path) ?? null;
			},
			createFolder: async () => undefined,
			create: async (path: string) => {
				created.push(path);
				const file = makeTFile(path);
				files.set(path, file);
				return file;
			},
		},
		fileManager: {
			processFrontMatter: async () => undefined,
			renameFile: async (file: { path: string }, dest: string) => {
				renamed.push([file.path, dest]);
				files.delete(file.path);
				file.path = dest;
				files.set(dest, file as ReturnType<typeof makeTFile>);
			},
		},
	} as unknown as App;
	return { app, created, renamed };
}

describe("sanitizeCodexBasename", () => {
	it("keeps a plain title", () => {
		expect(sanitizeCodexBasename("Ada Lovelace")).toBe("Ada Lovelace");
	});

	it("strips path separators and traversal", () => {
		expect(sanitizeCodexBasename("../Library/ch")).toBe("Librarych");
		expect(sanitizeCodexBasename("foo/bar.md")).toBe("foobar");
		expect(sanitizeCodexBasename("..\\outside")).toBe("outside");
	});

	it("rejects empty, dot, and double-dot names", () => {
		expect(sanitizeCodexBasename("")).toBe("");
		expect(sanitizeCodexBasename("...")).toBe("");
		expect(sanitizeCodexBasename("..")).toBe("");
		expect(sanitizeCodexBasename(".")).toBe("");
		expect(sanitizeCodexBasename("   ")).toBe("");
	});
});

describe("uniqueCodexFilename", () => {
	it("falls back to New Note when the name sanitizes to empty", () => {
		const { app } = fakeCodexApp();
		expect(uniqueCodexFilename(app, "../")).toBe("New Note.md");
		expect(uniqueCodexFilename(app, "..")).toBe("New Note.md");
	});

	it("disambiguates collisions", () => {
		const { app } = fakeCodexApp([`${CODEX_ROOT}/Ada.md`]);
		expect(uniqueCodexFilename(app, "Ada")).toBe("Ada 2.md");
	});
});

describe("createCodexNote / renameCodexNoteFile", () => {
	it("never creates a note outside Codex/ even with a traversal filename", async () => {
		const { app, created } = fakeCodexApp();
		await createCodexNote(app, null, { filename: "../Library/secret.md" });
		expect(created.some((p) => p.startsWith(`${CODEX_ROOT}/`))).toBe(true);
		expect(created.every((p) => p.startsWith(`${CODEX_ROOT}/`) || p.includes("codex.md") || p.includes("backstage"))).toBe(
			true,
		);
		expect(created.some((p) => p.includes(".."))).toBe(false);
	});

	it("refuses to rename a Codex note out of Codex/", async () => {
		const { app, renamed } = fakeCodexApp([`${CODEX_ROOT}/Ada.md`]);
		const file = app.vault.getAbstractFileByPath(`${CODEX_ROOT}/Ada.md`) as unknown as ReturnType<typeof makeTFile>;
		await renameCodexNoteFile(app, file as never, "../Library/stolen");
		expect(renamed).toHaveLength(1);
		expect(renamed[0][1].startsWith(`${CODEX_ROOT}/`)).toBe(true);
		expect(renamed[0][1].includes("..")).toBe(false);
	});
});
