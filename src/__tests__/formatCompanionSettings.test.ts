import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import {
	isFormatCompanionActiveForSettings,
	isFormatForgePluginEnabled,
} from "../formatCompanionActive";

function makeApp(opts: { enabled?: boolean; loaded?: boolean } = {}): App {
	const enabledPlugins = new Set<string>();
	if (opts.enabled) enabledPlugins.add("formatforge");
	const plugins = {
		enabledPlugins,
		getPlugin: (id: string) => {
			if (id === "formatforge" && (opts.enabled || opts.loaded)) return { id: "formatforge" };
			return null;
		},
	};
	return { plugins } as unknown as App;
}

describe("formatForge settings deferral", () => {
	it("detects enabled formatforge via enabledPlugins", () => {
		expect(isFormatForgePluginEnabled(makeApp({ enabled: true }))).toBe(true);
		expect(isFormatForgePluginEnabled(makeApp({}))).toBe(false);
	});

	it("detects loaded formatforge via getPlugin fallback", () => {
		expect(isFormatForgePluginEnabled(makeApp({ loaded: true }))).toBe(true);
	});

	it("treats companion registration as active even without plugin id scan", () => {
		expect(
			isFormatCompanionActiveForSettings({ pluginId: "formatforge" }, false, makeApp({})),
		).toBe(true);
	});

	it("treats API-reported companion as active", () => {
		expect(isFormatCompanionActiveForSettings(null, true, makeApp({}))).toBe(true);
	});

	it("treats enabled formatforge as active before registerCompanion", () => {
		expect(isFormatCompanionActiveForSettings(null, false, makeApp({ enabled: true }))).toBe(true);
	});

	it("is inactive when neither companion nor formatforge is present", () => {
		expect(isFormatCompanionActiveForSettings(null, false, makeApp({}))).toBe(false);
	});
});
