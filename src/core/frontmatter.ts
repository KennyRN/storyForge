/**
 * Frontmatter: parse a markdown file's YAML block and apply a mutation to it, changing as little of
 * the file as possible (Brief 2 §1.2, §1.3; docs/project-handle.md §5 and §10).
 *
 * Writing never re-serialises the document. A mutation is run on a plain copy of the parsed data,
 * the difference is mapped back to source ranges in the *original* text, and only those ranges are
 * replaced. Unknown keys, comments, quoting, key order, blank lines, line endings and the note body
 * are therefore byte-identical unless a change touched them.
 *
 * Library: `yaml` (eemeli/yaml) 2.x, ISC licence — used for parsing, source ranges and for
 * generating the text of new/changed values.
 */
import { Document, Scalar, isMap, isScalar, parseDocument, stringify, visit } from "yaml";
import type { Pair, YAMLMap } from "yaml";

export type FrontmatterRecord = Record<string, unknown>;

/** The frontmatter block exists but cannot be read safely. Treat the file as unavailable, never as empty. */
export class UnreadableFrontmatterError extends Error {
	constructor(
		public readonly reason: string,
		public readonly path?: string,
	) {
		super(`Unreadable frontmatter${path ? ` in "${path}"` : ""}: ${reason}`);
		this.name = "UnreadableFrontmatterError";
	}
}

/** An edit produced text that does not parse back to the intended data. Nothing is written. */
export class FrontmatterRoundTripError extends Error {
	constructor(reason: string) {
		super(`Frontmatter edit refused: ${reason}`);
		this.name = "FrontmatterRoundTripError";
	}
}

export type ParsedFrontmatter =
	| { state: "none"; data: null }
	| { state: "ok"; data: FrontmatterRecord }
	| { state: "unreadable"; data: null; error: string };

interface Layout {
	bom: string;
	eol: "\n" | "\r\n";
	/** Everything up to and including the opening fence line (incl. BOM). */
	head: string;
	/** The YAML text between the fences. */
	block: string;
	/** The closing fence line onwards (incl. the rest of the file). */
	tail: string;
}

const EOL_PROBE = /\r\n|\n/;

function detectEol(text: string): "\n" | "\r\n" {
	const m = EOL_PROBE.exec(text);
	return m && m[0] === "\r\n" ? "\r\n" : "\n";
}

/** Splits a file at its frontmatter fences. Returns null when the file has no (terminated) frontmatter. */
function splitLayout(text: string): Layout | null {
	const bom = text.startsWith("﻿") ? "﻿" : "";
	const body = bom ? text.slice(1) : text;
	const open = /^---(\r?\n)/.exec(body);
	if (!open) return null;
	const eol = open[1] === "\r\n" ? "\r\n" : "\n";
	const blockStart = bom.length + open[0].length;
	// The closing fence is a line that is exactly `---`.
	const re = /(^|\n)---[ \t]*(?=\r?\n|$)/g;
	re.lastIndex = blockStart - 1 >= 0 ? blockStart - 1 : 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		const fenceStart = m.index + m[1].length;
		if (fenceStart < blockStart) continue;
		return { bom, eol, head: text.slice(0, blockStart), block: text.slice(blockStart, fenceStart), tail: text.slice(fenceStart) };
	}
	return null;
}

/** Matches how 0.17.1 wrote files: 2-space indent, block sequences indented under their key, double quotes only when needed, null as an empty value. */
const YAML_OPTS = { indent: 2, indentSeq: true, lineWidth: 0, singleQuote: false, nullStr: "" } as const;

