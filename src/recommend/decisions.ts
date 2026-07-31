/**
 * Two decision stores in `_sf-backstage/`:
 * 1. Attribution (shared, cross-tab) — confirm / reject-and-reroute for grey hits.
 * 2. Resolved (chapter tab only) — detail was handled (done and ignore are one state).
 *
 * Both key on normalised sentence; orphans whose sentence no longer exists are swept.
 */

import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import {
	recommendAttributionPath,
	recommendSidecarFolderPath,
	recommendSidecarPath,
} from "../paths";
import { ensureBackstageFolder, writeBackstageFile } from "../writeGuard";
import type { AttributionDecision } from "./types";

const AUTO_MARKER = "<!-- AUTO-MAINTAINED — do not edit, the plugin overwrites it -->";

export interface AttributionStore {
	decisions: AttributionDecision[];
}

export interface ResolvedStore {
	/** hashId values that have been resolved for this chapter. */
	resolvedIds: string[];
}

function parseFrontmatterBlock(raw: string): Record<string, unknown> {
	if (!raw.startsWith("---")) return {};
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return {};
	const yamlText = raw.slice(3, end).trim();
	if (yamlText.length === 0) return {};
	const parsed = parseYaml(yamlText) as Record<string, unknown> | null;
	return parsed ?? {};
}

function buildJsonSidecar(frontmatter: Record<string, unknown>, payload: unknown): string {
	const yaml = stringifyYaml(frontmatter).trimEnd();
	const body = ["", AUTO_MARKER, "", "```json", JSON.stringify(payload, null, 2), "```", ""].join("\n");
	return `---\n${yaml}\n---\n${body}`;
}

function parseJsonSidecar<T>(raw: string): T | null {
	const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
	if (!jsonMatch) return null;
	try {
		return JSON.parse(jsonMatch[1].trim()) as T;
	} catch {
		return null;
	}
}

/** Drop decisions whose sentence is no longer in the live prose. */
export function sweepAttributionOrphans(
	store: AttributionStore,
	liveSentences: Set<string>,
): AttributionStore {
	return {
		decisions: store.decisions.filter((d) => liveSentences.has(d.sentence)),
	};
}

export function sweepResolvedOrphans(store: ResolvedStore, liveIds: Set<string>): ResolvedStore {
	return {
		resolvedIds: store.resolvedIds.filter((id) => liveIds.has(id)),
	};
}

export async function readAttributionStore(app: App, bookFolderName: string): Promise<AttributionStore> {
	const path = recommendAttributionPath(bookFolderName);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return { decisions: [] };
	const parsed = parseJsonSidecar<AttributionStore>(await app.vault.cachedRead(file));
	if (!parsed || !Array.isArray(parsed.decisions)) return { decisions: [] };
	return parsed;
}

/**
 * Merge-save attribution decisions. Replaces the decision for the same
 * (entityPath, sentence) key; never clobbers unrelated entries.
 */
export async function upsertAttributionDecision(
	app: App,
	bookFolderName: string,
	decision: AttributionDecision,
): Promise<AttributionStore> {
	const current = await readAttributionStore(app, bookFolderName);
	const next: AttributionStore = {
		decisions: current.decisions.filter(
			(d) => !(d.entityPath === decision.entityPath && d.sentence === decision.sentence),
		),
	};
	next.decisions.push(decision);
	await ensureBackstageFolder(app.vault, recommendSidecarFolderPath(bookFolderName));
	const path = recommendAttributionPath(bookFolderName);
	await writeBackstageFile(
		app.vault,
		path,
		buildJsonSidecar({ kind: "attribution" }, next),
	);
	return next;
}

export async function writeAttributionStore(
	app: App,
	bookFolderName: string,
	store: AttributionStore,
): Promise<void> {
	await ensureBackstageFolder(app.vault, recommendSidecarFolderPath(bookFolderName));
	await writeBackstageFile(
		app.vault,
		recommendAttributionPath(bookFolderName),
		buildJsonSidecar({ kind: "attribution" }, store),
	);
}

/**
 * Resolved ids live beside the chapter recommend cache (frontmatter merge + JSON body).
 * When the cache sidecar does not yet exist, we write a minimal resolved-only file.
 */
export async function readResolvedStore(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
): Promise<ResolvedStore> {
	const path = recommendSidecarPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return { resolvedIds: [] };
	const raw = await app.vault.cachedRead(file);
	const fm = parseFrontmatterBlock(raw);
	if (Array.isArray(fm.resolvedIds)) {
		return { resolvedIds: fm.resolvedIds.filter((x): x is string => typeof x === "string") };
	}
	const body = parseJsonSidecar<{ resolvedIds?: string[] }>(raw);
	if (body && Array.isArray(body.resolvedIds)) return { resolvedIds: body.resolvedIds };
	return { resolvedIds: [] };
}

export async function markResolved(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	hitId: string,
): Promise<ResolvedStore> {
	const current = await readResolvedStore(app, bookFolderName, chapterFilename);
	if (current.resolvedIds.includes(hitId)) return current;
	const next: ResolvedStore = { resolvedIds: [...current.resolvedIds, hitId] };
	await persistResolvedIds(app, bookFolderName, chapterFilename, next.resolvedIds);
	return next;
}

async function persistResolvedIds(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	resolvedIds: string[],
): Promise<void> {
	await ensureBackstageFolder(app.vault, recommendSidecarFolderPath(bookFolderName));
	const path = recommendSidecarPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	let existing = "";
	if (file instanceof TFile) existing = await app.vault.read(file);

	const fm = parseFrontmatterBlock(existing);
	fm.resolvedIds = resolvedIds;
	if (!fm.chapter) fm.chapter = chapterFilename;

	const jsonMatch = existing.match(/```json\s*([\s\S]*?)```/);
	let payload: unknown = { resolvedIds };
	if (jsonMatch) {
		try {
			payload = JSON.parse(jsonMatch[1].trim());
			if (payload && typeof payload === "object") {
				(payload as Record<string, unknown>).resolvedIds = resolvedIds;
			}
		} catch {
			payload = { resolvedIds };
		}
	}
	await writeBackstageFile(app.vault, path, buildJsonSidecar(fm, payload));
}

export async function writeResolvedIdsOntoCache(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	resolvedIds: string[],
	reportJson: unknown,
): Promise<void> {
	await ensureBackstageFolder(app.vault, recommendSidecarFolderPath(bookFolderName));
	const path = recommendSidecarPath(bookFolderName, chapterFilename);
	const fm: Record<string, unknown> = {
		chapter: chapterFilename,
		resolvedIds,
	};
	if (reportJson && typeof reportJson === "object" && "contentHash" in reportJson) {
		fm.contentHash = (reportJson as { contentHash: string }).contentHash;
	}
	const payload =
		reportJson && typeof reportJson === "object"
			? { ...(reportJson as object), resolvedIds }
			: { resolvedIds };
	await writeBackstageFile(app.vault, path, buildJsonSidecar(fm, payload));
}
