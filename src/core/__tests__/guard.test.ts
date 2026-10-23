import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemoryBackend } from "../../../test/helpers/memoryBackend";
import { ForbiddenWriteError, checkGuard, type GuardOp } from "../backend/guard";
import { GuardedBackend } from "../backend/guarded";

interface Row {
	id: string;
	op: GuardOp["op"];
	path?: string;
	from?: string;
	to?: string;
	keys?: string[];
	expect: "allow" | "refuse";
	reason?: string;
}
const spec = JSON.parse(readFileSync(new URL("../../../test/guard-spec/guard.json", import.meta.url), "utf8")) as { rows: Row[] };

function toOp(r: Row): GuardOp {
	if (r.op === "rename" || r.op === "codex-rename") return { op: r.op, from: r.from as string, to: r.to as string };
	if (r.op === "frontmatter-edit") return { op: "frontmatter-edit", path: r.path as string, keys: r.keys };
	return { op: r.op, path: r.path as string } as GuardOp;
}

describe("guard spec table (test/guard-spec/guard.json)", () => {
	it("has unique ids and covers every operation", () => {
		const ids = spec.rows.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const op of ["write-file", "write-binary", "create-file", "create-folder", "rename", "retire", "frontmatter-edit", "prose-write", "link-rewrite", "backup-create", "recovery-create", "codex-rename"]) {
			expect(spec.rows.some((r) => r.op === op && r.expect === "allow")).toBe(true);
			expect(spec.rows.some((r) => r.op === op && r.expect === "refuse")).toBe(true);
		}
	});

	it.each(spec.rows.map((r) => [r.id, r] as const))("%s", (_id, row) => {
		const decision = checkGuard(toOp(row));
		expect(decision.allow, JSON.stringify(row) + " -> " + JSON.stringify(decision)).toBe(row.expect === "allow");
	});
});

describe("GuardedBackend", () => {
	function setup() {
		const raw = new MemoryBackend({ "_story-library/ABC/a.md": "prose", "Codex/Jane.md": "---\naliases: [J]\n---\nbody" });
		const calls: string[] = [];
		for (const m of ["writeText", "writeBinary", "createFile", "createFolder", "rename", "retire"] as const) {
			const orig = raw[m].bind(raw) as (...a: never[]) => Promise<unknown>;
			(raw as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => {
				calls.push(`${m}:${String(a[0])}`);
				return orig(...(a as never[]));
			};
		}
		return { raw, calls, fs: new GuardedBackend(raw) };
	}

	it("refuses forbidden writes without touching the backend", async () => {
		const { fs, calls } = setup();
		expect(() => fs.writeBinary("_story-library/ABC/a.md", new Uint8Array())).toThrow(ForbiddenWriteError);
		await expect(fs.writeText("_story-library/ABC/a.md", "x")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(fs.writeText("Codex/Jane.md", "x")).rejects.toBeInstanceOf(ForbiddenWriteError);
		expect(() => fs.rename("Codex/Jane.md", "Codex/Janet.md")).toThrow(ForbiddenWriteError);
		expect(() => fs.retire("_story-library/ABC/a.md")).toThrow(ForbiddenWriteError);
		expect(() => fs.createFile("_export/x.json", "{}")).toThrow(ForbiddenWriteError);
		expect(() => fs.createFile("_STORY-LIBRARY/ABC/new.md", "")).toThrow(ForbiddenWriteError);
		expect(calls).toEqual([]);
	});

	it("allows creating a chapter and a Codex note, and refuses to overwrite them", async () => {
		const { fs } = setup();
		await fs.createFile("_story-library/ABC/b.md", "");
		await fs.createFile("Codex/Sam.md", "# Sam");
		await expect(fs.createFile("_story-library/ABC/a.md", "")).rejects.toMatchObject({ code: "EEXIST" });
	});

	it("allows backstage writes, renames and retires", async () => {
		const { fs, raw } = setup();
		await fs.writeText("_backstage/storyforge/x.md", "x");
		await fs.rename("_backstage/storyforge/x.md", "_backstage/storyforge/y.md");
		const moved = await fs.retire("_backstage/storyforge/y.md");
		expect(moved).toBe(".trash/_backstage/storyforge/y.md");
		expect(raw.files.has("_backstage/storyforge/y.md")).toBe(false);
	});

	it("serialises mutations on the same path (and folds case for the queue)", async () => {
		const raw = new MemoryBackend();
		const order: string[] = [];
		const slow = raw.writeText.bind(raw);
		raw.writeText = async (p, t) => {
			order.push(`start:${t}`);
			await new Promise((r) => setTimeout(r, t === "first" ? 20 : 0));
			await slow(p, t);
			order.push(`end:${t}`);
		};
		const fs = new GuardedBackend(raw);
		await Promise.all([fs.writeText("_backstage/storyforge/a.md", "first"), fs.writeText("_backstage/storyforge/A.md", "second")]);
		expect(order).toEqual(["start:first", "end:first", "start:second", "end:second"]);
	});

	it("a failing task does not block the next one", async () => {
		const { fs } = setup();
		const bad = fs.createFile("_story-library/ABC/a.md", "").catch(() => "failed");
		const good = fs.createFile("_story-library/ABC/c.md", "").then(() => "ok");
		expect(await Promise.all([bad, good])).toEqual(["failed", "ok"]);
	});

	it("transactions read, edit and write under one lock, with the guard checking the intent", async () => {
		const { fs, raw } = setup();
		await fs.transaction("Codex/Jane.md", async (tx) => {
			const text = await tx.readText();
			await tx.writeText(text.replace("[J]", "[J, Jay]"), { op: "frontmatter-edit", keys: ["aliases"] });
		});
		expect(raw.files.get("Codex/Jane.md")).toContain("Jay");
		await expect(
			fs.transaction("Codex/Jane.md", (tx) => tx.writeText("x", { op: "frontmatter-edit", keys: ["aliases", "type"] })),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(fs.transaction("Codex/Jane.md", (tx) => tx.writeText("x"))).rejects.toBeInstanceOf(ForbiddenWriteError);
	});
});
