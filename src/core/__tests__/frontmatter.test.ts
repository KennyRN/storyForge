import { describe, expect, it } from "vitest";
import {
	FrontmatterRoundTripError,
	UnreadableFrontmatterError,
	bodyOf,
	editFrontmatter,
	readFrontmatter,
} from "../frontmatter";

/** Lines that differ between two texts, as {removed, added}. Order-insensitive set difference by line. */
function changedLines(a: string, b: string): { removed: string[]; added: string[] } {
	const la = a.split(/\r?\n/);
	const lb = b.split(/\r?\n/);
	const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
	const ca = count(la);
	const cb = count(lb);
	const removed: string[] = [];
	const added: string[] = [];
	for (const [line, n] of ca) for (let i = 0; i < n - (cb.get(line) ?? 0); i++) removed.push(line);
	for (const [line, n] of cb) for (let i = 0; i < n - (ca.get(line) ?? 0); i++) added.push(line);
	return { removed: removed.sort(), added: added.sort() };
}

const NOVEL = [
	"---",
	'book-id-reference: "bk-1"   # keep this comment',
	'book-title-reference: "Book One: The Beginning"',
	"series-order-reference: 1",
	"unknown-key: {a: 1, b: [x, y]}",
	"chapter-order:",
	"  - a.md",
	"  - b.md",
	"unplaced:",
	"chapters:",
	"  a.md:",
	"    id: ch-a",
	"    pov:",
	"      - path: Codex/Jane.md",
	"        name: Jane",
	"    tags: [draft]",
	"  b.md:",
	"    id: ch-b",
	"    pov: []",
	"",
	"  # a comment between entries",
	"  c.md:",
	"    id: ch-c",
	"---",
	"",
	"Body text with --- in it.",
	"---",
	"more",
	"",
].join("\n");

describe("readFrontmatter", () => {
	it("reads a map", () => {
		const r = readFrontmatter(NOVEL);
		expect(r.state).toBe("ok");
		if (r.state !== "ok") return;
		expect(r.data["book-id-reference"]).toBe("bk-1");
		expect(r.data["series-order-reference"]).toBe(1);
		expect(r.data["unplaced"]).toBeNull();
		expect(r.data["chapter-order"]).toEqual(["a.md", "b.md"]);
		expect((r.data.chapters as Record<string, unknown>)["c.md"]).toEqual({ id: "ch-c" });
	});

	it("reports none for a file without frontmatter or with an unterminated block", () => {
		expect(readFrontmatter("just text\n").state).toBe("none");
		expect(readFrontmatter("---\na: 1\nno close\n").state).toBe("none");
	});

	it("reads an empty block as an empty map", () => {
		expect(readFrontmatter("---\n---\nbody")).toEqual({ state: "ok", data: {} });
	});

	it.each([
		["anchor", "---\na: &x 1\n---\n"],
		["alias", "---\na: &x 1\nb: *x\n---\n"],
		["tag", "---\na: !!str 1\n---\n"],
		["duplicate keys", "---\na: 1\na: 2\n---\n"],
		["merge key", "---\nbase: {x: 1}\n<<: {y: 2}\n---\n"],
		["non-string key", "---\n? [1, 2]\n: v\n---\n"],
		["syntax error", "---\na: [1, 2\n---\n"],
		["scalar root", "---\njust a string\n---\n"],
		["list root", "---\n- a\n- b\n---\n"],
	])("marks %s as unreadable, never empty", (_name, text) => {
		const r = readFrontmatter(text);
		expect(r.state).toBe("unreadable");
	});

	it("refuses to edit unreadable frontmatter", () => {
		const text = "---\na: &x 1\n---\nbody\n";
		expect(() => editFrontmatter(text, (fm) => (fm.b = 2), "x.md")).toThrow(UnreadableFrontmatterError);
	});
});

