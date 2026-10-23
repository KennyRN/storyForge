/**
 * A fuzzer for the link rewriter, in the style of the frontmatter fuzzer: random markdown containing
 * links, code, comments and frontmatter. Each document is built together with the text it must
 * become. After a rewrite every byte outside the planned spans is identical, every planned span is
 * replaced, and the result is exactly the expected text.
 */
import { describe, expect, it } from "vitest";
import { memoryProject } from "../../../test/helpers/memoryProject";
import { BackupService } from "../backup";
import { splitFrontmatterSection } from "../frontmatter";
import { applyCodexRename, planCodexRename, rewriteFileText } from "../linkRewriter";

function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const OLD = "Jane";
const NEW = "Janet Smith";
const NEW_ENC = "Janet%20Smith";
const WORDS = ["the", "harbour", "said", "Jane's", "Janet", "Jane Eyre", "wind", "—", "café", "日本語", "#tag", "[x]", "(maybe)", "100%", "a|b", "~", "^caret", "1.", "-"];

interface Pair {
	orig: string;
	exp: string;
	spans: number;
}

class Gen {
	constructor(
		private r: () => number,
		private ambiguous: boolean,
	) {}
	pick<T>(xs: readonly T[]): T {
		return xs[Math.floor(this.r() * xs.length)];
	}
	chance(p: number): boolean {
		return this.r() < p;
	}
	words(): string {
		const n = 1 + Math.floor(this.r() * 5);
		return Array.from({ length: n }, () => this.pick(WORDS)).join(" ");
	}