function parseBlock(block: string): { doc: Document.Parsed; data: FrontmatterRecord } | { error: string } {
	let doc: Document.Parsed;
	try {
		doc = parseDocument(block, { uniqueKeys: true, merge: false, version: "1.2", keepSourceTokens: false });
	} catch (err) {
		return { error: (err as Error).message };
	}
	if (doc.errors.length > 0) return { error: doc.errors[0].message.split("\n")[0] };
	let unsupported: string | null = null;
	visit(doc, {
		Alias() {
			unsupported = "aliases are not supported";
			return visit.BREAK;
		},
		Node(_key, node) {
			if ((node as { anchor?: string }).anchor) {
				unsupported = "anchors are not supported";
				return visit.BREAK;
			}
			if ((node as { tag?: string }).tag) {
				unsupported = `explicit tag "${(node as { tag?: string }).tag}" is not supported`;
				return visit.BREAK;
			}
			return undefined;
		},
		Pair(_key, pair) {
			const k = pair.key;
			if (!isScalar(k) || typeof k.value !== "string") {
				unsupported = "only plain string keys are supported";
				return visit.BREAK;
			}
			if (k.value === "<<") {
				unsupported = "merge keys are not supported";
				return visit.BREAK;
			}
			return undefined;
		},
	});
	if (unsupported) return { error: unsupported };
	if (doc.contents === null) return { doc, data: {} };
	if (!isMap(doc.contents)) return { error: "frontmatter must be a map of keys" };
	const data = doc.toJS() as FrontmatterRecord;
	return { doc, data };
}

export function readFrontmatter(text: string): ParsedFrontmatter {
	const layout = splitLayout(text);
	if (!layout) return { state: "none", data: null };
	const parsed = parseBlock(layout.block);
	if ("error" in parsed) return { state: "unreadable", data: null, error: parsed.error };
	return { state: "ok", data: parsed.data };
}

// ---------------------------------------------------------------------------------------------
// Editing

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Drops `undefined` values (a mutation that sets a key to undefined means "remove it"). */
function normalise(v: unknown): unknown {
	if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : normalise(x)));
	if (isPlainObject(v)) {
		const out: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = normalise(x);
		return out;
	}
	return v;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
	if (isPlainObject(a) && isPlainObject(b)) {
		const ka = Object.keys(a);
		const kb = Object.keys(b);
		return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
	}
	return false;
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

class Splicer {
	readonly edits: Edit[] = [];
	constructor(
		readonly src: string,
		readonly eol: string,
	) {}

	lineStart(i: number): number {
		return this.src.lastIndexOf("\n", i - 1) + 1;
	}
	/** Index of the line break that ends the line containing `i` (or src.length). */
	lineBreak(i: number): number {
		const n = this.src.indexOf("\n", i);
		if (n === -1) return this.src.length;
		return n > 0 && this.src[n - 1] === "\r" ? n - 1 : n;
	}
	column(i: number): number {
		return i - this.lineStart(i);
	}
	/** End of a node's text, excluding the trailing newline(s) that collection ranges include. */
	trimmedEnd(end: number, start: number): number {
		let e = end;
		while (e > start && /[\r\n \t]/.test(this.src[e - 1])) e--;
		return e;
	}
	/** A generated block of text (always `\n`-separated) as it should appear indented by `indent`, first line unindented. */
	indentLines(text: string, indent: number, indentFirst = false): string {
		const pad = " ".repeat(indent);
		return text
			.replace(/\n$/, "")
			.split("\n")
			.map((line, i) => ((i === 0 && !indentFirst) || line === "" ? line : pad + line))
			.join(this.eol);
	}
	push(edit: Edit): void {
		this.edits.push(edit);
	}
}

function pairKey(pair: Pair): string {
	return String((pair.key as Scalar).value);
}

function pairExtentEnd(sp: Splicer, doc: Document, pair: Pair): number {
	const key = pair.key as Scalar;
	const node = pair.value as { range?: [number, number, number] } | null;
	if (!node || !node.range || node.range[0] === node.range[1]) {
		const colon = sp.src.indexOf(":", key.range![1]);
		return colon === -1 ? key.range![1] : colon + 1;
	}
	// Block scalars (| and >) and multi-line scalars carry their trailing line break in the range.
	if (isScalar(node as never)) return sp.trimmedEnd(node.range[1], node.range[0]);
	return sp.trimmedEnd(node.range[1], node.range[0]);
}