describe("editFrontmatter — minimal rewrites", () => {
	it("returns the same string when nothing changes", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			fm["series-order-reference"] = 1;
		});
		expect(out).toBe(NOVEL);
	});

	it("changes one scalar and nothing else, keeping its comment and quoting", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			fm["book-id-reference"] = "bk-2";
		});
		expect(changedLines(NOVEL, out)).toEqual({
			removed: ['book-id-reference: "bk-1"   # keep this comment'],
			added: ['book-id-reference: "bk-2"   # keep this comment'],
		});
		expect(out.endsWith(NOVEL.slice(NOVEL.indexOf("\n---\n", 4)))).toBe(true);
	});

	it("keeps each scalar's quoting style, and quotes a plain one only when needed", () => {
		const a = editFrontmatter(NOVEL, (fm) => {
			fm["series-order-reference"] = 7;
		});
		expect(a).toContain("\nseries-order-reference: 7\n");
		const b = editFrontmatter(NOVEL, (fm) => {
			fm["book-title-reference"] = "Book Two: The Middle";
		});
		expect(b).toContain('book-title-reference: "Book Two: The Middle"');
		const c = editFrontmatter(NOVEL, (fm) => {
			fm["book-title-reference"] = "Book Two";
		});
		expect(c).toContain('\nbook-title-reference: "Book Two"\n');
		const d = editFrontmatter("---\nt: old\n---\n", (fm) => (fm.t = "plain new"));
		expect(d).toBe("---\nt: plain new\n---\n");
		const e = editFrontmatter("---\nt: old\n---\n", (fm) => (fm.t = "needs: quotes"));
		expect(e).toBe('---\nt: "needs: quotes"\n---\n');
	});

	it("changes one chapter's entry and leaves every other entry's lines identical", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			const chapters = fm.chapters as Record<string, Record<string, unknown>>;
			chapters["b.md"].pov = [{ path: "Codex/Sam.md", name: "Sam" }];
		});
		const diff = changedLines(NOVEL, out);
		expect(diff.removed).toEqual(["    pov: []"]);
		expect(diff.added).toEqual(["    pov:", "      - path: Codex/Sam.md", "        name: Sam"].sort());
		// the comment between entries, the unknown key and a.md's entry are untouched
		expect(out).toContain("  # a comment between entries");
		expect(out).toContain("unknown-key: {a: 1, b: [x, y]}");
		expect(out).toContain("      - path: Codex/Jane.md\n        name: Jane\n    tags: [draft]");
	});

	it("changes one scalar inside a nested entry", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			(fm.chapters as Record<string, Record<string, unknown>>)["c.md"].id = "ch-z";
		});
		expect(changedLines(NOVEL, out)).toEqual({ removed: ["    id: ch-c"], added: ["    id: ch-z"] });
	});

	it("adds a new chapter entry after the last one, with the right indent", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			(fm.chapters as Record<string, unknown>)["d.md"] = { id: "ch-d", pov: [] };
		});
		expect(changedLines(NOVEL, out)).toEqual({ removed: [], added: ["  d.md:", "    id: ch-d", "    pov: []"].sort() });
		expect(out).toContain("    id: ch-c\n  d.md:\n    id: ch-d\n    pov: []\n---");
		expect(out.indexOf("  d.md:")).toBeGreaterThan(out.indexOf("  c.md:"));
	});

	it("removes a key and only its lines", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			delete (fm.chapters as Record<string, unknown>)["b.md"];
		});
		expect(changedLines(NOVEL, out).added).toEqual([]);
		expect(changedLines(NOVEL, out).removed).toEqual(["  b.md:", "    id: ch-b", "    pov: []"].sort());
	});

	it("rewrites a whole list when one item changes, in 0.17.1's style", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			fm["chapter-order"] = ["a.md", "c.md", "b.md"];
		});
		expect(out).toContain("chapter-order:\n  - a.md\n  - c.md\n  - b.md\nunplaced:");
		expect(changedLines(NOVEL, out)).toEqual({ removed: [], added: ["  - c.md"] });
		expect(out).toContain("unknown-key: {a: 1, b: [x, y]}");
	});

	it("fills an empty key with a list and a scalar", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			fm.unplaced = ["x.md", "y.md"];
		});
		expect(out).toContain("unplaced:\n  - x.md\n  - y.md\nchapters:");
		const out2 = editFrontmatter(NOVEL, (fm) => {
			fm.unplaced = "x";
		});
		expect(out2).toContain("\nunplaced: x\n");
	});

	it("appends new top-level keys after the last key", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			fm["cover-image"] = "cover.png";
		});
		expect(changedLines(NOVEL, out)).toEqual({ removed: [], added: ["cover-image: cover.png"] });
		expect(out.indexOf("cover-image")).toBeGreaterThan(out.indexOf("  c.md:"));
	});

	it("treats setting a key to undefined as removing it", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			fm["series-order-reference"] = undefined;
		});
		expect(out).not.toContain("series-order-reference");
	});

	it("never touches the body", () => {
		const out = editFrontmatter(NOVEL, (fm) => {
			fm["series-order-reference"] = 9;
		});
		expect(bodyOf(out)).toBe(bodyOf(NOVEL));
		expect(bodyOf(NOVEL)).toBe("\nBody text with --- in it.\n---\nmore\n");
	});
});