	/** A link that must be rewritten (unless it's a bare link and the name is ambiguous). */
	link(): Pair {
		const suffix = this.pick(["", "", "#Early life", "#^abc12", "#Early life|Her", "|Her", "|", "|200"]);
		const emb = this.chance(0.2) ? "!" : "";
		switch (Math.floor(this.r() * 6)) {
			case 0: {
				const bare = `${emb}[[${OLD}${suffix}]]`;
				return this.ambiguous ? { orig: bare, exp: bare, spans: 0 } : { orig: bare, exp: `${emb}[[${NEW}${suffix}]]`, spans: 1 };
			}
			case 1: {
				const ext = this.pick(["", ".md"]);
				return { orig: `${emb}[[Codex/${OLD}${ext}${suffix}]]`, exp: `${emb}[[Codex/${NEW}${ext}${suffix}]]`, spans: 1 };
			}
			case 2: {
				const frag = this.pick(["", "#Intro", "#Early%20life"]);
				const title = this.pick(["", ' "Title"', " 'Title'"]);
				const bang = this.chance(0.2) ? "!" : "";
				const text = this.words().replace(/[\[\]]/g, "");
				return { orig: `${bang}[${text}](Codex/${OLD}.md${frag}${title})`, exp: `${bang}[${text}](Codex/${NEW_ENC}.md${frag}${title})`, spans: 1 };
			}
			case 3:
				return { orig: `[a link](<Codex/${OLD}.md>)`, exp: `[a link](<Codex/${NEW}.md>)`, spans: 1 };
			case 4: {
				const bare = `[[${OLD.toLowerCase()}${suffix}]]`; // different capitalisation
				return this.ambiguous ? { orig: bare, exp: bare, spans: 0 } : { orig: bare, exp: `[[${NEW}${suffix}]]`, spans: 1 };
			}
			default:
				return { orig: `[x](Codex/${OLD}%20.md)`, exp: `[x](Codex/${OLD}%20.md)`, spans: 0 }; // another file's name: untouched
		}
	}
	/** Links that must never change. */
	decoy(): string {
		return this.pick(["[[Sam]]", "[[Janet]]", "[[Jane Eyre#h|x]]", "[s](Codex/Sam.md)", "[u](https://example.com/Codex/Jane.md)", "[[#Heading]]", "[[]]", "[[Codex/Samuel]]", "![[Sam|100]]"]);
	}
	/** Text that hides links in code or comments. */
	hidden(): string {
		const l = () => this.pick([`[[${OLD}]]`, `[[Codex/${OLD}]]`, `[a](Codex/${OLD}.md)`, `![[${OLD}]]`]);
		switch (Math.floor(this.r() * 5)) {
			case 0:
				return `\`${l()}\``;
			case 1:
				return `%% ${l()} ${this.words()} %%`;
			case 2:
				return `\n\`\`\`${this.pick(["", "md", "js"])}\n${l()}\n${this.words()}\n${l()}\n\`\`\`\n`;
			case 3:
				return `\n~~~\n${l()}\n~~~\n`;
			default:
				return `%%\n${l()}\n${l()}\n%%`;
		}
	}
	bodyPiece(): Pair {
		const k = this.r();
		if (k < 0.45) {
			const w = this.words();
			return { orig: w, exp: w, spans: 0 };
		}
		if (k < 0.75) return this.link();
		if (k < 0.85) {
			const d = this.decoy();
			return { orig: d, exp: d, spans: 0 };
		}
		const h = this.hidden();
		return { orig: h, exp: h, spans: 0 };
	}
	body(): Pair {
		const parts: Pair[] = [];
		const lines = 1 + Math.floor(this.r() * 8);
		for (let i = 0; i < lines; i++) {
			const n = 1 + Math.floor(this.r() * 5);
			const line: Pair[] = [];
			for (let j = 0; j < n; j++) line.push(this.bodyPiece());
			parts.push({ orig: line.map((p) => p.orig).join(" "), exp: line.map((p) => p.exp).join(" "), spans: line.reduce((s, p) => s + p.spans, 0) });
		}
		const sep = () => this.pick(["\n", "\n", "\n\n"]);
		let orig = "";
		let exp = "";
		parts.forEach((p, i) => {
			const s = i === 0 ? "" : sep();
			orig += s + p.orig;
			exp += s + p.exp;
		});
		const end = this.pick(["", "\n"]);
		return { orig: orig + end, exp: exp + end, spans: parts.reduce((s, p) => s + p.spans, 0) };
	}
	frontmatter(): { orig: string; exp: string; spans: number; hasList: boolean } {
		const lines: [string, string][] = [];
		let spans = 0;
		let hasList = false;
		const n = Math.floor(this.r() * 6);
		for (let i = 0; i < n; i++) {
			switch (Math.floor(this.r() * 7)) {
				case 0:
					lines.push([`# a comment with [[${OLD}]] that is not a value`, `# a comment with [[${OLD}]] that is not a value`]);
					break;
				case 1:
					lines.push([`related${i}: "see [[${OLD}]] and [[Sam]]"`, this.ambiguous ? `related${i}: "see [[${OLD}]] and [[Sam]]"` : `related${i}: "see [[${NEW}]] and [[Sam]]"`]);
					if (!this.ambiguous) spans++;
					break;
				case 2:
					lines.push([`path${i}: 'x [[Codex/${OLD}.md|J]]'`, `path${i}: "x [[Codex/${NEW}.md|J]]"`]);
					spans++;
					break;
				case 3:
					lines.push([`note${i}: "[[Sam]]"   # trailing [[${OLD}]]`, `note${i}: "[[Sam]]"   # trailing [[${OLD}]]`]);
					break;
				case 4:
					lines.push([`flow${i}: [[${OLD}]]`, `flow${i}: [[${OLD}]]`]); // an unquoted [[ ]] is a nested list, not a link
					break;
				case 5:
					lines.push([`n${i}: ${this.pick(["1", "true", "plain words", "~"])}`, ""]);
					lines[lines.length - 1][1] = lines[lines.length - 1][0];
					break;
				default: {
					hasList = true;
					const l1 = `  - "[[Codex/${OLD}]]"`;
					lines.push([`list${i}:\n${l1}\n  - plain`, `list${i}:\n  - "[[Codex/${NEW}]]"\n  - plain`]);
					spans++;
				}
			}
		}
		if (n === 0 && this.chance(0.5)) return { orig: "", exp: "", spans: 0, hasList: false };
		return { orig: `---\n${lines.map((l) => l[0]).join("\n")}${lines.length ? "\n" : ""}---\n`, exp: `---\n${lines.map((l) => l[1]).join("\n")}${lines.length ? "\n" : ""}---\n`, spans, hasList };
	}
}

/** Where two strings first differ, for failure messages. */
function firstDiff(a: string, b: string): string {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return `first difference at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 20), i + 30))} vs ${JSON.stringify(b.slice(Math.max(0, i - 20), i + 30))}`;
}

function build(seed: number) {
	const r = rng(seed);
	const ambiguous = r() < 0.3;
	const g = new Gen(r, ambiguous);
	const fm = g.frontmatter();
	const body = g.body();
	let orig = fm.orig + body.orig;
	let exp = fm.exp + body.exp;
	const crlf = r() < 0.25;
	if (crlf) {
		orig = orig.replace(/\n/g, "\r\n");
		exp = exp.replace(/\n/g, "\r\n");
	}
	return { orig, exp, spans: fm.spans + body.spans, ambiguous, hasList: fm.hasList };
}

