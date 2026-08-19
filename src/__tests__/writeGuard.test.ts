import { describe, expect, it } from "vitest";
import {
	ForbiddenWriteError,
	assertBackstagePath,
	normalizeVaultPath,
	writeBackstageFile,
	writeBackupText,
} from "../writeGuard";
import { BACKSTAGE_ROOT, LIBRARY_ROOT, bookFilePath, libraryChapterPath, seriesFilePath } from "../paths";
import { makeTFile } from "./obsidianStub";
import type { Vault } from "obsidian";

describe("normalizeVaultPath", () => {
	it("collapses . segments and trailing slashes", () => {
		expect(normalizeVaultPath(`${BACKSTAGE_ROOT}/./series.md`)).toBe(`${BACKSTAGE_ROOT}/series.md`);
		expect(normalizeVaultPath(`${BACKSTAGE_ROOT}/`)).toBe(BACKSTAGE_ROOT);
	});

	it("rejects absolute paths and null bytes", () => {
		expect(() => normalizeVaultPath(`/${BACKSTAGE_ROOT}/series.md`)).toThrow(ForbiddenWriteError);
		expect(() => normalizeVaultPath(`${BACKSTAGE_ROOT}/series.md\0.md`)).toThrow(ForbiddenWriteError);
	});

	it("rejects escape-above-root via ..", () => {
		expect(() => normalizeVaultPath("..")).toThrow(ForbiddenWriteError);
		// BACKSTAGE_ROOT is two segments deep now, so it takes three ".." to run past an empty root.
		expect(() => normalizeVaultPath(`${BACKSTAGE_ROOT}/../../../etc/passwd`)).toThrow(ForbiddenWriteError);
	});
});

describe("assertBackstagePath — adversarial", () => {
	const allowed = [
		BACKSTAGE_ROOT,
		`${BACKSTAGE_ROOT}/settings-presets/x.json`,
		`${BACKSTAGE_ROOT}/TECa/cover.png`,
		`${BACKSTAGE_ROOT}/TECa/chapters/ch1.md`,
		`${BACKSTAGE_ROOT}/TECa/recommend/ch1.md`,
		// The narrow library-root exception: series.md and novel-<code>.md describe
		// the manuscripts without being manuscript prose themselves.
		seriesFilePath(),
		bookFilePath("TECa"),
	];
	const forbidden = [
		`${LIBRARY_ROOT}/TECa/ch1.md`,
		libraryChapterPath("TECa", "ch1.md"),
		"Codex/Jane.md",
		LIBRARY_ROOT,
		"Codex",
		// Not a real novel-<code>.md — a chapter file, or a folder merely named like one, still forbidden.
		`${LIBRARY_ROOT}/not-a-novel.md`,
		`${LIBRARY_ROOT}/novel-TECa`,
		// Traversal that genuinely clears BACKSTAGE_ROOT's two segments and lands in the library.
		`${BACKSTAGE_ROOT}/../../${LIBRARY_ROOT}/TECa/ch1.md`,
		`${BACKSTAGE_ROOT}/foo/../../../Codex/Jane.md`,
		`${BACKSTAGE_ROOT}/../../Codex/Jane.md`,
		`${BACKSTAGE_ROOT}_evil/x.md`,
		`foo/${BACKSTAGE_ROOT}/x.md`,
		`${BACKSTAGE_ROOT.toUpperCase()}/series.md`,
	];

	it.each(allowed)("allows %s", (path) => {
		expect(() => assertBackstagePath(path)).not.toThrow();
	});

	it.each(forbidden)("forbids %s", (path) => {
		expect(() => assertBackstagePath(path)).toThrow(ForbiddenWriteError);
	});
});

describe("writeBackstageFile — refuses library/codex before touching vault", () => {
	it("does not call vault.create for a traversal escape into the library", async () => {
		const calls: string[] = [];
		const vault = {
			getAbstractFileByPath: () => null,
			create: async (path: string) => {
				calls.push(path);
				return makeTFile(path);
			},
			modify: async () => undefined,
			createFolder: async () => undefined,
		} as unknown as Vault;

		await expect(
			writeBackstageFile(vault, `${BACKSTAGE_ROOT}/../../${LIBRARY_ROOT}/BOOK/ch.md`, "stolen"),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
		expect(calls).toEqual([]);
	});
});

describe("writeBackupText", () => {
	it("creates text exports only under the backup folder", async () => {
		const created: string[] = [];
		const folders = new Set<string>();
		const vault = {
			getAbstractFileByPath: (path: string) => (folders.has(path) ? { path } : null),
			create: async (path: string) => {
				created.push(path);
				return makeTFile(path);
			},
			modify: async () => undefined,
			createFolder: async (path: string) => {
				folders.add(path);
			},
		} as unknown as Vault;

		await writeBackupText(vault, "_sf-backup/formatForge settings.json", "{}");
		expect(created).toEqual(["_sf-backup/formatForge settings.json"]);

		await expect(
			writeBackupText(vault, "_sf-backup/../Codex/settings.json", "{}"),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
	});
});