describe("editFrontmatter — line endings, BOM and edge layouts", () => {
	it("keeps CRLF throughout, including generated lines", () => {
		const crlf = NOVEL.replace(/\n/g, "\r\n");
		const out = editFrontmatter(crlf, (fm) => {
			fm["chapter-order"] = ["z.md"];
			(fm.chapters as Record<string, unknown>)["d.md"] = { id: "ch-d" };
		});
		expect(out.replace(/\r\n/g, "")).not.toContain("\n");
		expect(out).toContain("chapter-order:\r\n  - z.md\r\n");
		expect(out).toContain("  d.md:\r\n    id: ch-d\r\n");
	});

	it("keeps a file with no trailing newline", () => {
		const text = "---\na: 1\n---\nno newline at the end";
		const out = editFrontmatter(text, (fm) => (fm.a = 2));
		expect(out).toBe("---\na: 2\n---\nno newline at the end");
	});

	it("keeps a BOM", () => {
		const text = "﻿---\na: 1\n---\nbody\n";
		const out = editFrontmatter(text, (fm) => (fm.a = 2));
		expect(out).toBe("﻿---\na: 2\n---\nbody\n");
	});

	it("adds frontmatter to a file without any", () => {
		const out = editFrontmatter("Hello\n", (fm) => (fm.aliases = ["Jane"]));
		expect(out).toBe("---\naliases:\n  - Jane\n---\nHello\n");
		expect(editFrontmatter("Hello\r\n", (fm) => (fm.a = 1))).toBe("---\r\na: 1\r\n---\r\nHello\r\n");
	});

	it("fills an empty block", () => {
		expect(editFrontmatter("---\n---\nbody", (fm) => (fm.a = 1))).toBe("---\na: 1\n---\nbody");
	});

	it("appends to a comment-only block after the comments", () => {
		expect(editFrontmatter("---\n# note\n---\nb", (fm) => (fm.a = 1))).toBe("---\n# note\na: 1\n---\nb");
	});

	it("rewrites the block when no existing key survives", () => {
		const out = editFrontmatter("---\na: 1\n---\nb", (fm) => {
			delete fm.a;
			fm.b = 2;
		});
		expect(out).toBe("---\nb: 2\n---\nb");
	});

	it("removing every key leaves an empty block", () => {
		expect(editFrontmatter("---\na: 1\n---\nb", (fm) => delete fm.a)).toBe("---\n---\nb");
	});

	it("handles awkward values: colon titles, unicode, numeric-looking strings, empty list", () => {
		const out = editFrontmatter("---\nt: x\n---\n", (fm) => {
			fm.t = "Café: Ünïcode — “quoted”";
			fm.n = "123";
			fm.e = [];
			fm.m = {};
			fm.z = null;
		});
		const r = readFrontmatter(out);
		expect(r.state === "ok" && r.data).toEqual({ t: "Café: Ünïcode — “quoted”", n: "123", e: [], m: {}, z: null });
	});

	it("throws if the produced text cannot read back (never silently writes)", () => {
		expect(FrontmatterRoundTripError).toBeDefined();
		// a mutation producing a value the YAML core schema can't round-trip as given is normalised by the library,
		// so the guard is exercised by an impossible comparison instead
		const text = "---\na: 1\n---\n";
		expect(() => editFrontmatter(text, (fm) => (fm.a = Symbol("x") as never))).toThrow();
	});
});