function scalarText(value: unknown, oldType: Scalar["type"]): string | null {
	if (value !== null && typeof value === "object") return null;
	if (typeof value === "string" && value.includes("\n")) return null;
	const s = new Scalar(value);
	if (typeof value === "string" && (oldType === "QUOTE_DOUBLE" || oldType === "QUOTE_SINGLE" || oldType === "PLAIN")) {
		s.type = oldType;
	}
	return new Document(s).toString(YAML_OPTS).replace(/\n$/, "");
}

function pairText(sp: Splicer, key: string, value: unknown, indent: number, indentFirst = false): string {
	return sp.indentLines(stringify({ [key]: value }, YAML_OPTS), indent, indentFirst);
}

function diffMap(sp: Splicer, doc: Document, map: YAMLMap, after: Record<string, unknown>, indent: number): void {
	const pairs = map.items as Pair[];
	const existing = new Set<string>();
	let lastRetained: Pair | null = null;
	for (const pair of pairs) {
		const k = pairKey(pair);
		existing.add(k);
		if (!Object.prototype.hasOwnProperty.call(after, k)) {
			const key = pair.key as Scalar;
			const start = sp.lineStart(key.range![0]);
			let end = sp.lineBreak(pairExtentEnd(sp, doc, pair));
			end += sp.src.startsWith("\r\n", end) ? 2 : sp.src[end] === "\n" ? 1 : 0;
			sp.push({ start, end, text: "" });
			continue;
		}
		lastRetained = pair;
		comparePair(sp, doc, pair, after[k], indent);
	}
	const additions = Object.keys(after).filter((k) => !existing.has(k));
	if (additions.length > 0 && lastRetained) {
		const brk = sp.lineBreak(pairExtentEnd(sp, doc, lastRetained));
		const nl = sp.src.startsWith("\r\n", brk) ? 2 : sp.src[brk] === "\n" ? 1 : 0;
		const text = additions.map((k) => pairText(sp, k, after[k], indent, true)).join(sp.eol);
		// Insert at the start of the line after the last kept pair, so a deletion of the lines that
		// follow it (or of its own trailing nested entries) never overlaps the insertion.
		if (nl > 0) sp.push({ start: brk + nl, end: brk + nl, text: text + sp.eol });
		else sp.push({ start: brk, end: brk, text: sp.eol + text });
	}
}

function comparePair(sp: Splicer, doc: Document, pair: Pair, afterVal: unknown, indent: number): void {
	const node = pair.value as never as {
		range?: [number, number, number];
		flow?: boolean;
		items?: unknown[];
		type?: Scalar["type"];
		toJS(doc: Document): unknown;
	} | null;
	const beforeVal = node ? node.toJS(doc) : null;
	if (deepEqual(beforeVal, afterVal)) return;

	const key = pair.key as Scalar;
	const k = pairKey(pair);

	// A block map edited in place, path by path.
	if (node && isMap(node as never) && !node.flow && isPlainObject(afterVal)) {
		const firstKey = (node as unknown as YAMLMap).items[0]?.key as Scalar | undefined;
		const sharesKey = Object.keys(afterVal).some((x) => Object.prototype.hasOwnProperty.call(beforeVal as object, x));
		if (firstKey && sharesKey) {
			diffMap(sp, doc, node as unknown as YAMLMap, afterVal, sp.column(firstKey.range![0]));
			return;
		}
	}

	// A single-line scalar replaced by a scalar: replace just the value, keeping its quoting style.
	if (node && node.range && isScalar(node as never) && node.range[0] !== node.range[1]) {
		const oldText = sp.src.slice(node.range[0], node.range[1]);
		const text = oldText.includes("\n") ? null : scalarText(afterVal, node.type);
		if (text !== null) {
			if (text === "") {
				// A value cleared to null: `key: old` becomes `key:`
				const colon = sp.src.indexOf(":", key.range![1]);
				sp.push({ start: colon === -1 ? node.range[0] : colon + 1, end: node.range[1], text });
			} else {
				sp.push({ start: node.range[0], end: node.range[1], text });
			}
			return;
		}
	}
	if (!node || !node.range || node.range[0] === node.range[1]) {
		// An empty value (`key:`) given a scalar.
		const colon = sp.src.indexOf(":", key.range![1]);
		const text = colon === -1 ? null : scalarText(afterVal, "PLAIN");
		if (colon !== -1 && text !== null) {
			sp.push({ start: colon + 1, end: colon + 1, text: " " + text });
			return;
		}
	}

	// Anything else (lists, type changes, new nested maps): regenerate this one pair.
	const end = pairExtentEnd(sp, doc, pair);
	sp.push({ start: key.range![0], end, text: pairText(sp, k, afterVal, indent) });
}

