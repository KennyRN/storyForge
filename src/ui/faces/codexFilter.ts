import { codexTypeMatchesOrDescendsFrom, collectCodexNotes, filterVisiblePathsByType, readCodexFrontmatter } from "../../core/codex";
import { codexBasename, collectReferencedPaths, isFolderKey, type CodexFolders, type CodexTreeFolder, type CodexTreeItem } from "../../core/codexTree";
import type { Project } from "../../core/project";

/**
 * The Codex's filter by type (decision 107). What is chosen is held in memory for the session only, per list (the storytelling Codex
 * list, the library's, the Archive): nothing here is ever written to the project. The matching is the core's own
 * (`filterVisiblePathsByType`: several types at once, either matching, a nested type counting under its parent), plus "Untyped",
 * which matches a note with no type. The filtered tree has its own folder rules, so it is built here from the same stored data.
 */
export interface TypeFilter {
	/** Registry type ids; a note matches if its type is one of these or nested under one. */
	types: Set<string>;
	/** Notes with no type. */
	untyped: boolean;
	/** Notes and folders created while this filter is on: they stay shown until the filter next changes (decision 107). */
	keptNotes: Set<string>;
	keptFolders: Set<string>;
}

export const newTypeFilter = (): TypeFilter => ({ types: new Set(), untyped: false, keptNotes: new Set(), keptFolders: new Set() });
export const isFiltering = (f: TypeFilter): boolean => f.types.size > 0 || f.untyped;

/** Choosing a type, "Untyped" or "Show all" changes the filter, so what was kept visible is let go. */
export function toggleType(f: TypeFilter, type: string): void {
	if (!f.types.delete(type)) f.types.add(type);
	forget(f);
}
export function toggleUntyped(f: TypeFilter): void {
	f.untyped = !f.untyped;
	forget(f);
}
export function clearFilter(f: TypeFilter): void {
	f.types.clear();
	f.untyped = false;
	forget(f);
}
const forget = (f: TypeFilter): void => (f.keptNotes.clear(), f.keptFolders.clear());

/** Which of these notes the filter shows (a note created while filtering is kept). */
export function matchingNotes(project: Project, f: TypeFilter, paths: readonly string[]): Set<string> {
	const all = new Set(paths);
	const out = new Set<string>(f.types.size ? filterVisiblePathsByType(project, all, f.types) : []);
	if (f.untyped) {
		const { types } = readCodexFrontmatter(project);
		for (const p of paths) if (!types[p]) out.add(p);
	}
	for (const p of f.keptNotes) if (all.has(p)) out.add(p);
	return out;
}

/**
 * The Codex tree with the filter on. A folder shows if anything inside it shows, or if its own linked note shows; a folder with
 * nothing showing goes, including an empty one (so there is no "Empty" line while filtering), unless it was created while
 * filtering. A matching note outside every folder shows in the plain list, as it does unfiltered.
 */
export function filteredCodexTree(project: Project, f: TypeFilter): CodexTreeFolder {
	const { folders, order } = readCodexFrontmatter(project);
	const real = collectCodexNotes(project);
	const matches = matchingNotes(project, f, real);
	return resolveFiltered(folders, order, new Set(real), matches, f.keptFolders);
}

/**
 * `plain` is the unfiltered list's own folder rule (the core's `resolveCodexTree`: an empty folder stays, so it can say "Empty", and
 * only a folder whose contents are all missing from `matches` goes). It exists so a test can prove this module, given every note,
 * draws exactly what the normal list draws, and fails if the two ever drift apart (decision 107).
 */
export function resolveFiltered(folders: CodexFolders, rootOrder: string[], realPaths: ReadonlySet<string>, matches: ReadonlySet<string>, keptFolders: ReadonlySet<string> = new Set(), plain = false): CodexTreeFolder {
	const build = (order: string[], seen: Set<string>): CodexTreeItem[] => {
		const out: CodexTreeItem[] = [];
		for (const key of order) {
			if (isFolderKey(folders, key)) {
				if (seen.has(key)) continue; // a folder is never drawn inside itself
				const entry = folders[key];
				const children = build(entry.order, new Set(seen).add(key));
				const linked = entry.linkedNotePath && realPaths.has(entry.linkedNotePath) ? entry.linkedNotePath : undefined;
				if (plain) {
					const hasRealContent = [...collectReferencedPaths(folders, entry.order)].some((p) => realPaths.has(p));
					if (children.length === 0 && hasRealContent) continue;
				} else if (children.length === 0 && !(linked && matches.has(linked)) && !keptFolders.has(key)) continue;
				out.push({ type: "folder", id: key, name: linked ? codexBasename(linked) : entry.name, children, path: linked });
			} else if (matches.has(key) && realPaths.has(key)) out.push({ type: "file", name: codexBasename(key), path: key });
		}
		return out;
	};
	const children = build(rootOrder, new Set());
	const referenced = collectReferencedPaths(folders, rootOrder);
	for (const path of realPaths) if (matches.has(path) && !referenced.has(path)) children.push({ type: "file", name: codexBasename(path), path });
	return { type: "folder", id: "", name: "Codex", children };
}

/** The Codex tree this module draws with no filter set: it must equal the normal list (see `resolveFiltered`'s `plain`). */
export function plainCodexTree(project: Project): CodexTreeFolder {
	const { folders, order } = readCodexFrontmatter(project);
	const real = collectCodexNotes(project);
	return resolveFiltered(folders, order, new Set(real), new Set(real), new Set(), true);
}

/** The archived Codex items the filter shows: a note by its own type, a folder if its linked note or anything inside it matches. */
export function archivedItemShown(project: Project, f: TypeFilter, key: string): boolean {
	if (!isFiltering(f)) return true;
	const { folders, types } = readCodexFrontmatter(project);
	const matches = (path: string): boolean => {
		const type = types[path];
		if (!type) return f.untyped;
		return [...f.types].some((t) => codexTypeMatchesOrDescendsFrom(type, t));
	};
	if (!isFolderKey(folders, key)) return matches(key);
	const entry = folders[key];
	if (entry.linkedNotePath && matches(entry.linkedNotePath)) return true;
	return [...collectReferencedPaths(folders, entry.order)].some(matches);
}

/** The filters held for the project that is open, by list: a new open starts with none, and nothing is stored anywhere. */
const held = new WeakMap<object, Map<string, TypeFilter>>();
export function filterFor(running: object, list: "codex-storytelling" | "codex-library" | "archive"): TypeFilter {
	let lists = held.get(running);
	if (!lists) held.set(running, (lists = new Map()));
	let f = lists.get(list);
	if (!f) lists.set(list, (f = newTypeFilter()));
	return f;
}
