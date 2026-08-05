import { describe, expect, it } from "vitest";
import {
	ForbiddenWriteError,
	assertBackstagePath,
	normalizeVaultPath,
	writeBackstageFile,
	writeBackupText,
} from "../writeGuard";
import { makeTFile } from "./obsidianStub";
import type { Vault } from "obsidian";

describe("normalizeVaultPath", () => {
	it("collapses . segments and trailing slashes", () => {
		expect(normalizeVaultPath("_sf-backstage/./series.md")).toBe("_sf-backstage/series.md");
		expect(normalizeVaultPath("_sf-backstage/")).toBe("_sf-backstage");
	});

	it("rejects absolute paths and null bytes", () => {
		expect(() => normalizeVaultPath("/_sf-backstage/series.md")).toThrow(ForbiddenWriteError);
		expect(() => normalizeVaultPath("_sf-backstage/series.md\0.md")).toThrow(ForbiddenWriteError);
	});

	it("rejects escape-above-root via ..", () => {
		expect(() => normalizeVaultPath("..")).toThrow(ForbiddenWriteError);
		expect(() => normalizeVaultPath("_sf-backstage/../../etc/passwd")).toThrow(ForbiddenWriteError);
	});
});

describe("assertBackstagePath — adversarial", () => {
	const allowed = [
		"_sf-backstage",
		"_sf-backstage/series.md",
		"_sf-backstage/TECa/novel.md",
		"_sf-backstage/TECa/chapters/ch1.md",
		"_sf-backstage/TECa/recommend/ch1.md",
	];
	const forbidden = [
		"_sf-storylibrary/TECa/ch1.md",
		"Codex/Jane.md",
		"_sf-storylibrary",
		"Codex",
		"_sf-backstage/../_sf-storylibrary/TECa/ch1.md",
		"_sf-backstage/foo/../../Codex/Jane.md",
		"_sf-backstage/../Codex/Jane.md",
		"_sf-backstage_evil/x.md",
		"foo/_sf-backstage/x.md",
		"_SF-backstage/series.md",
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
			writeBackstageFile(vault, "_sf-backstage/../_sf-storylibrary/BOOK/ch.md", "stolen"),
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