function applyEdits(src: string, edits: Edit[]): string {
	// Applied back to front. Edits at the same position keep the order they were made in: the one
	// made later is applied first, so the earlier one lands in front of it.
	const sorted = edits.map((e, i) => ({ e, i })).sort((a, b) => b.e.start - a.e.start || b.e.end - a.e.end || b.i - a.i).map((x) => x.e);
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].end > sorted[i - 1].start) throw new FrontmatterRoundTripError("overlapping edits");
	}
	let out = src;
	for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
	return out;
}

/**
 * Applies `mutate` to the file's frontmatter and returns the new full text. Returns `text` itself
 * (the same string) when the mutation changes nothing, so callers can skip the write. A file with
 * no frontmatter gains a block. Throws UnreadableFrontmatterError for a block that can't be read
 * safely, and FrontmatterRoundTripError if the produced text doesn't parse back to the intended data.
 */
export function editFrontmatter(text: string, mutate: (fm: FrontmatterRecord) => void, path?: string): string {
	const layout = splitLayout(text);
	if (!layout) {
		// No frontmatter yet: add one if the mutation produces any data.
		const draft: FrontmatterRecord = {};
		mutate(draft);
		const after = normalise(draft) as FrontmatterRecord;
		if (Object.keys(after).length === 0) return text;
		const eol = detectEol(text);
		const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
		const rest = bom ? text.slice(1) : text;
		const yamlText = stringify(after, YAML_OPTS).replace(/\n/g, eol);
		const result = `${bom}---${eol}${yamlText}---${eol}${rest}`;
		const check = readFrontmatter(result);
		if (check.state !== "ok" || !deepEqual(check.data, after)) {
			throw new FrontmatterRoundTripError("the new frontmatter does not read back as intended");
		}
		return result;
	}
	const newBlock = editBlock(layout.block, layout.eol, mutate, path);
	if (newBlock === layout.block) return text;
	const result = layout.head + newBlock + layout.tail;
	// The part of the file outside the frontmatter must be byte-identical.
	const again = splitLayout(result);
	if (!again || again.tail !== layout.tail || again.head !== layout.head) {
		throw new FrontmatterRoundTripError("text outside the frontmatter block changed");
	}
	return result;
}

/**
 * Edits the YAML text between a file's fences (or a whole-file YAML document) by splicing only the
 * ranges the mutation changes. Returns `block` itself when nothing changes.
 */
