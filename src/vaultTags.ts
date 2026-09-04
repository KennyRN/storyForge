import { App, TFile, type FrontMatterCache } from "obsidian";
import { ICON_TAG } from "./icons";
import { VAULT_TAG_ICON_CATALOG } from "./iconRegistry";
import {
	BACKSTAGE_ROOT,
	TITLEFORGE_BACKSTAGE_ROOT,
	isBackupFolderPath,
	isExportFolderPath,
	isNotesNotePath,
	vaultTagsFilePath,
} from "./paths";
import { modifyBackstageFrontmatter } from "./writeGuard";
import type { CodexTreeFolder, CodexTreeItem } from "./codexTree";

/** One discovered vault `#tag` plus the Codex-pane config the user has set for it. */
export interface VaultTagEntry {
	/** Obsidian tag name without a leading `#` (`character`, `foo/bar`). */
	id: string;
	/** Alias in VAULT_TAG_ICON_CATALOG. Empty until the user picks one. */
	iconAlias: string;
	/** Rail icon is shown only when this is true *and* `iconAlias` is set. */
	display: boolean;
	/** Notebook rail icon — independent of Codex `display`. */
	notesDisplay: boolean;
	/** Flat ranking of Codex file paths and folder ids for this tag's filtered tree. */
	pageOrder: string[];
}

export interface VaultTagsShape {
	/** Modal row order of tag ids. Ids not in the vault yet still sit here so a returning tag keeps its place. */
	order: string[];
	tags: VaultTagEntry[];
}

interface RawVaultTagEntry {
	id?: unknown;
	"icon-alias"?: unknown;
	iconAlias?: unknown;
	display?: unknown;
	"notes-display"?: unknown;
	notesDisplay?: unknown;
	"page-order"?: unknown;
	pageOrder?: unknown;
}

/** Raw on-disk shape of vault-tags.md's frontmatter. */
export interface RawVaultTagsFrontmatter extends FrontMatterCache {
	order?: unknown;
	tags?: unknown;
}

export const DEFAULT_VAULT_TAGS_CONTENT = `---\norder: []\ntags: []\n---\n`;

const EMPTY_VAULT_TAGS: VaultTagsShape = { order: [], tags: [] };

/** Strips a leading `#` (or several) and trims. Empty / whitespace-only strings are not tags. */
export function normalizeVaultTagId(raw: string): string | null {
	const trimmed = raw.trim().replace(/^#+/, "").trim();
	return trimmed.length > 0 ? trimmed : null;
}

function addTagsFromUnknown(out: Set<string>, value: unknown): void {
	if (typeof value === "string") {
		const id = normalizeVaultTagId(value);
		if (id) out.add(id);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) addTagsFromUnknown(out, item);
	}
}

/** Inline `tags` plus YAML `tags` / `tag` on one file's metadata cache. */
export function tagsFromFileCache(
	cache:
		| {
				tags?: Array<{ tag?: string }> | null;
				frontmatter?: Record<string, unknown> | null;
		  }
		| null
		| undefined,
): string[] {
	const out = new Set<string>();
	if (!cache) return [];
	for (const entry of cache.tags ?? []) {
		if (typeof entry?.tag === "string") {
			const id = normalizeVaultTagId(entry.tag);
			if (id) out.add(id);
		}
	}
	const fm = cache.frontmatter;
	if (fm) {
		addTagsFromUnknown(out, fm.tags);
		addTagsFromUnknown(out, fm.tag);
	}
	return [...out];
}

/** Plugin bookkeeping should not seed the vault-tag modal. `_backstage/` covers storyForge and titleForge. */
export function isVaultTagScanExcluded(path: string): boolean {
	if (path === "_backstage" || path.startsWith("_backstage/")) return true;
	if (path === BACKSTAGE_ROOT || path.startsWith(`${BACKSTAGE_ROOT}/`)) return true;
	if (path === TITLEFORGE_BACKSTAGE_ROOT || path.startsWith(`${TITLEFORGE_BACKSTAGE_ROOT}/`)) return true;
	return isBackupFolderPath(path) || isExportFolderPath(path);
}

