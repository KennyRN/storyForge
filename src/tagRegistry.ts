import { App } from "obsidian";
import { tagRegistryFilePath } from "./paths";
import { modifyBackstageFrontmatter } from "./writeGuard";
import { ICON_TAG } from "./icons";
import { CODEX_ICON_CATALOG, TAG_ICON_CATALOG } from "./iconRegistry";
import { loadCodexTypesFromRegistry, type CodexTypeOption } from "./codex";

/** One entry in a type/tag list as stored in tag-registry.md (read-only here: nothing in the app edits the registry). */
export interface TagDefinition {
	/** Slug id, minted from `label` when created. Stable once created — this is what per-chapter/per-novel/per-note assignments store. */
	id: string;
	label: string;
	/** References an alias in the fixed icon catalog for this list's kind (see resolveIconAlias) — never a raw icon id. */
	iconAlias: string;
	/**
	 * Nested-type parent — another id in the same list, or null/undefined at the root. Only
	 * `codexTypes` ever sets this, and only as a child of the built-in "person" or "place" types
	 * (nesting is deliberately not offered anywhere else — see TagRegistryModal's Codex types tab
	 * and CodexSetTypeModal). Notebook/Archive types and chapterTags/novelTags never set it.
	 */
	parentId?: string | null;
}

export type TagListKind = "codexTypes" | "chapterTags" | "novelTags" | "ideaTypes" | "archiveTypes";

export interface TagRegistryShape {
	codexTypes: TagDefinition[];
	chapterTags: TagDefinition[];
	novelTags: TagDefinition[];
	ideaTypes: TagDefinition[];
	archiveTypes: TagDefinition[];
}

interface RawTagDefinition {
	id?: unknown;
	label?: unknown;
	"icon-alias"?: unknown;
	"parent-id"?: unknown;
}

/** Used when a tag/type's `iconAlias` no longer resolves (a stale alias from an older catalog). */
const FALLBACK_ICON_ID = ICON_TAG;

/** Codex's three original hardcoded types, seeded once so nothing breaks for existing vaults —
 * editable (rename/re-icon/reorder) from here on. "populace" is also fully deletable; "person" and
 * "place" are not (see PROTECTED_CODEX_TYPE_IDS) — enough of the app assumes they exist (facts
 * sections, PoV/location pickers, host-API sibling assumptions) that deleting them isn't safe. */
const SEED_CODEX_TYPES: readonly TagDefinition[] = [
	{ id: "person", label: "Person", iconAlias: "person-fill" },
	{ id: "place", label: "Place", iconAlias: "location-pin" },
	{ id: "populace", label: "Populace", iconAlias: "person-2-fill" },
];

/** Codex type ids that can be renamed/re-iconed but never deleted — too much of the app assumes
 * a "person" and a "place" type exist (PoV/location pickers, facts sections, host-API sibling
 * assumptions). UI surfaces (CodexSetTypeModal, TagRegistryModal) should hide their delete
 * affordance for these ids; this is the enforcement layer underneath that, in case anything else
 * ever calls deleteTagDefinition directly. */
export const PROTECTED_CODEX_TYPE_IDS: ReadonlySet<string> = new Set(["person", "place"]);

/** Starter chapter tags — editing/review status, the main use case this feature was built for. */
const SEED_CHAPTER_TAGS: readonly TagDefinition[] = [
	{ id: "draft", label: "Draft", iconAlias: "pencil" },
	{ id: "2nd-pass", label: "2nd Pass", iconAlias: "number-2" },
	{ id: "done", label: "Done!", iconAlias: "done-fill" },
	{ id: "favourite", label: "Favourite", iconAlias: "bookmark-fill" },
];

/** Starter novel tags — whole-book status. */
const SEED_NOVEL_TAGS: readonly TagDefinition[] = [
	{ id: "drafting", label: "Drafting", iconAlias: "pencil" },
	{ id: "editing", label: "Editing", iconAlias: "warning-square" },
	{ id: "done", label: "Done!", iconAlias: "done-fill" },
	{ id: "favourite", label: "Favourite", iconAlias: "bookmark-fill" },
];

function tagDefinitionsYaml(entries: readonly TagDefinition[]): string {
	return entries
		.map((e) => {
			const base = `  - id: ${JSON.stringify(e.id)}\n    label: ${JSON.stringify(e.label)}\n    icon-alias: ${JSON.stringify(e.iconAlias)}`;
			return e.parentId ? `${base}\n    parent-id: ${JSON.stringify(e.parentId)}` : base;
		})
		.join("\n");
}

