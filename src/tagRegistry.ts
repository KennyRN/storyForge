import { App, type FrontMatterCache } from "obsidian";
import { tagRegistryFilePath } from "./paths";
import { modifyBackstageFrontmatter } from "./writeGuard";
import { mintId } from "./slug";
import { ICON_TAG } from "./icons";
import { CODEX_ICON_CATALOG, TAG_ICON_CATALOG } from "./iconRegistry";
import { loadCodexTypesFromRegistry, type CodexTypeOption } from "./codex";

/** One entry in an editable type/tag list (Codex types, chapter tags, or novel tags). */
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
	 * and CodexSetTypeModal). chapterTags/novelTags never set it.
	 */
	parentId?: string | null;
}

export type TagListKind = "codexTypes" | "chapterTags" | "novelTags";

export interface TagRegistryShape {
	codexTypes: TagDefinition[];
	chapterTags: TagDefinition[];
	novelTags: TagDefinition[];
}

interface RawTagDefinition {
	id?: unknown;
	label?: unknown;
	"icon-alias"?: unknown;
	"parent-id"?: unknown;
}

/** The raw, dash-cased on-disk shape of tag-registry.md's frontmatter, as read/written through `modifyBackstageFrontmatter`. */
export interface RawTagRegistryFrontmatter extends FrontMatterCache {
	"codex-types"?: unknown;
	"chapter-tags"?: unknown;
	"novel-tags"?: unknown;
}

const RAW_KEY: Record<TagListKind, "codex-types" | "chapter-tags" | "novel-tags"> = {
	codexTypes: "codex-types",
	chapterTags: "chapter-tags",
	novelTags: "novel-tags",
};

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

export const DEFAULT_TAG_REGISTRY_CONTENT = `---\ncodex-types:\n${tagDefinitionsYaml(SEED_CODEX_TYPES)}\nchapter-tags:\n${tagDefinitionsYaml(SEED_CHAPTER_TAGS)}\nnovel-tags:\n${tagDefinitionsYaml(SEED_NOVEL_TAGS)}\n---\n`;

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
	if (!file) {
		return {
			codexTypes: SEED_CODEX_TYPES.map((e) => ({ ...e })),
			chapterTags: SEED_CHAPTER_TAGS.map((e) => ({ ...e })),
			novelTags: SEED_NOVEL_TAGS.map((e) => ({ ...e })),
		};
	}
	const cache = app.metadataCache.getCache(path);
	const fm = cache?.frontmatter;
	return {
		codexTypes: parseTagDefinitions(fm?.["codex-types"]),
		chapterTags: parseTagDefinitions(fm?.["chapter-tags"]),
		novelTags: parseTagDefinitions(fm?.["novel-tags"]),
	};
}

/** Resolves a tag/type's `iconAlias` to the real icon id `setIcon` needs, falling back to a generic
 * icon if the alias is stale. Codex types draw from CODEX_ICON_CATALOG; chapter/novel/Codex tags
 * share TAG_ICON_CATALOG — both are fixed, programmer-curated lists (see src/iconRegistry.ts),
 * never user-extensible. */