function parseStringArray(raw: unknown): string[] {
	return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function parseVaultTagEntry(raw: unknown): VaultTagEntry | null {
	if (!raw || typeof raw !== "object") return null;
	const entry = raw as RawVaultTagEntry;
	const id = typeof entry.id === "string" ? normalizeVaultTagId(entry.id) : null;
	if (!id) return null;
	const iconAlias =
		typeof entry["icon-alias"] === "string"
			? entry["icon-alias"]
			: typeof entry.iconAlias === "string"
				? entry.iconAlias
				: "";
	const display = entry.display === true && iconAlias.length > 0;
	const notesDisplay =
		(entry["notes-display"] === true || entry.notesDisplay === true) && iconAlias.length > 0;
	return {
		id,
		iconAlias,
		display,
		notesDisplay,
		pageOrder: parseStringArray(entry["page-order"] ?? entry.pageOrder),
	};
}

function parseVaultTags(orderRaw: unknown, tagsRaw: unknown): VaultTagsShape {
	const tags: VaultTagEntry[] = [];
	const seen = new Set<string>();
	if (Array.isArray(tagsRaw)) {
		for (const value of tagsRaw) {
			const parsed = parseVaultTagEntry(value);
			if (!parsed || seen.has(parsed.id)) continue;
			seen.add(parsed.id);
			tags.push(parsed);
		}
	}
	const order: string[] = [];
	const orderSeen = new Set<string>();
	for (const value of parseStringArray(orderRaw)) {
		const id = normalizeVaultTagId(value);
		if (!id || orderSeen.has(id)) continue;
		orderSeen.add(id);
		order.push(id);
	}
	return { order, tags };
}

function toRawVaultTag(entry: VaultTagEntry): RawVaultTagEntry {
	return {
		id: entry.id,
		"icon-alias": entry.iconAlias,
		display: entry.display,
		"notes-display": entry.notesDisplay,
		"page-order": entry.pageOrder,
	};
}

export function cloneVaultTags(shape: VaultTagsShape): VaultTagsShape {
	return {
		order: [...shape.order],
		tags: shape.tags.map((entry) => ({
			...entry,
			notesDisplay: entry.notesDisplay === true,
			pageOrder: [...entry.pageOrder],
		})),
	};
}

/** Accepts the on-disk `{ order, tags }` object, a raw tags array, or JSON camelCase. */
export function parseVaultTagsShape(raw: unknown): VaultTagsShape {
	if (Array.isArray(raw)) {
		const items: unknown[] = raw;
		const ids = items.map((value): unknown => {
			if (value && typeof value === "object" && "id" in value) {
				return (value as { id?: unknown }).id;
			}
			return value;
		});
		return parseVaultTags(ids, items);
	}
	if (raw && typeof raw === "object") {
		const value = raw as Record<string, unknown>;
		return parseVaultTags(value.order, value.tags);
	}
	return cloneVaultTags(EMPTY_VAULT_TAGS);
}

export async function replaceVaultTags(app: App, next: VaultTagsShape): Promise<VaultTagsShape> {
	const raw = next.tags.map(toRawVaultTag);
	return mutateVaultTags(app, () => parseVaultTags(next.order, raw));
}

export function resolveVaultTagIconAlias(alias: string): string {
	return VAULT_TAG_ICON_CATALOG.find((entry) => entry.alias === alias)?.iconId ?? ICON_TAG;
}

export function readVaultTags(app: App): VaultTagsShape {
	const path = vaultTagsFilePath();
	if (!app.vault.getAbstractFileByPath(path)) return cloneVaultTags(EMPTY_VAULT_TAGS);
	const fm = app.metadataCache.getCache(path)?.frontmatter;
	return parseVaultTags(fm?.order, fm?.tags);
}

export async function ensureVaultTagsFile(app: App): Promise<VaultTagsShape> {
	const path = vaultTagsFilePath();
	if (!app.vault.getAbstractFileByPath(path)) {
		await modifyBackstageFrontmatter<RawVaultTagsFrontmatter>(app, app.vault, path, DEFAULT_VAULT_TAGS_CONTENT, () => {
			/* defaults from DEFAULT_VAULT_TAGS_CONTENT */
		});
		return cloneVaultTags(EMPTY_VAULT_TAGS);
	}
	return readVaultTags(app);
}

async function mutateVaultTags(app: App, mutate: (current: VaultTagsShape) => VaultTagsShape): Promise<VaultTagsShape> {
	const path = vaultTagsFilePath();
	let result = cloneVaultTags(EMPTY_VAULT_TAGS);
	await modifyBackstageFrontmatter<RawVaultTagsFrontmatter>(app, app.vault, path, DEFAULT_VAULT_TAGS_CONTENT, (fm) => {
		const next = mutate(parseVaultTags(fm.order, fm.tags));
		result = next;
		fm.order = next.order;
		fm.tags = next.tags.map(toRawVaultTag);
	});
	return result;
}

function upsertTag(current: VaultTagsShape, id: string, patch: Partial<Omit<VaultTagEntry, "id">>): VaultTagsShape {
	const existing = current.tags.find((entry) => entry.id === id);
	const merged: VaultTagEntry = {
		id,
		iconAlias: patch.iconAlias ?? existing?.iconAlias ?? "",
		display: false,
		notesDisplay: false,
		pageOrder: patch.pageOrder ? [...patch.pageOrder] : existing?.pageOrder ? [...existing.pageOrder] : [],
	};
	merged.display = merged.iconAlias.length > 0 && (patch.display ?? existing?.display ?? false);
	merged.notesDisplay = merged.iconAlias.length > 0 && (patch.notesDisplay ?? existing?.notesDisplay ?? false);
	const tags = existing
		? current.tags.map((entry) => (entry.id === id ? merged : entry))
		: [...current.tags, merged];
	return { order: current.order, tags };
}

export async function reorderVaultTags(app: App, newIdOrder: string[]): Promise<VaultTagsShape> {
	return mutateVaultTags(app, (current) => {
		const seen = new Set<string>();
		const order: string[] = [];
		for (const raw of newIdOrder) {
			const id = normalizeVaultTagId(raw);
			if (!id || seen.has(id)) continue;
			seen.add(id);
			order.push(id);
		}
		for (const id of current.order) {
			if (!seen.has(id)) {
				seen.add(id);
				order.push(id);
			}
		}
		return { order, tags: current.tags };
	});
}

export async function setVaultTagIcon(app: App, tagId: string, iconAlias: string): Promise<VaultTagsShape> {
	const id = normalizeVaultTagId(tagId);
	if (!id) return readVaultTags(app);
	const alias = iconAlias.trim();
	const inCatalog = alias.length === 0 || VAULT_TAG_ICON_CATALOG.some((entry) => entry.alias === alias);
	const nextAlias = inCatalog ? alias : "";
	return mutateVaultTags(app, (current) =>
		upsertTag(current, id, {
			iconAlias: nextAlias,
			display: nextAlias.length > 0 ? current.tags.find((entry) => entry.id === id)?.display ?? false : false,
			notesDisplay: nextAlias.length > 0 ? current.tags.find((entry) => entry.id === id)?.notesDisplay ?? false : false,
		}),
	);
}

/** `display` without an icon is a no-op — the checkbox is only meaningful after a pick. */
export async function setVaultTagDisplay(app: App, tagId: string, display: boolean): Promise<VaultTagsShape> {
	const id = normalizeVaultTagId(tagId);
	if (!id) return readVaultTags(app);
	return mutateVaultTags(app, (current) => {
		const existing = current.tags.find((entry) => entry.id === id);
		if (!existing?.iconAlias) {
			return existing ? current : upsertTag(current, id, { display: false });
		}
		return upsertTag(current, id, { display });
	});
}

/** Notebook rail `notesDisplay` — same icon-required rule as Codex `display`. */
export async function setVaultTagNotesDisplay(app: App, tagId: string, notesDisplay: boolean): Promise<VaultTagsShape> {
	const id = normalizeVaultTagId(tagId);
	if (!id) return readVaultTags(app);
	return mutateVaultTags(app, (current) => {
		const existing = current.tags.find((entry) => entry.id === id);
		if (!existing?.iconAlias) {
			return existing ? current : upsertTag(current, id, { notesDisplay: false });
		}
		return upsertTag(current, id, { notesDisplay });
	});
}

export async function setVaultTagPageOrder(app: App, tagId: string, pageOrder: string[]): Promise<VaultTagsShape> {
	const id = normalizeVaultTagId(tagId);
	if (!id) return readVaultTags(app);
	return mutateVaultTags(app, (current) => upsertTag(current, id, { pageOrder: [...pageOrder] }));
}

export function collectVaultTagIds(app: App): string[] {
	const files: TFile[] =
		typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
	const ids = new Set<string>();
	for (const file of files) {
		if (isVaultTagScanExcluded(file.path)) continue;
		for (const id of tagsFromFileCache(app.metadataCache.getCache(file.path))) ids.add(id);
	}
	return [...ids];
}

/** `#tags` that appear on at least one flat `notes/*.md` file (the Notebook shelf). */
export function collectNotesTagIds(app: App): Set<string> {
	const files: TFile[] =
		typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
	const ids = new Set<string>();
	for (const file of files) {
		if (!isNotesNotePath(file.path)) continue;
		for (const id of tagsFromFileCache(app.metadataCache.getCache(file.path))) ids.add(id);
	}
	return ids;
}

export function filterVisiblePathsByTag(
	app: App,
	visiblePaths: ReadonlySet<string>,
	tagId: string,
): ReadonlySet<string> {
	const normalized = normalizeVaultTagId(tagId);
	if (!normalized) return visiblePaths;
	const result = new Set<string>();
	for (const path of visiblePaths) {
		if (tagsFromFileCache(app.metadataCache.getCache(path)).includes(normalized)) result.add(path);
	}
	return result;
}

export interface VaultTagRow {
	id: string;
	iconAlias: string;
	display: boolean;
	notesDisplay: boolean;
}

/** Currently-in-the-vault tags, persisted order first, newcomers appended alphabetically.
 * Pass `presentIds` to restrict the list (Notebook modal: tags that appear on `notes/*.md`). */
export function listVaultTagRows(app: App, fresh?: VaultTagsShape, presentIds?: ReadonlySet<string>): VaultTagRow[] {
	const config = fresh ?? readVaultTags(app);
	const seen = presentIds ?? new Set(collectVaultTagIds(app));
	const byId = new Map(config.tags.map((entry) => [entry.id, entry]));
	const rows: VaultTagRow[] = [];
	const used = new Set<string>();
	const pushRow = (id: string): void => {
		const entry = byId.get(id);
		rows.push({
			id,
			iconAlias: entry?.iconAlias ?? "",
			display: Boolean(entry?.display && entry.iconAlias),
			notesDisplay: Boolean(entry?.notesDisplay && entry.iconAlias),
		});
	};
	for (const id of config.order) {
		if (!seen.has(id) || used.has(id)) continue;
		used.add(id);
		pushRow(id);
	}
	const newcomers = [...seen].filter((id) => !used.has(id)).sort((a, b) => a.localeCompare(b));
	for (const id of newcomers) {
		pushRow(id);
	}
	return rows;
}

export interface DisplayedVaultTag {
	id: string;
	iconAlias: string;
	iconId: string;
}

export function displayedVaultTags(app: App, fresh?: VaultTagsShape): DisplayedVaultTag[] {
	return listVaultTagRows(app, fresh)
		.filter((row) => row.display && row.iconAlias)
		.map((row) => ({
			id: row.id,
			iconAlias: row.iconAlias,
			iconId: resolveVaultTagIconAlias(row.iconAlias),
		}));
}

export function treeItemKey(item: CodexTreeItem): string {
	return item.type === "folder" ? item.id : item.path;
}

/** Stable sort of each sibling group by `pageOrder` rank; unranked keys keep their relative tree order, then follow. */
export function sortTreeByPageOrder(tree: CodexTreeFolder, pageOrder: readonly string[]): CodexTreeFolder {
	if (pageOrder.length === 0) return tree;
	const rank = new Map(pageOrder.map((key, index) => [key, index]));
	const sortItems = (items: CodexTreeItem[]): CodexTreeItem[] => {
		const indexed = items.map((item, index) => ({ item, index }));
		indexed.sort((a, b) => {
			const rankA = rank.get(treeItemKey(a.item));
			const rankB = rank.get(treeItemKey(b.item));
			if (rankA === undefined && rankB === undefined) return a.index - b.index;
			if (rankA === undefined) return 1;
			if (rankB === undefined) return -1;
			if (rankA !== rankB) return rankA - rankB;
			return a.index - b.index;
		});
		return indexed.map(({ item }) =>
			item.type === "folder" ? { ...item, children: sortItems(item.children) } : item,
		);
	};
	return { ...tree, children: sortItems(tree.children) };
}

/** Places `newSiblingOrder` as a contiguous block in `pageOrder`, keeping keys that aren't in that sibling set. */
export function applySiblingReorder(pageOrder: readonly string[], newSiblingOrder: readonly string[]): string[] {
	const siblingSet = new Set(newSiblingOrder);
	const firstIdx = pageOrder.findIndex((key) => siblingSet.has(key));
	if (firstIdx === -1) return [...pageOrder, ...newSiblingOrder];
	const before = pageOrder.slice(0, firstIdx).filter((key) => !siblingSet.has(key));
	const after = pageOrder.slice(firstIdx).filter((key) => !siblingSet.has(key));
	return [...before, ...newSiblingOrder, ...after];
}

export function siblingOrderAfterMove(siblings: readonly string[], draggedKey: string, beforeKey: string | null): string[] {
	if (beforeKey === draggedKey) return [...siblings];
	const without = siblings.filter((key) => key !== draggedKey);
	if (beforeKey === null) return [...without, draggedKey];
	const index = without.indexOf(beforeKey);
	if (index === -1) return [...without, draggedKey];
	return [...without.slice(0, index), draggedKey, ...without.slice(index)];
}
