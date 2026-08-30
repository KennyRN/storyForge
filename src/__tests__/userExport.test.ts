import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import {
	exportFilenameStem,
	formatDatedExportStem,
	listUserExportFiles,
	readUserExportFile,
	resolveExportItemName,
	userExportPath,
	withJsonExtension,
} from "../userExport";

describe("resolveExportItemName", () => {
	it("prefers the preset name, then series, then novel", () => {
		expect(resolveExportItemName("Cast", "Roman", "Republic")).toBe("Cast");
		expect(resolveExportItemName("  ", "Roman", "Republic")).toBe("Roman");
		expect(resolveExportItemName("", "", "Republic")).toBe("Republic");
		expect(resolveExportItemName("  ", "  ", "  ")).toBe("types & tags");
		expect(resolveExportItemName("", "", "", "threads")).toBe("threads");
	});
});

describe("formatDatedExportStem", () => {
	it("formats yyyy-mm-dd - name in local time", () => {
		expect(formatDatedExportStem("Cast", new Date(2026, 7, 28))).toBe("2026-08-28 - Cast");
		expect(formatDatedExportStem("Roman", new Date(2026, 0, 5))).toBe("2026-01-05 - Roman");
	});
});

describe("exportFilenameStem", () => {
	it("strips .json and a leading date stamp", () => {
		expect(exportFilenameStem("2026-08-28 - Cast.json")).toBe("Cast");
		expect(exportFilenameStem("Cast.json")).toBe("Cast");
		expect(exportFilenameStem("Cast")).toBe("Cast");
	});
});

describe("withJsonExtension", () => {
	it("adds .json once even if the user already typed it", () => {
		expect(withJsonExtension("2026-08-28 - Cast")).toBe("2026-08-28 - Cast.json");
		expect(withJsonExtension("2026-08-28 - Cast.json")).toBe("2026-08-28 - Cast.json");
		expect(withJsonExtension("2026-08-28 - Cast.JSON")).toBe("2026-08-28 - Cast.json");
		expect(withJsonExtension("Cast.json.json")).toBe("Cast.json");
	});
});

describe("userExportPath", () => {
	it("writes a flat file under _export/", () => {
		expect(userExportPath("2026-08-28 - Cast")).toBe("_export/2026-08-28 - Cast.json");
	});
});

describe("listUserExportFiles", () => {
	it("lists only flat JSON files in _export/", async () => {
		const files: Record<string, string> = {
			"_export/2026-08-28 - Cast.json": "{}\n",
		};
		const app = {
			vault: {
				adapter: {
					exists: async (path: string) => path === "_export",
					list: async () => ({
						files: [
							"_export/2026-08-28 - Cast.json",
							"_export/notes.md",
							"_export/nested/skip.json",
						],
						folders: ["_export/nested"],
					}),
					read: async (path: string) => files[path] ?? "",
				},
			},
		} as unknown as App;

		expect(await listUserExportFiles(app)).toEqual([
			{ path: "_export/2026-08-28 - Cast.json", name: "2026-08-28 - Cast.json" },
		]);
		await expect(readUserExportFile(app, "_export/2026-08-28 - Cast.json")).resolves.toBe(
			files["_export/2026-08-28 - Cast.json"],
		);
		await expect(readUserExportFile(app, "_export/nested/skip.json")).rejects.toThrow("_export/");
	});
});