export function resolveIconAlias(list: TagListKind, alias: string): string {
	const catalog = list === "codexTypes" ? CODEX_ICON_CATALOG : TAG_ICON_CATALOG;
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
		return {
			codexTypes: SEED_CODEX_TYPES.map((e) => ({ ...e })),
			chapterTags: SEED_CHAPTER_TAGS.map((e) => ({ ...e })),
			novelTags: SEED_NOVEL_TAGS.map((e) => ({ ...e })),
		};
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

/**
 * Returns the freshly-written `list` entries (the same array used to build the frontmatter) rather
 * than void — callers that need to reflect the mutation back into their own UI immediately
 * (TagRegistryModal, CodexSetTypeModal, TagPickerModal) should use this return value instead of
 * turning around and calling readTagRegistry() again: `app.metadataCache` doesn't update
 * synchronously with `processFrontMatter` in real Obsidian (see ensureTagRegistryFile's doc
 * comment), so an immediate re-read after await can still see the pre-mutation frontmatter —
 * exactly the "added type doesn't show up until the modal is reopened" class of bug this avoids.
 */
async function mutateTagList(
	app: App,
	list: TagListKind,
	mutate: (entries: TagDefinition[]) => TagDefinition[],
): Promise<TagDefinition[]> {
	const path = tagRegistryFilePath();
	const key = RAW_KEY[list];
	let result: TagDefinition[] = [];
	await modifyBackstageFrontmatter<RawTagRegistryFrontmatter>(app, app.vault, path, DEFAULT_TAG_REGISTRY_CONTENT, (fm) => {
		const current = parseTagDefinitions(fm[key]);
		const next = mutate(current);
		result = next;
		fm[key] = next.map((e) =>
			e.parentId
				? { id: e.id, label: e.label, "icon-alias": e.iconAlias, "parent-id": e.parentId }
				: { id: e.id, label: e.label, "icon-alias": e.iconAlias },
		);
		// Refresh codex.ts's live CODEX_TYPES from what was *just* written — not a metadataCache
		// re-read, which doesn't update synchronously with processFrontMatter in real Obsidian
		// (see ensureTagRegistryFile's doc comment).
		if (list === "codexTypes") {
			const resolved: CodexTypeOption[] = next.map((t) => ({
				type: t.id,
				label: t.label,
				icon: resolveIconAlias("codexTypes", t.iconAlias),
				parentId: t.parentId ?? null,
			}));
			loadCodexTypesFromRegistry(resolved);
		}
	});
	return result;
}

/** Return shape for mutators whose callers need to reflect the change back into their own UI
 * immediately (see mutateTagList's doc comment) — `entries` is the fresh, post-mutation list for
 * the `list` that was touched; safe to render from directly instead of calling readTagRegistry(). */
export interface TagDefinitionMutationResult {
	entries: TagDefinition[];
}

/**
 * Mints a new id from `label`, appends it to `list`, and returns the new id plus the list's fresh
 * post-add entries. `parentId` nests the new entry under an existing id in the same list — only
 * ever passed for `codexTypes`, and only for a child of the built-in "person"/"place" types (see
 * TagDefinition.parentId).
 */
export async function addTagDefinition(
	app: App,
	list: TagListKind,
	label: string,
	iconAlias: string,
	parentId?: string | null,
): Promise<{ id: string } & TagDefinitionMutationResult> {
	const trimmed = label.trim();
	if (!trimmed) throw new Error("addTagDefinition: label is required");
	let newId = "";
	const entries = await mutateTagList(app, list, (current) => {
		newId = mintId(trimmed, current.map((e) => e.id));
		return [...current, parentId ? { id: newId, label: trimmed, iconAlias, parentId } : { id: newId, label: trimmed, iconAlias }];
	});
	return { id: newId, entries };
}

export async function renameTagDefinition(app: App, list: TagListKind, id: string, newLabel: string): Promise<TagDefinitionMutationResult> {
	const trimmed = newLabel.trim();
	if (!trimmed) throw new Error("renameTagDefinition: label is required");
	const entries = await mutateTagList(app, list, (current) => current.map((e) => (e.id === id ? { ...e, label: trimmed } : e)));
	return { entries };
}

export async function setTagDefinitionIcon(app: App, list: TagListKind, id: string, iconAlias: string): Promise<TagDefinitionMutationResult> {
	const entries = await mutateTagList(app, list, (current) => current.map((e) => (e.id === id ? { ...e, iconAlias } : e)));
	return { entries };
}

/** Removes `id` from the registry list only — any chapter/novel/note still referencing it keeps the raw id untouched (non-destructive).
 * No-ops for a protected Codex type id (see PROTECTED_CODEX_TYPE_IDS) — UI surfaces should already
 * hide the delete affordance for these, this is just the backstop. */
export async function deleteTagDefinition(app: App, list: TagListKind, id: string): Promise<TagDefinitionMutationResult> {
	if (list === "codexTypes" && PROTECTED_CODEX_TYPE_IDS.has(id)) return { entries: readTagRegistry(app)[list] };
	const entries = await mutateTagList(app, list, (current) => current.filter((e) => e.id !== id));
	return { entries };
}

/** Reorders `list` to match `newIdOrder`. Any existing id missing from `newIdOrder` is appended at the end, preserving its relative order, so a stale/partial order can't silently drop entries. */
export async function reorderTagDefinitions(app: App, list: TagListKind, newIdOrder: string[]): Promise<TagDefinitionMutationResult> {
	const entries = await mutateTagList(app, list, (current) => {
		const byId = new Map(current.map((e) => [e.id, e]));
		const reordered: TagDefinition[] = [];
		for (const id of newIdOrder) {
			const entry = byId.get(id);
			if (entry) {
				reordered.push(entry);
				byId.delete(id);
			}
		}
		for (const entry of current) {
			if (byId.has(entry.id)) reordered.push(entry);
		}
		return reordered;
	});
	return { entries };
}