function editBlock(block: string, eol: "\n" | "\r\n", mutate: (fm: FrontmatterRecord) => void, path?: string): string {
	const p = parseBlock(block);
	if ("error" in p) throw new UnreadableFrontmatterError(p.error, path);
	const before = p.data;
	const draft = structuredClone(before);
	mutate(draft);
	const after = normalise(draft) as FrontmatterRecord;
	if (deepEqual(before, after)) return block;

	const sp = new Splicer(block, eol);
	const root = p.doc.contents;
	const rootSharesKey = isMap(root) && Object.keys(after).some((k) => Object.prototype.hasOwnProperty.call(before, k));
	if (isMap(root) && rootSharesKey) {
		diffMap(sp, p.doc, root, after, sp.column((root.items[0].key as Scalar).range![0]));
	} else if (Object.keys(after).length === 0) {
		sp.push({ start: 0, end: block.length, text: "" });
	} else if (isMap(root)) {
		// No existing key survives: rewrite the whole block.
		sp.push({ start: 0, end: block.length, text: stringify(after, YAML_OPTS).replace(/\n/g, eol) });
	} else {
		// Empty/comment-only block: append after any comments.
		const at = block.length;
		const lead = at > 0 && !/\n$/.test(block) ? eol : "";
		sp.push({ start: at, end: at, text: lead + stringify(after, YAML_OPTS).replace(/\n/g, eol) });
	}
	const result = applyEdits(block, sp.edits);

	// Self-check: the result must read back to exactly what the mutation asked for.
	const check = parseBlock(result);
	if ("error" in check || !deepEqual(check.data, after)) {
		throw new FrontmatterRoundTripError("the edited YAML does not read back as intended");
	}
	return result;
}

/** Edits a whole-file YAML document (no fences) with the same minimal-rewrite guarantees as editFrontmatter. */
export function editYamlText(text: string, mutate: (data: FrontmatterRecord) => void, path?: string): string {
	return editBlock(text, detectEol(text), mutate, path);
}

/** Parses a whole-file YAML document. Throws UnreadableFrontmatterError (never returns "empty") if it can't be read safely. */
export function parseYamlText(text: string, path?: string): FrontmatterRecord {
	const p = parseBlock(text);
	if ("error" in p) throw new UnreadableFrontmatterError(p.error, path);
	return p.data;
}

/** Renders `data` as a whole-file YAML document in 0.17.1's style. */
export function stringifyYamlText(data: FrontmatterRecord): string {
	return Object.keys(data).length ? stringify(data, YAML_OPTS) : "";
}

/** The note body: everything after the frontmatter block (or the whole text when there is none). */
export function bodyOf(text: string): string {
	const layout = splitLayout(text);
	if (!layout) return text;
	const nl = layout.tail.search(/\r?\n/);
	return nl === -1 ? "" : layout.tail.slice(layout.tail.indexOf("\n", nl) + 1);
}

/** The top-level keys whose values differ between two versions of a file's frontmatter (sorted). */
export function changedTopLevelKeys(beforeText: string, afterText: string): string[] {
	const a = readFrontmatter(beforeText);
	const b = readFrontmatter(afterText);
	const da = a.state === "ok" ? a.data : {};
	const db = b.state === "ok" ? b.data : {};
	const keys = new Set([...Object.keys(da), ...Object.keys(db)]);
	return [...keys].filter((k) => !deepEqual(da[k], db[k])).sort();
}

/** Renders `data` as a frontmatter block (`---`, YAML, `---`) in 0.17.1's style, with `\n` line endings. */
export function stringifyFrontmatterBlock(data: FrontmatterRecord): string {
	const yaml = Object.keys(data).length ? stringify(data, YAML_OPTS) : "";
	return `---\n${yaml}---\n`;
}

/**
 * Splits a file into its frontmatter section (both fences and the YAML between them, up to and
 * including the closing fence's line break) and everything after it. Null when there is no frontmatter.
 */
export function splitFrontmatterSection(text: string): { frontmatter: string; rest: string } | null {
	const layout = splitLayout(text);
	if (!layout) return null;
	const nl = layout.tail.search(/\r?\n/);
	const fenceLineEnd = nl === -1 ? layout.tail.length : layout.tail.indexOf("\n", nl) + 1;
	return { frontmatter: layout.head + layout.block + layout.tail.slice(0, fenceLineEnd), rest: layout.tail.slice(fenceLineEnd) };
}