export const DEFAULT_TAG_REGISTRY_CONTENT = `---\ncodex-types:\n${tagDefinitionsYaml(SEED_CODEX_TYPES)}\nchapter-tags:\n${tagDefinitionsYaml(SEED_CHAPTER_TAGS)}\nnovel-tags:\n${tagDefinitionsYaml(SEED_NOVEL_TAGS)}\nidea-types:\narchive-types:\n---\n`;

function seedTagRegistry(): TagRegistryShape {
	return {
		codexTypes: SEED_CODEX_TYPES.map((e) => ({ ...e })),
		chapterTags: SEED_CHAPTER_TAGS.map((e) => ({ ...e })),
		novelTags: SEED_NOVEL_TAGS.map((e) => ({ ...e })),
		ideaTypes: [],
		archiveTypes: [],
	};
}

function parseTagDefinitions(raw: unknown): TagDefinition[] {
	if (!Array.isArray(raw)) return [];
	const result: TagDefinition[] = [];
	for (const value of raw) {
		if (!value || typeof value !== "object") continue;
		const entry = value as RawTagDefinition;
		const id = typeof entry.id === "string" ? entry.id : null;
		if (!id) continue;
		const label = typeof entry.label === "string" ? entry.label : id;
		const iconAlias = typeof entry["icon-alias"] === "string" ? entry["icon-alias"] : "";
		const parentId = typeof entry["parent-id"] === "string" ? entry["parent-id"] : null;
		result.push(parentId ? { id, label, iconAlias, parentId } : { id, label, iconAlias });
	}
	return result;
}

export function readTagRegistry(app: App): TagRegistryShape {
	const path = tagRegistryFilePath();
	const file = app.vault.getAbstractFileByPath(path);
	if (!file) return seedTagRegistry();
	const cache = app.metadataCache.getCache(path);
	const fm = cache?.frontmatter;
	return {
		codexTypes: parseTagDefinitions(fm?.["codex-types"]),
		chapterTags: parseTagDefinitions(fm?.["chapter-tags"]),
		novelTags: parseTagDefinitions(fm?.["novel-tags"]),
		ideaTypes: parseTagDefinitions(fm?.["idea-types"]),
		archiveTypes: parseTagDefinitions(fm?.["archive-types"]),
	};
}

/** Resolves a tag/type's `iconAlias` to the real icon id `setIcon` needs, falling back to a generic
 * icon if the alias is stale. Codex / Notebook / Archive types draw from CODEX_ICON_CATALOG;
 * chapter/novel tags share TAG_ICON_CATALOG — both are fixed, programmer-curated lists
 * (see src/iconRegistry.ts), never user-extensible. */
export function resolveIconAlias(list: TagListKind, alias: string): string {
	const catalog = list === "chapterTags" || list === "novelTags" ? TAG_ICON_CATALOG : CODEX_ICON_CATALOG;
	return catalog.find((e) => e.alias === alias)?.iconId ?? FALLBACK_ICON_ID;
}

/** Idempotent: creates tag-registry.md, pre-seeded with today's 3 Codex types and a handful of
 * starter chapter/novel tags, if it doesn't exist yet. Returns the file's resulting contents —
 * computed directly from the seed on first creation rather than read back from
 * `app.metadataCache`, which doesn't update synchronously with `processFrontMatter` in real
 * Obsidian (same hazard `series.ts`'s `ensureAllSeriesBookEntries` documents and avoids). */
export async function ensureTagRegistryFile(app: App): Promise<TagRegistryShape> {
	const path = tagRegistryFilePath();
	if (!app.vault.getAbstractFileByPath(path)) {
		await modifyBackstageFrontmatter(app, app.vault, path, DEFAULT_TAG_REGISTRY_CONTENT, () => {
			/* defaults from DEFAULT_TAG_REGISTRY_CONTENT are sufficient */
		});
		return seedTagRegistry();
	}
	return readTagRegistry(app);
}

/** Rebuilds codex.ts's live CODEX_TYPES from the persisted registry. Call after ensureTagRegistryFile
 * (passing its result as `prefetched`, so a freshly-created file's contents don't need a same-tick
 * cache re-read) and after any codexTypes edit (where omitting `prefetched` to re-read is safe —
 * the file already existed before the edit). */
export function loadCodexTypesIntoRegistry(app: App, prefetched?: TagRegistryShape): void {
	const { codexTypes } = prefetched ?? readTagRegistry(app);
	const resolved: CodexTypeOption[] = codexTypes.map((t) => ({
		type: t.id,
		label: t.label,
		icon: resolveIconAlias("codexTypes", t.iconAlias),
		parentId: t.parentId ?? null,
	}));
	loadCodexTypesFromRegistry(resolved);
}
