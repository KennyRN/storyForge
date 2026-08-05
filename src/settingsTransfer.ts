import type { StoryForgePluginSettings } from "./main";

export const STORYFORGE_SETTINGS_FORMAT = "storyForge-settings" as const;
export const STORYFORGE_SETTINGS_VERSION = 1 as const;

export const STORYFORGE_PALETTE_KEYS = [
	"colorPaletteName",
	"colorPaletteVariant",
	"customPaletteColors",
] as const;

export interface StoryForgeTransferSelection {
	storySettings: boolean;
	formatting: boolean;
	palette: boolean;
}

export interface StoryForgeSettingsDocument {
	format: typeof STORYFORGE_SETTINGS_FORMAT;
	version: typeof STORYFORGE_SETTINGS_VERSION;
	exportedAt: string;
	description?: string;
	included: StoryForgeTransferSelection;
	storySettings: Record<string, unknown> | null;
	formatting: Record<string, unknown> | null;
	palette: Record<string, unknown> | null;
}

function withoutKeys(
	source: Record<string, unknown>,
	excluded: ReadonlySet<string>,
): Record<string, unknown> {
	return Object.fromEntries(Object.entries(source).filter(([key]) => !excluded.has(key)));
}

function pickKeys(
	source: Record<string, unknown>,
	keys: readonly string[],
): Record<string, unknown> {
	return Object.fromEntries(
		keys
			.filter((key) => Object.prototype.hasOwnProperty.call(source, key))
			.map((key) => [key, source[key]]),
	);
}

export function buildStoryForgeSettingsDocument(
	settings: StoryForgePluginSettings,
	linkedFormatting: Record<string, unknown>,
	exportedAt: Date = new Date(),
	options: {
		description?: string;
		included?: Partial<StoryForgeTransferSelection>;
	} = {},
): StoryForgeSettingsDocument {
	const included: StoryForgeTransferSelection = {
		storySettings: options.included?.storySettings ?? true,
		formatting: options.included?.formatting ?? true,
		palette: options.included?.palette ?? true,
	};
	const all = settings as unknown as Record<string, unknown>;
	const formattingKeys = Object.keys(linkedFormatting);
	const paletteKeys = new Set<string>(STORYFORGE_PALETTE_KEYS);
	const nonStoryKeys = new Set<string>([
		...formattingKeys,
		...STORYFORGE_PALETTE_KEYS,
	]);
	const description = options.description?.trim();
	return {
		format: STORYFORGE_SETTINGS_FORMAT,
		version: STORYFORGE_SETTINGS_VERSION,
		exportedAt: exportedAt.toISOString(),
		...(description ? { description } : {}),
		included,
		storySettings: included.storySettings ? withoutKeys(all, nonStoryKeys) : null,
		formatting: included.formatting
			? withoutKeys(linkedFormatting, paletteKeys)
			: null,
		palette: included.palette
			? pickKeys(all, STORYFORGE_PALETTE_KEYS)
			: null,
	};
}

export function stringifyStoryForgeSettingsDocument(
	document: StoryForgeSettingsDocument,
): string {
	return JSON.stringify(document, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSelection(value: unknown): value is StoryForgeTransferSelection {
	return (
		isRecord(value) &&
		typeof value.storySettings === "boolean" &&
		typeof value.formatting === "boolean" &&
		typeof value.palette === "boolean"
	);
}

function isPalette(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	if (
		typeof value.colorPaletteName !== "string" ||
		typeof value.colorPaletteVariant !== "string" ||
		!Array.isArray(value.customPaletteColors)
	) {
		return false;
	}
	return value.customPaletteColors.every(
		(color) =>
			isRecord(color) &&
			typeof color.name === "string" &&
			typeof color.hex === "string",
	);
}

/** Accepts versioned theme documents and legacy raw storyForge settings JSON. */
export function parseStoryForgeSettingsDocument(text: string): StoryForgeSettingsDocument {
	const parsed: unknown = JSON.parse(text);
	if (!isRecord(parsed)) throw new Error("Settings import must be a JSON object");
	if (!Object.prototype.hasOwnProperty.call(parsed, "format")) {
		return {
			format: STORYFORGE_SETTINGS_FORMAT,
			version: STORYFORGE_SETTINGS_VERSION,
			exportedAt: new Date(0).toISOString(),
			description: "Legacy storyForge settings export",
			included: { storySettings: true, formatting: false, palette: false },
			storySettings: parsed,
			formatting: null,
			palette: null,
		};
	}
	if (parsed.format !== STORYFORGE_SETTINGS_FORMAT) {
		throw new Error("This is not a storyForge settings export");
	}
	if (parsed.version !== STORYFORGE_SETTINGS_VERSION) {
		throw new Error(`Unsupported storyForge settings version: ${String(parsed.version)}`);
	}
	if (
		typeof parsed.exportedAt !== "string" ||
		!Number.isFinite(Date.parse(parsed.exportedAt))
	) {
		throw new Error("The export timestamp is invalid");
	}
	if (parsed.description !== undefined && typeof parsed.description !== "string") {
		throw new Error("The export description is invalid");
	}
	if (!isSelection(parsed.included)) {
		throw new Error("The export is missing its included-sections metadata");
	}
	for (const key of ["storySettings", "formatting"] as const) {
		if (parsed[key] !== null && !isRecord(parsed[key])) {
			throw new Error(`The ${key} section is invalid`);
		}
	}
	if (parsed.palette !== null && !isPalette(parsed.palette)) {
		throw new Error("The palette section is invalid");
	}
	if (
		parsed.included.storySettings !== (parsed.storySettings !== null) ||
		parsed.included.formatting !== (parsed.formatting !== null) ||
		parsed.included.palette !== (parsed.palette !== null)
	) {
		throw new Error("The included-sections metadata does not match the export contents");
	}
	return parsed as unknown as StoryForgeSettingsDocument;
}
