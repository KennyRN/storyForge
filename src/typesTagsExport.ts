import type { App } from "obsidian";
import {
	readTagRegistry,
	replaceTagLists,
	type TagDefinition,
	type TagRegistryShape,
} from "./tagRegistry";
import {
	cloneVaultTags,
	parseVaultTagsShape,
	replaceVaultTags,
	type VaultTagsShape,
} from "./vaultTags";

export const TYPES_TAGS_EXPORT_FORMAT = "storyforge-types-tags" as const;
export const TYPES_TAGS_EXPORT_VERSION = 1 as const;

export const EMPTY_VAULT_TAGS_EXPORT: VaultTagsShape = { order: [], tags: [] };

export interface TypesTagsExportSelection {
	types: boolean;
	codexTags: boolean;
	chapterTags: boolean;
	novelTags: boolean;
}

export interface TypesTagsExportDocument {
	format: typeof TYPES_TAGS_EXPORT_FORMAT;
	version: typeof TYPES_TAGS_EXPORT_VERSION;
	exportedAt: string;
	description?: string;
	included: TypesTagsExportSelection;
	types: TagDefinition[] | null;
	codexTags: VaultTagsShape | null;
	chapterTags: TagDefinition[] | null;
	novelTags: TagDefinition[] | null;
}

function parseExportedTagDefinition(value: unknown): TagDefinition | null {
	if (!value || typeof value !== "object") return null;
	const entry = value as Record<string, unknown>;
	const id = typeof entry.id === "string" ? entry.id.trim() : "";
	if (!id) return null;
	const label = typeof entry.label === "string" && entry.label.trim() ? entry.label : id;
	const iconAlias =
		typeof entry.iconAlias === "string"
			? entry.iconAlias
			: typeof entry["icon-alias"] === "string"
				? entry["icon-alias"]
				: "";
	const parentRaw = entry.parentId ?? entry["parent-id"];
	const parentId = typeof parentRaw === "string" && parentRaw ? parentRaw : null;
	return parentId ? { id, label, iconAlias, parentId } : { id, label, iconAlias };
}

function parseExportedTagList(raw: unknown): TagDefinition[] | null {
	if (raw == null) return null;
	if (!Array.isArray(raw)) return [];
	const result: TagDefinition[] = [];
	for (const value of raw) {
		const parsed = parseExportedTagDefinition(value);
		if (parsed) result.push(parsed);
	}
	return result;
}

function parseExportedVaultTags(raw: unknown): VaultTagsShape | null {
	if (raw == null) return null;
	return parseVaultTagsShape(raw);
}

function includedFlag(raw: unknown, fallback: boolean): boolean {
	if (raw === false) return false;
	if (raw === true) return true;
	return fallback;
}

export function hasTypesTagsSelection(included: TypesTagsExportSelection): boolean {
	return included.types || included.codexTags || included.chapterTags || included.novelTags;
}

function resolveIncluded(
	partial?: Partial<TypesTagsExportSelection>,
): TypesTagsExportSelection {
	return {
		types: partial?.types ?? true,
		codexTags: partial?.codexTags ?? true,
		chapterTags: partial?.chapterTags ?? true,
		novelTags: partial?.novelTags ?? true,
	};
}

/** Builds a portable types & tags document from the live registry (and optional vault `#tag`s). */
export function buildTypesTagsExport(
	registry: TagRegistryShape,
	exportedAt: Date = new Date(),
	options: {
		description?: string;
		included?: Partial<TypesTagsExportSelection>;
		vaultTags?: VaultTagsShape;
	} = {},
): TypesTagsExportDocument {
	const included = resolveIncluded(options.included);
	const description = options.description?.trim();
	const vaultTags = options.vaultTags ?? EMPTY_VAULT_TAGS_EXPORT;
	return {
		format: TYPES_TAGS_EXPORT_FORMAT,
		version: TYPES_TAGS_EXPORT_VERSION,
		exportedAt: exportedAt.toISOString(),
		...(description ? { description } : {}),
		included,
		types: included.types ? registry.codexTypes : null,
		codexTags: included.codexTags ? cloneVaultTags(vaultTags) : null,
		chapterTags: included.chapterTags ? registry.chapterTags : null,
		novelTags: included.novelTags ? registry.novelTags : null,
	};
}

export function stringifyTypesTagsExport(document: TypesTagsExportDocument): string {
	return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseTypesTagsExport(raw: string): TypesTagsExportDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("Types & tags JSON is not valid");
	}
	if (!parsed || typeof parsed !== "object") throw new Error("Types & tags JSON is not an object");
	const value = parsed as Record<string, unknown>;
	if (value.format !== TYPES_TAGS_EXPORT_FORMAT) {
		throw new Error("JSON is not a storyForge types & tags export");
	}
	const nestedTags =
		value.tags && typeof value.tags === "object"
			? (value.tags as Record<string, unknown>)
			: null;
	const types = parseExportedTagList(value.types);
	const chapterTags =
		parseExportedTagList(value.chapterTags) ??
		(nestedTags ? parseExportedTagList(nestedTags.chapterTags ?? nestedTags["chapter-tags"]) : null);
	const novelTags =
		parseExportedTagList(value.novelTags) ??
		(nestedTags ? parseExportedTagList(nestedTags.novelTags ?? nestedTags["novel-tags"]) : null);
	const codexTags = parseExportedVaultTags(value.codexTags ?? value.vaultTags);
	const includedRaw =
		value.included && typeof value.included === "object"
			? (value.included as Record<string, unknown>)
			: {};
	const legacyTags = includedRaw.tags;
	const included: TypesTagsExportSelection = {
		types: includedFlag(includedRaw.types, types !== null),
		codexTags: includedFlag(includedRaw.codexTags ?? includedRaw.vaultTags, codexTags !== null),
		chapterTags: includedFlag(
			includedRaw.chapterTags ?? legacyTags,
			chapterTags !== null,
		),
		novelTags: includedFlag(includedRaw.novelTags ?? legacyTags, novelTags !== null),
	};
	const description = typeof value.description === "string" ? value.description.trim() : "";
	const exportedAt =
		typeof value.exportedAt === "string" && value.exportedAt
			? value.exportedAt
			: new Date().toISOString();
	return {
		format: TYPES_TAGS_EXPORT_FORMAT,
		version: TYPES_TAGS_EXPORT_VERSION,
		exportedAt,
		...(description ? { description } : {}),
		included,
		types: included.types ? (types ?? []) : null,
		codexTags: included.codexTags ? (codexTags ?? cloneVaultTags(EMPTY_VAULT_TAGS_EXPORT)) : null,
		chapterTags: included.chapterTags ? (chapterTags ?? []) : null,
		novelTags: included.novelTags ? (novelTags ?? []) : null,
	};
}

export async function applyTypesTagsDocument(
	app: App,
	document: TypesTagsExportDocument,
	included: TypesTagsExportSelection,
): Promise<TagRegistryShape> {
	const patch: Partial<TagRegistryShape> = {};
	if (included.types && document.types) patch.codexTypes = document.types;
	if (included.chapterTags && document.chapterTags) patch.chapterTags = document.chapterTags;
	if (included.novelTags && document.novelTags) patch.novelTags = document.novelTags;
	const registry =
		Object.keys(patch).length === 0 ? readTagRegistry(app) : await replaceTagLists(app, patch);
	if (included.codexTags && document.codexTags) {
		await replaceVaultTags(app, document.codexTags);
	}
	return registry;
}