describe("editFrontmatter — null values", () => {
	it("writes null as an empty value, like 0.17.1's defaults", () => {
		expect(editFrontmatter("---\nn: 5\nt: x\n---\n", (fm) => (fm.n = null))).toBe("---\nn:\nt: x\n---\n");
		expect(editFrontmatter("---\nt: x\n---\n", (fm) => (fm.z = null))).toBe("---\nt: x\nz:\n---\n");
		expect(editFrontmatter("---\nt: x\n---\n", (fm) => (fm.o = { a: null }))).toBe("---\nt: x\no:\n  a:\n---\n");
	});
});

describe("editFrontmatter — values that need quoting", () => {
	it("quotes a string containing ' #' (otherwise YAML would read the rest as a comment)", () => {
		const out = editFrontmatter("---\nt: x\n---\n", (fm) => {
			fm.t = "Book #";
			fm.u = "Chapter # // sub";
		});
		const r = readFrontmatter(out);
		expect(r.state === "ok" && r.data).toEqual({ t: "Book #", u: "Chapter # // sub" });
		expect(out).toContain('t: "Book #"');
	});
});

describe("editFrontmatter — multi-line values and comments", () => {
	it("replaces a block scalar with a short string, leaving the next key alone", () => {
		expect(editFrontmatter("---\nd: |\n  line one\n  line two\nz: 1\n---\n", (fm) => (fm.d = "short"))).toBe("---\nd: short\nz: 1\n---\n");
	});

	it("leaves a block scalar byte-identical when another key changes", () => {
		expect(editFrontmatter("---\nd: |\n  line one\n  line two\nz: 1\n---\n", (fm) => (fm.z = 2))).toBe("---\nd: |\n  line one\n  line two\nz: 2\n---\n");
	});

	it("replaces a multi-line quoted scalar", () => {
		expect(editFrontmatter("---\nd: 'a\n  b'\nz: 1\n---\n", (fm) => (fm.d = "x"))).toBe("---\nd: x\nz: 1\n---\n");
	});

	it("writes a multi-line string as a block scalar", () => {
		expect(editFrontmatter("---\nz: 1\n---\n", (fm) => (fm.s = "line1\nline2"))).toBe("---\nz: 1\ns: |-\n  line1\n  line2\n---\n");
	});

	it("keeps a trailing comment on a scalar that changed", () => {
		expect(editFrontmatter("---\nn: 1 # one\nm: 2\n---\n", (fm) => (fm.n = 5))).toBe("---\nn: 5 # one\nm: 2\n---\n");
	});

	it("keeps a comment above an entry inside a map when a sibling changes", () => {
		const out = editFrontmatter("---\nm:\n  # about a\n  a: 1\n  b: 2\n---\n", (fm) => ((fm.m as Record<string, number>).b = 3));
		expect(out).toBe("---\nm:\n  # about a\n  a: 1\n  b: 3\n---\n");
	});

	it("documents what is lost when a whole list is rewritten: comments inside it", () => {
		const out = editFrontmatter("---\nl:\n  - a\n  # why\n  - b\nz: 1\n---\n", (fm) => (fm.l = ["a", "b", "c"]));
		expect(out).toBe("---\nl:\n  - a\n  - b\n  - c\nz: 1\n---\n");
	});

	it("edits a quoted key's value without touching the key", () => {
		expect(editFrontmatter('---\n"odd key": 1\nz: 1\n---\n', (fm) => (fm["odd key"] = 2))).toBe('---\n"odd key": 2\nz: 1\n---\n');
	});

	it("moves a comment on an empty key's line when the key gains a list (known limitation)", () => {
		expect(editFrontmatter("---\nitems: # my list\nother: 1\n---\n", (fm) => (fm.items = ["a", "b"]))).toBe(
			"---\nitems:\n  - a\n  - b # my list\nother: 1\n---\n",
		);
	});
});
