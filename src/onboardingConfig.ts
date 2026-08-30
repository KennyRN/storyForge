import type { App } from "obsidian";
import type StoryForgePlugin from "./main";
import { applyCompleteExport, COMPLETE_EXPORT_FORMAT, parseCompleteExport } from "./completeExport";
import { flattenPreferencesDocument, parsePreferencesExport, PREFERENCES_EXPORT_FORMAT } from "./preferencesExport";
import { applyPlotThreadsDocument, parsePlotThreadsExport, PLOT_THREADS_EXPORT_FORMAT } from "./plotThreadsExport";
import { applyTypesTagsDocument, parseTypesTagsExport, TYPES_TAGS_EXPORT_FORMAT } from "./typesTagsExport";
import { EXPORT_ROOT, isExportFolderPath } from "./paths";
import { listUserExportFiles, readUserExportFile } from "./userExport";
import { normalizeVaultPath } from "./writeGuard";

/** formatForge theme/settings share copies; kept as a string so storyForge does not import formatForge. */
export const FORMATTING_EXPORT_FORMAT = "formatForge-settings";

export type OnboardingConfigKind =
	| "complete"
	| "template"
	| "preferences"
	| "types-tags"
	| "threads"
	| "formatting";

export type OnboardingConfigLocation = "root" | "export";

export interface OnboardingConfigFile {
	path: string;
	name: string;
	location: OnboardingConfigLocation;
	kind: OnboardingConfigKind;
	description: string;
}

export const ONBOARDING_CONFIG_KIND_LABELS: Record<OnboardingConfigKind, string> = {
	complete: "complete",
	template: "template",
	preferences: "preferences",
	"types-tags": "types & tags",
	threads: "threads",
	formatting: "formatting",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootJsonPath(path: string): boolean {
	try {
		const normalized = normalizeVaultPath(path);
		return normalized.toLowerCase().endsWith(".json") && !normalized.includes("/");
	} catch {
		return false;
	}
}

function isExportJsonPath(path: string): boolean {
	try {
		const normalized = normalizeVaultPath(path);
		return (
			isExportFolderPath(normalized) &&
			normalized !== EXPORT_ROOT &&
			normalized.toLowerCase().endsWith(".json") &&
			!normalized.slice(EXPORT_ROOT.length + 1).includes("/")
		);
	} catch {
		return false;
	}
}

export function resolveOnboardingConfigPath(path: string): { path: string; location: OnboardingConfigLocation } {
	const normalized = normalizeVaultPath(path);
	if (isRootJsonPath(normalized)) return { path: normalized, location: "root" };
	if (isExportJsonPath(normalized)) return { path: normalized, location: "export" };
	throw new Error("Config must be a JSON file in the vault root or _export/");
}

export function classifyOnboardingConfigText(raw: string): {
	kind: OnboardingConfigKind;
	description: string;
} | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || typeof parsed.format !== "string") return null;
	const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
	switch (parsed.format) {
		case COMPLETE_EXPORT_FORMAT:
			return { kind: parsed.template === true ? "template" : "complete", description };
		case PREFERENCES_EXPORT_FORMAT:
			return { kind: "preferences", description };
		case TYPES_TAGS_EXPORT_FORMAT:
			return { kind: "types-tags", description };
		case PLOT_THREADS_EXPORT_FORMAT:
			return { kind: "threads", description };
		case FORMATTING_EXPORT_FORMAT:
			return { kind: "formatting", description };
		default:
			return null;
	}
}

export function onboardingConfigOptionLabel(file: OnboardingConfigFile): string {
	return `${file.name} · ${ONBOARDING_CONFIG_KIND_LABELS[file.kind]}`;
}

function flattenFormatForgeSettings(parsed: Record<string, unknown>): Record<string, unknown> {
	const bag: Record<string, unknown> = {};
	if (isRecord(parsed.textStyling)) Object.assign(bag, parsed.textStyling);
	if (isRecord(parsed.storyForgeInterface)) Object.assign(bag, parsed.storyForgeInterface);
	if (isRecord(parsed.palette)) Object.assign(bag, parsed.palette);
	return bag;
}

export async function readOnboardingConfigFile(app: App, path: string): Promise<string> {
	const resolved = resolveOnboardingConfigPath(path);
	if (resolved.location === "export") return readUserExportFile(app, resolved.path);
	return app.vault.adapter.read(resolved.path);
}

async function listRootJsonFiles(app: App): Promise<Array<{ path: string; name: string }>> {
	const found = new Map<string, string>();
	try {
		const listing = await app.vault.adapter.list("");
		for (const path of listing.files) {
			if (!isRootJsonPath(path)) continue;
			const normalized = normalizeVaultPath(path);
			found.set(normalized, normalized);
		}
	} catch {
		/* adapter.list("") is not always supported; getFiles below covers desktop vaults */
	}
	const vaultFiles = app.vault.getFiles?.() ?? [];
	for (const file of vaultFiles) {
		if (!isRootJsonPath(file.path)) continue;
		const normalized = normalizeVaultPath(file.path);
		found.set(normalized, file.name || normalized);
	}
	return [...found.entries()].map(([path, name]) => ({ path, name }));
}

/** JSON config files in the vault root or `_export/` that storyForge (or formatForge) can apply. */
export async function listOnboardingConfigFiles(app: App): Promise<OnboardingConfigFile[]> {
	const candidates: Array<{ path: string; name: string; location: OnboardingConfigLocation }> = [];
	for (const file of await listRootJsonFiles(app)) {
		candidates.push({ ...file, location: "root" });
	}
	try {
		for (const file of await listUserExportFiles(app)) {
			candidates.push({ ...file, location: "export" });
		}
	} catch {
		/* missing _export/ is fine */
	}
	const result: OnboardingConfigFile[] = [];
	for (const file of candidates) {
		try {
			const classified = classifyOnboardingConfigText(await readOnboardingConfigFile(app, file.path));
			if (!classified) continue;
			result.push({ ...file, ...classified });
		} catch {
			/* unreadable or not a config file */
		}
	}
	return result.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

export async function applyOnboardingConfig(plugin: StoryForgePlugin, path: string): Promise<OnboardingConfigKind> {
	const text = await readOnboardingConfigFile(plugin.app, path);
	const classified = classifyOnboardingConfigText(text);
	if (!classified) throw new Error("JSON is not a storyForge or formatForge config file");
	switch (classified.kind) {
		case "complete":
		case "template":
			await applyCompleteExport(plugin, parseCompleteExport(text));
			break;
		case "preferences":
			await plugin.importSettings(flattenPreferencesDocument(parsePreferencesExport(text)));
			break;
		case "types-tags": {
			const document = parseTypesTagsExport(text);
			await applyTypesTagsDocument(plugin.app, document, document.included);
			plugin.refreshStoryForgeViews();
			break;
		}
		case "threads":
			await applyPlotThreadsDocument(plugin.app, parsePlotThreadsExport(text), "replace");
			plugin.refreshStoryForgeViews();
			break;
		case "formatting": {
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				throw new Error("Formatting JSON is not valid");
			}
			if (!isRecord(parsed)) throw new Error("Formatting JSON is not an object");
			const bag = flattenFormatForgeSettings(parsed);
			if (Object.keys(bag).length === 0) throw new Error("This formatting file has no settings to apply");
			await plugin.importSettings(bag);
			const companion = plugin.getFormatCompanion();
			if (companion?.importLocalSettings) await companion.importLocalSettings(bag);
			plugin.refreshStoryForgeViews();
			break;
		}
	}
	return classified.kind;
}