describe("link rewriter fuzzer", () => {
	it("rewrites exactly the planned spans: 3,000 random documents", async () => {
		let rewritten = 0;
		let skippedLists = 0;
		for (let seed = 1; seed <= 3000; seed++) {
			const doc = build(seed);
			const files: Record<string, string | null> = { "Codex/Jane.md": "x", "notes/doc.md": doc.orig };
			if (doc.ambiguous) files["notes/Jane.md"] = "twin";
			const { project } = await memoryProject(files);
			const plan = await planCodexRename(project, "Codex/Jane.md", NEW);
			const planned = plan.files.find((f) => f.path === "notes/doc.md");
			const spans = planned?.spans ?? [];
			const label = `seed ${seed}\n${JSON.stringify(doc.orig)}`;
			expect(spans.length, label).toBe(doc.spans);
			if (spans.length === 0) continue;

			let result: string;
			try {
				result = rewriteFileText("notes/doc.md", doc.orig, spans);
			} catch (err) {
				// the only acceptable refusal: a frontmatter list the editor can't rewrite line for line
				expect(doc.hasList && /would change|frontmatter/.test((err as Error).message), `${label}\n${(err as Error).message}`).toBe(true);
				skippedLists++;
				continue;
			}
			rewritten++;
			expect(result, `${label}\n${firstDiff(result, doc.exp)}`).toBe(doc.exp);

			// every byte outside the planned body spans is identical, and every body span is replaced
			const bodySpans = spans.filter((s) => s.region === "body").sort((a, b) => a.start - b.start);
			const fmDelta = result.length - doc.orig.length - bodySpans.reduce((n, x) => n + (x.new.length - x.old.length), 0);
			let cursor = splitFrontmatterSection(doc.orig)?.frontmatter.length ?? 0; // the frontmatter is checked by the exact comparison above
			let resultCursor = fmDelta;
			for (const s of bodySpans) {
				expect(doc.orig.slice(s.start, s.end), label).toBe(s.old);
				const start = s.start + resultCursor;
				expect(result.slice(cursor + resultCursor, start), `outside bytes before span\n${label}`).toBe(doc.orig.slice(cursor, s.start));
				expect(result.slice(start, start + s.new.length), label).toBe(s.new);
				resultCursor += s.new.length - s.old.length;
				cursor = s.end;
			}
			expect(result.slice(cursor + resultCursor), `outside bytes after the last span\n${label}`).toBe(doc.orig.slice(cursor));
		}
		expect(rewritten).toBeGreaterThan(1500);
		expect(skippedLists).toBeLessThan(600);
	});

	it("the full pipeline (backup, rename, rewrite, re-key) agrees: 150 random documents", async () => {
		for (let seed = 5001; seed <= 5150; seed++) {
			const doc = build(seed);
			const files: Record<string, string | null> = { "Codex/Jane.md": "x", "notes/doc.md": doc.orig, "_story-library/aaa/ch.md": doc.orig.replace(/---[\s\S]*?---\r?\n/, "") };
			if (doc.ambiguous) files["notes/Jane.md"] = "twin";
			const { project, backend } = await memoryProject(files);
			const backups = new BackupService(project, { projectName: "fuzz", now: () => new Date(2026, 0, 1) });
			const plan = await planCodexRename(project, "Codex/Jane.md", NEW);
			const result = await applyCodexRename(project, plan, { backups });
			const label = `seed ${seed}\n${JSON.stringify(doc.orig)}`;
			expect(result.status, label).toBe("done");
			expect(backend.files.has("Codex/Janet Smith.md") && !backend.files.has("Codex/Jane.md"), label).toBe(true);
			const written = backend.files.get("notes/doc.md") as string;
			if (result.skippedUnsafe.some((s) => s.path === "notes/doc.md")) {
				expect(written, label).toBe(doc.orig); // refused, so untouched
			} else {
				expect(written, `${label}\n${firstDiff(written, doc.exp)}`).toBe(doc.exp);
			}
			// the backup holds the originals of whatever was to change
			if (plan.files.length) expect([...backend.files.keys()].some((k) => k.startsWith("_sf-backup/") && k.endsWith("pre-rewrite.zip")), label).toBe(true);
		}
	});
});
