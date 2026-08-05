import type { App } from "obsidian";

export const FORMATFORGE_PLUGIN_ID = "formatforge";

/** True when the formatForge community plugin is enabled in this vault. */
export function isFormatForgePluginEnabled(app: App): boolean {
	const plugins = (
		app as unknown as {
			plugins?: {
				enabledPlugins?: Set<string>;
				getPlugin?: (id: string) => unknown;
			};
		}
	).plugins;
	if (!plugins) return false;
	if (plugins.enabledPlugins?.has(FORMATFORGE_PLUGIN_ID)) return true;
	return plugins.getPlugin?.(FORMATFORGE_PLUGIN_ID) != null;
}

/**
 * Formatting UI should defer to formatForge when a companion is registered
 * or when formatForge itself is enabled (covers load-order gaps before registerCompanion).
 */
export function isFormatCompanionActiveForSettings(
	companion: { pluginId?: string } | null | undefined,
	apiReportsActive: boolean,
	app: App,
): boolean {
	return companion != null || apiReportsActive || isFormatForgePluginEnabled(app);
}

/**
 * `connected` — formatForge registered (or the API reports it): hand formatting over.
 * `enabled-not-connected` — formatForge is enabled but has not registered. Either it is
 *   still loading or it failed; keep a storyForge fallback so the user is never stranded
 *   without any way to save or apply formatting.
 * `absent` — formatForge is not in play at all.
 */
export type FormatCompanionState = "connected" | "enabled-not-connected" | "absent";

export function formatCompanionState(
	companion: { pluginId?: string } | null | undefined,
	apiReportsActive: boolean,
	app: App,
): FormatCompanionState {
	if (companion != null || apiReportsActive) return "connected";
	return isFormatForgePluginEnabled(app) ? "enabled-not-connected" : "absent";
}
