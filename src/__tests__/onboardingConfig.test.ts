import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { COMPLETE_EXPORT_FORMAT } from "../completeExport";
import {
	classifyOnboardingConfigText,
	FORMATTING_EXPORT_FORMAT,
	listOnboardingConfigFiles,
	onboardingConfigOptionLabel,
	readOnboardingConfigFile,
	resolveOnboardingConfigPath,
} from "../onboardingConfig";
import { PREFERENCES_EXPORT_FORMAT } from "../preferencesExport";
import { PLOT_THREADS_EXPORT_FORMAT } from "../plotThreadsExport";
import { TYPES_TAGS_EXPORT_FORMAT } from "../typesTagsExport";

function makeApp(files: Record<string, string>): App {
	const rootFiles = Object.keys(files).filter((path) => !path.includes("/"));
	const exportFiles = Object.keys(files).filter(
		(path) => path.startsWith("_export/") && !path.slice("_export/".length).includes("/"),
	);
	return {
		vault: {
			adapter: {
				exists: async (path: string) => path !== "_export" || exportFiles.length > 0,
				list: async (path: string) => {
					if (path === "") return { files: rootFiles, folders: exportFiles.length > 0 ? ["_export"] : [] };
					if (path === "_export") return { files: exportFiles, folders: [] };
					return { files: [], folders: [] };
				},
				read: async (path: string) => {
					if (!(path in files)) throw new Error(`missing ${path}`);
					return files[path];
				},
			},
			getFiles: () => [],
		},
	} as unknown as App;
}

const complete = JSON.stringify({
	format: COMPLETE_EXPORT_FORMAT,
	version: 1,
	exportedAt: "2026-08-29T12:00:00.000Z",
	description: "roman complete",
	template: false,
	settings: { layout: "hybrid" },
	types: [],
	chapterTags: [],
	novelTags: [],
	threads: [],
	titleforge: null,
});

const template = JSON.stringify({
	format: COMPLETE_EXPORT_FORMAT,
	version: 1,
	exportedAt: "2026-08-29T12:00:00.000Z",
	template: true,
	settings: { layout: "hybrid" },
	types: [],
	chapterTags: [],
	novelTags: [],
	threads: [],
	titleforge: null,
});

describe("classifyOnboardingConfigText", () => {
	it("recognises each portable format, including templates", () => {
		expect(classifyOnboardingConfigText(complete)).toEqual({
			kind: "complete",
			description: "roman complete",
		});
		expect(classifyOnboardingConfigText(template)).toEqual({ kind: "template", description: "" });
		expect(
			classifyOnboardingConfigText(
				JSON.stringify({ format: PREFERENCES_EXPORT_FORMAT, included: {}, general: null, obsidian: null, backup: null }),
			),
		).toEqual({ kind: "preferences", description: "" });
		expect(
			classifyOnboardingConfigText(JSON.stringify({ format: TYPES_TAGS_EXPORT_FORMAT, types: [], chapterTags: [], novelTags: [] })),
		).toEqual({ kind: "types-tags", description: "" });
		expect(classifyOnboardingConfigText(JSON.stringify({ format: PLOT_THREADS_EXPORT_FORMAT, threads: [] }))).toEqual({
			kind: "threads",
			description: "",
		});
		expect(
			classifyOnboardingConfigText(
				JSON.stringify({ format: FORMATTING_EXPORT_FORMAT, textStyling: { bodyTextFontFamily: "courier" } }),
			),
		).toEqual({ kind: "formatting", description: "" });
		expect(classifyOnboardingConfigText("{")).toBeNull();
		expect(classifyOnboardingConfigText(JSON.stringify({ format: "nope" }))).toBeNull();
	});
});

describe("resolveOnboardingConfigPath", () => {
	it("accepts vault-root and _export JSON, and rejects anything else", () => {
		expect(resolveOnboardingConfigPath("roman.json")).toEqual({ path: "roman.json", location: "root" });
		expect(resolveOnboardingConfigPath("_export/roman.json")).toEqual({
			path: "_export/roman.json",
			location: "export",
		});
		expect(() => resolveOnboardingConfigPath("Codex/roman.json")).toThrow("_export");
		expect(() => resolveOnboardingConfigPath("_export/nested/roman.json")).toThrow("_export");
	});
});

describe("listOnboardingConfigFiles", () => {
	it("finds template and config files in the vault root and _export/", async () => {
		const app = makeApp({
			"starter.json": template,
			"notes.md": "ignore",
			"unknown.json": JSON.stringify({ format: "other" }),
			"_export/roman.json": complete,
			"_export/nested/skip.json": complete,
		});
		const listed = await listOnboardingConfigFiles(app);
		expect(listed.map((file) => file.path).sort()).toEqual(["_export/roman.json", "starter.json"]);
		expect(listed.find((file) => file.path === "starter.json")).toMatchObject({
			kind: "template",
			location: "root",
		});
		expect(listed.find((file) => file.path === "_export/roman.json")).toMatchObject({
			kind: "complete",
			location: "export",
			description: "roman complete",
		});
		expect(onboardingConfigOptionLabel(listed.find((file) => file.path === "starter.json")!)).toBe(
			"starter.json · template",
		);
		await expect(readOnboardingConfigFile(app, "starter.json")).resolves.toBe(template);
		await expect(readOnboardingConfigFile(app, "_export/nested/skip.json")).rejects.toThrow("_export");
	});
});
