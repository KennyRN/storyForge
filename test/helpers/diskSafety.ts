/**
 * The harness behind the disk-safety suite (Brief 2 §5.2). For one data-layer operation on a fresh
 * copy of a fixture it checks:
 *  1. prose is untouched (chapter files and Codex note bodies keep their bytes);
 *  2. only the expected files change, appear or disappear;
 *  3. rewrites are minimal (every part of a changed file the operation didn't touch is byte-identical);
 *  4. residue survives (files of cut features, unknown keys, files outside storyForge's folders);
 *  5. the index equals what a fresh scan of the disk gives.
 */
import { expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { isMap, isScalar, parseDocument, type Pair } from "yaml";
import { NodeFsBackend } from "../../src/backends/node-fs";
import { bodyOf, readFrontmatter, splitFrontmatterSection, type FrontmatterRecord } from "../../src/core/frontmatter";
import { Project } from "../../src/core/project";
import { ProjectIndex } from "../../src/core/projectIndex";
import { copyFixture, diffSnapshots, snapshot } from "./fixtures";

export interface Ctx {
	root: string;
	project: Project;
	backend: NodeFsBackend;
	abs(rel: string): string;
	read(rel: string): string;
}

export interface FileSpec {
	/** How to compare the file: a markdown file with frontmatter, a whole-file YAML document, or just "may change". */
	format: "frontmatter" | "yaml" | "text";
	/** Key paths the operation may change (e.g. [["chapters","ch-a1.md","pov"]]). Everything else must be byte-identical. */
	touched?: string[][];
	/** Frontmatter files: the note body below must be unchanged (default true for "frontmatter"). */
	bodySame?: boolean;
	/** Text files: the frontmatter section must be unchanged, only the rest may differ. */
	frontmatterSame?: boolean;
}

export interface OpSpec {
	name: string;
	fixture?: string;
	/** An action made "outside the app" before the baseline is taken (a rename in a file manager, say). */
	setup?: (ctx: Ctx) => Promise<void>;
	run: (ctx: Ctx) => Promise<unknown>;
	changed?: Record<string, FileSpec>;
	added?: string[];
	/** Added files whose names are minted (matched by pattern; each must match exactly one new file in total). */
	anyAdded?: RegExp;
	removed?: string[];
	/** The operation must reject (and change nothing beyond `changed`/`added`/`removed`, usually nothing). */
	throws?: RegExp | true;
}

const PROSE = [/^_story-library\/[^/]+\/[^/]+\.md$/i, /^Codex\/[^/]+\.md$/i];
const RESIDUE = [
	"_backstage/titleforge/",
	"_backstage/storyforge/plot-threads.md",
	"_backstage/storyforge/vault-tags.md",
	"_backstage/storyforge/notes.md",
	"_backstage/storyforge/settings-presets/",
	"_backstage/storyforge/aaa/story-details/attribution.md",
	"_export/",
	"notes/",
	"elsewhere/",
	".obsidian/",
];

export async function openCtx(fixture = "series"): Promise<Ctx> {
	const root = copyFixture(fixture);
	const backend = new NodeFsBackend(root);
	const project = await Project.open(backend);
	return { root, project, backend, abs: (rel) => path.join(root, rel), read: (rel) => fs.readFileSync(path.join(root, rel), "utf8") };
}

// ---------------------------------------------------------------------- minimality helpers

function lineBreakEnd(src: string, i: number): number {
	const n = src.indexOf("\n", i);
	return n === -1 ? src.length : n;
}

/** The source text of every `key: value` pair down to depth 4, keyed by key path (joined with \u0001). */
function pairBlocks(block: string): Map<string, string> {
	const out = new Map<string, string>();
	const doc = parseDocument(block, { uniqueKeys: false });
	const walk = (map: unknown, prefix: string[], depth: number) => {
		if (!isMap(map) || depth > 4) return;
		for (const pair of (map as { items: Pair[] }).items) {
			if (!isScalar(pair.key)) continue;
			const key = String(pair.key.value);
			const keyPath = [...prefix, key];
			const value = pair.value as { range?: [number, number, number] } | null;
			let end = pair.key.range![1];
			if (value && value.range) {
				end = value.range[1];
				while (end > pair.key.range![0] && /[\r\n \t]/.test(block[end - 1])) end--;
			} else {
				end = lineBreakEnd(block, end);
			}
			out.set(keyPath.join("\u0001"), block.slice(pair.key.range![0], Math.max(end, pair.key.range![1])));
			walk(pair.value, keyPath, depth + 1);
		}
	};
	walk(doc.contents, [], 1);
	return out;
}

function frontmatterBlock(text: string): string {
	const section = splitFrontmatterSection(text);
	if (!section) return "";
	const lines = section.frontmatter.split("\n");
	return lines.slice(1, -2).join("\n") + (lines.length > 3 ? "\n" : "");
}

function related(a: string[], b: string[]): boolean {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
	return true;
}

export function leafDiffs(before: unknown, after: unknown, at: string[] = []): string[][] {
	if (JSON.stringify(before) === JSON.stringify(after)) return [];
	const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
	if (isObj(before) && isObj(after)) {
		const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
		return [...keys].flatMap((k) => leafDiffs(before[k], after[k], [...at, k]));
	}
	return [at];
}

export function assertMinimal(file: string, beforeText: string, afterText: string, spec: FileSpec): void {
	const touched = spec.touched ?? [];
	if (spec.format === "text") {
		if (spec.frontmatterSame) {
			expect(splitFrontmatterSection(afterText)?.frontmatter, `${file}: frontmatter must not change`).toBe(splitFrontmatterSection(beforeText)?.frontmatter);
		}
		return;
	}
	let beforeData: FrontmatterRecord;
	let afterData: FrontmatterRecord;
	let beforeBlock: string;
	let afterBlock: string;
	if (spec.format === "frontmatter") {
		const b = readFrontmatter(beforeText);
		const a = readFrontmatter(afterText);
		beforeData = b.state === "ok" ? b.data : {};
		afterData = a.state === "ok" ? a.data : {};
		beforeBlock = frontmatterBlock(beforeText);
		afterBlock = frontmatterBlock(afterText);
		if (spec.bodySame !== false) expect(bodyOf(afterText), `${file}: the note body must not change`).toBe(bodyOf(beforeText));
	} else {
		beforeData = (parseDocument(beforeText).toJS() ?? {}) as FrontmatterRecord;
		afterData = (parseDocument(afterText).toJS() ?? {}) as FrontmatterRecord;
		beforeBlock = beforeText;
		afterBlock = afterText;
	}
	// data level: every difference lies under a touched path
	for (const diff of leafDiffs(beforeData, afterData)) {
		expect(
			touched.some((t) => related(t, diff)),
			`${file}: unexpected change at ${diff.join(" > ")} (touched: ${touched.map((t) => t.join(" > ")).join(", ") || "none"})`,
		).toBe(true);
	}
	// text level: every pair the operation didn't touch keeps its exact source text
	const beforePairs = pairBlocks(beforeBlock);
	const afterPairs = pairBlocks(afterBlock);
	for (const [key, text] of beforePairs) {
		const keyPath = key.split("\u0001");
		if (touched.some((t) => related(t, keyPath))) continue;
		// (a comment that used to follow a deleted sibling may now trail this entry: allow the text to grow, never change)
		const afterText = afterPairs.get(key);
		expect(afterText?.startsWith(text) ?? false, `${file}: untouched entry "${keyPath.join(" > ")}" was rewritten\nbefore: ${JSON.stringify(text)}\nafter:  ${JSON.stringify(afterText)}`).toBe(true);
	}
}

// ------------------------------------------------------------------------------ the check

function isProse(p: string): boolean {
	return PROSE.some((re) => re.test(p));
}

function normalisedIndex(index: ProjectIndex) {
	return index
		.all()
		.map((e) => ({ ...e, mtimeMs: 0 }))
		.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export async function checkOperation(spec: OpSpec): Promise<void> {
	const ctx = await openCtx(spec.fixture);
	await spec.setup?.(ctx);
	const before = snapshot(ctx.root);
	const beforeText = new Map<string, string>();
	for (const key of before.keys()) {
		if (key.endsWith("/")) continue;
		const buf = fs.readFileSync(ctx.abs(key));
		beforeText.set(key, buf.toString("utf8"));
	}

	let error: unknown;
	try {
		await spec.run(ctx);
	} catch (err) {
		error = err;
	}
	if (spec.throws) {
		expect(error, `${spec.name}: expected the operation to be refused`).toBeDefined();
		if (spec.throws instanceof RegExp) expect(String((error as Error).message ?? error)).toMatch(spec.throws);
	} else if (error) {
		throw error;
	}

	const after = snapshot(ctx.root);
	const fileOnly = (m: Map<string, string>) => new Map([...m].filter(([k]) => !k.endsWith("/")));
	const diff = diffSnapshots(fileOnly(before), fileOnly(after));

	// 2. only the expected files change
	const expectChanged = Object.keys(spec.changed ?? {}).sort();
	expect(diff.changed, `${spec.name}: changed files`).toEqual(expectChanged);
	let addedFiles = diff.added;
	if (spec.anyAdded) {
		const minted = addedFiles.filter((f) => spec.anyAdded!.test(f));
		expect(minted, `${spec.name}: exactly one minted file`).toHaveLength(1);
		addedFiles = addedFiles.filter((f) => f !== minted[0]);
	}
	expect(addedFiles, `${spec.name}: added files`).toEqual([...(spec.added ?? [])].sort());
	expect(diff.removed, `${spec.name}: removed files`).toEqual([...(spec.removed ?? [])].sort());

	// 1. prose is untouched
	for (const [file] of fileOnly(before)) {
		if (!isProse(file)) continue;
		if (spec.removed?.includes(file)) continue; // moved by the (external) setup or an expected rename
		if (spec.changed?.[file]) {
			// only a Codex note's frontmatter may change, never its body
			expect(/^Codex\//i.test(file), `${spec.name}: ${file} is a chapter and must not change`).toBe(true);
			expect(bodyOf(fs.readFileSync(ctx.abs(file), "utf8")), `${spec.name}: ${file} body`).toBe(bodyOf(beforeText.get(file) as string));
			continue;
		}
		expect(after.get(file), `${spec.name}: prose file ${file} changed`).toBe(before.get(file));
	}

	// 3. rewrites are minimal
	for (const [file, fileSpec] of Object.entries(spec.changed ?? {})) {
		assertMinimal(file, beforeText.get(file) as string, fs.readFileSync(ctx.abs(file), "utf8"), fileSpec);
	}

	// 4. residue survives
	for (const [file, hash] of fileOnly(before)) {
		if (!RESIDUE.some((r) => (r.endsWith("/") ? file.startsWith(r) : file === r))) continue;
		if (spec.removed?.includes(file) || spec.changed?.[file]) continue;
		expect(after.get(file), `${spec.name}: residue file ${file} changed`).toBe(hash);
	}

	// 5. the index equals a fresh scan
	if (!spec.throws || diff.changed.length + diff.added.length + diff.removed.length > 0) {
		const fresh = await ProjectIndex.build(new NodeFsBackend(ctx.root));
		expect(normalisedIndex(ctx.project.index), `${spec.name}: index vs disk`).toEqual(normalisedIndex(fresh));
	}
}
