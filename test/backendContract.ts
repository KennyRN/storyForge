/**
 * The backend contract: one suite that both the node-fs backend and the Tauri backend (over the real
 * Rust code) pass. Paths are ones the write guard allows, because the Rust backend checks the guard
 * itself.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenWriteError } from "../src/core/backend/guard";
import { GuardedBackend } from "../src/core/backend/guarded";
import { BackendError, type Backend } from "../src/core/backend/types";

export interface BackendUnderTest {
	backend: Backend;
	close(): Promise<void> | void;
}

const BS = "_backstage/storyforge";

export function describeBackendContract(name: string, make: (root: string) => Promise<BackendUnderTest>, options: { skip?: boolean } = {}): void {
	const suite = options.skip ? describe.skip : describe;
	suite(`backend contract: ${name}`, () => {
		let root: string;
		let sut: BackendUnderTest;
		let b: Backend;
		beforeEach(async () => {
			root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sf-contract-")));
			sut = await make(root);
			b = sut.backend;
		});
		afterEach(async () => {
			await sut.close();
			fs.rmSync(root, { recursive: true, force: true });
		});
		const abs = (rel: string) => path.join(root, rel);
		const put = (rel: string, content: string | Buffer) => {
			fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
			fs.writeFileSync(abs(rel), content);
		};
		const get = (rel: string) => fs.readFileSync(abs(rel), "utf8");
		const noTemp = () => {
			const found: string[] = [];
			const walk = (d: string) => {
				for (const e of fs.readdirSync(d, { withFileTypes: true })) {
					if (e.name.endsWith(".tmp") || e.name.endsWith(".hop")) found.push(path.join(d, e.name));
					if (e.isDirectory()) walk(path.join(d, e.name));
				}
			};
			walk(root);
			expect(found).toEqual([]);
		};
		const collect = async (it_: AsyncIterable<{ path: string; kind: string }>) => {
			const out: string[] = [];
			for await (const e of it_) out.push(`${e.kind === "folder" ? "d" : "f"}:${e.path}`);
			return out;
		};

		it("scans recursively, hidden entries included, symbolic links neither followed nor listed", async () => {
			put("a/b/c.md", "x");
			put(".obsidian/app.json", "{}");
			fs.symlinkSync(abs("a"), abs("link"));
			expect(await collect(b.scan())).toEqual(["d:.obsidian", "f:.obsidian/app.json", "d:a", "d:a/b", "f:a/b/c.md"]);
			expect(await collect(b.scan("a"))).toEqual(["d:a/b", "f:a/b/c.md"]);
			expect(await collect(b.scan("missing"))).toEqual([]);
		});

		it("scan carries size and modification time", async () => {
			put("a.md", "héllo");
			const [e] = await (async () => {
				const out = [];
				for await (const x of b.scan()) out.push(x);
				return out;
			})();
			expect(e).toMatchObject({ path: "a.md", kind: "file", size: 6 });
			expect(Math.abs(e.mtimeMs - fs.statSync(abs("a.md")).mtimeMs)).toBeLessThan(2);
		});

		it("stats, reads text and binary, keeps a BOM, and maps errors", async () => {
			put("t.md", "héllo");
			put("bom.md", "﻿hi");
			put("bin.dat", Buffer.from([0, 1, 2, 255]));
			expect(await b.stat("t.md")).toMatchObject({ kind: "file", size: 6 });
			expect(await b.stat("nope")).toBeNull();
			expect((await b.stat("."))?.kind).toBe("folder");
			expect(await b.readText("t.md")).toBe("héllo");
			expect(await b.readText("bom.md")).toBe("﻿hi");
			expect(Array.from(await b.readBinary("bin.dat"))).toEqual([0, 1, 2, 255]);
			await expect(b.readText("nope.md")).rejects.toMatchObject({ code: "ENOENT" });
		});

		it("refuses unsafe paths", async () => {
			await expect(b.readText("../x")).rejects.toBeInstanceOf(BackendError);
			await expect(b.stat("/etc/passwd")).rejects.toBeInstanceOf(BackendError);
		});

		it("writes atomically, creating parents, leaving no temp files", async () => {
			await b.writeText(`${BS}/x/y/z.md`, "one");
			await b.writeText(`${BS}/x/y/z.md`, "two");
			expect(get(`${BS}/x/y/z.md`)).toBe("two");
			expect(fs.readdirSync(abs(`${BS}/x/y`))).toEqual(["z.md"]);
			noTemp();
		});

		it("keeps CRLF when rewriting a CRLF file with LF text, and writes a new file exactly as given", async () => {
			put(`${BS}/win.md`, "a\r\nb\r\n");
			await b.writeText(`${BS}/win.md`, "x\ny\n");
			expect(get(`${BS}/win.md`)).toBe("x\r\ny\r\n");
			await b.writeText(`${BS}/fresh.md`, "x\ny\n");
			expect(get(`${BS}/fresh.md`)).toBe("x\ny\n");
			put(`${BS}/lf.md`, "a\nb\n");
			await b.writeText(`${BS}/lf.md`, "c\r\nd\r\n");
			expect(get(`${BS}/lf.md`)).toBe("c\r\nd\r\n");
		});

		it("writes binary data", async () => {
			await b.writeBinary(`${BS}/book/cover.png`, new Uint8Array([137, 80, 78, 71, 0, 255]));
			expect(Array.from(fs.readFileSync(abs(`${BS}/book/cover.png`)))).toEqual([137, 80, 78, 71, 0, 255]);
			noTemp();
		});

		it("creates a file only if absent, text or binary, with parents", async () => {
			await b.createFile("_story-library/aaa/new.md", "mine");
			await expect(b.createFile("_story-library/aaa/new.md", "other")).rejects.toMatchObject({ code: "EEXIST" });
			expect(get("_story-library/aaa/new.md")).toBe("mine");
			await b.createFile(`${BS}/bin.dat`, new Uint8Array([0, 9, 255]), { op: "create-file" });
			expect(Array.from(fs.readFileSync(abs(`${BS}/bin.dat`)))).toEqual([0, 9, 255]);
			await b.createFile("_sf-backup/20260101 - p.zip", new Uint8Array([1, 2]), { op: "backup-create" });
			await expect(b.createFile("_sf-backup/20260101 - p.zip", new Uint8Array([3]), { op: "backup-create" })).rejects.toMatchObject({ code: "EEXIST" });
			await b.createFile("_sf-backup/recovery/aaa/c 2026.md", "text", { op: "recovery-create" });
			expect(get("_sf-backup/recovery/aaa/c 2026.md")).toBe("text");
			noTemp();
		});

		it("creates folders, and a second time is a no-op", async () => {
			await b.createFolder("_story-library/aaa");
			await b.createFolder("_story-library/aaa");
			expect(fs.statSync(abs("_story-library/aaa")).isDirectory()).toBe(true);
		});

		it("renames exclusively, creating parents, moving folders, and handling a case-only change", async () => {
			put(`${BS}/a.md`, "a");
			put(`${BS}/b.md`, "b");
			await expect(b.rename(`${BS}/a.md`, `${BS}/b.md`)).rejects.toMatchObject({ code: "EEXIST" });
			expect(get(`${BS}/b.md`)).toBe("b");
			await b.rename(`${BS}/a.md`, `${BS}/sub/c.md`);
			expect(get(`${BS}/sub/c.md`)).toBe("a");
			expect(fs.existsSync(abs(`${BS}/a.md`))).toBe(false);
			await b.rename(`${BS}/sub/c.md`, `${BS}/sub/C.md`);
			expect(fs.readdirSync(abs(`${BS}/sub`))).toEqual(["C.md"]);
			await b.rename(`${BS}/sub`, `${BS}/moved`);
			expect(get(`${BS}/moved/C.md`)).toBe("a");
			await expect(b.rename(`${BS}/nope.md`, `${BS}/x.md`)).rejects.toMatchObject({ code: "ENOENT" });
			noTemp();
		});

		it("retires into .trash/ without overwriting, folders too", async () => {
			put(`${BS}/aaa/chapters/c.md`, "first");
			expect(await b.retire(`${BS}/aaa/chapters/c.md`)).toBe(`.trash/${BS}/aaa/chapters/c.md`);
			put(`${BS}/aaa/chapters/c.md`, "second");
			expect(await b.retire(`${BS}/aaa/chapters/c.md`)).toBe(`.trash/${BS}/aaa/chapters/c (2).md`);
			expect(get(`.trash/${BS}/aaa/chapters/c.md`)).toBe("first");
			expect(get(`.trash/${BS}/aaa/chapters/c (2).md`)).toBe("second");
			put(`${BS}/gone/x.md`, "x");
			expect(await b.retire(`${BS}/gone`)).toBe(`.trash/${BS}/gone`);
			expect(get(`.trash/${BS}/gone/x.md`)).toBe("x");
			await expect(b.retire(`${BS}/nope.md`)).rejects.toMatchObject({ code: "ENOENT" });
		});

		it("compare-then-write: writes when unchanged, writes the text exactly as given, reports a conflict otherwise", async () => {
			put("_story-library/aaa/ch.md", "old\r\n");
			expect(await b.writeTextIfUnchanged("_story-library/aaa/ch.md", "old\r\n", "new\nlines\n", { op: "prose-write" })).toBe("written");
			expect(get("_story-library/aaa/ch.md")).toBe("new\nlines\n");
			expect(await b.writeTextIfUnchanged("_story-library/aaa/ch.md", "old\r\n", "ours", { op: "prose-write" })).toBe("conflict");
			expect(get("_story-library/aaa/ch.md")).toBe("new\nlines\n");
			put("notes/idea.md", "a");
			expect(await b.writeTextIfUnchanged("notes/idea.md", "a", "b", { op: "link-rewrite" })).toBe("written");
			noTemp();
		});

		it("compare-then-write: a missing file rejects and is never created; a folder rejects", async () => {
			await expect(b.writeTextIfUnchanged("_story-library/aaa/missing.md", "", "x", { op: "prose-write" })).rejects.toMatchObject({ code: "ENOENT" });
			expect(fs.existsSync(abs("_story-library/aaa/missing.md"))).toBe(false);
			noTemp();
		});

		it("compare-then-write compares bytes: a file that is not valid UTF-8 is a conflict, never rewritten", async () => {
			put("Codex/Bad.md", Buffer.from([0x61, 0xff, 0x62]));
			expect(await b.writeTextIfUnchanged("Codex/Bad.md", "a�b", "new", { op: "prose-write" })).toBe("conflict");
			expect(Array.from(fs.readFileSync(abs("Codex/Bad.md")))).toEqual([0x61, 0xff, 0x62]);
		});

		it("nothing is written through a symbolic link that leaves the project", async () => {
			const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sf-outside-")));
			try {
				fs.mkdirSync(abs(BS), { recursive: true });
				fs.symlinkSync(outside, abs(`${BS}/escape`));
				await expect(b.writeText(`${BS}/escape/x.md`, "x")).rejects.toBeInstanceOf(BackendError);
				await expect(b.writeBinary(`${BS}/escape/x.bin`, new Uint8Array([1]))).rejects.toBeInstanceOf(BackendError);
				await expect(b.createFile(`${BS}/escape/y.md`, "y")).rejects.toBeInstanceOf(BackendError);
				await expect(b.createFolder(`${BS}/escape/sub`)).rejects.toBeInstanceOf(BackendError);
				put(`${BS}/real.md`, "r");
				await expect(b.rename(`${BS}/real.md`, `${BS}/escape/real.md`)).rejects.toBeInstanceOf(BackendError);
				expect(fs.readdirSync(outside)).toEqual([]);
				expect(get(`${BS}/real.md`)).toBe("r");
			} finally {
				fs.rmSync(outside, { recursive: true, force: true });
			}
		});

		it("through the guard: forbidden writes are refused and touch nothing", async () => {
			const g = new GuardedBackend(b);
			put("_story-library/aaa/ch.md", "prose");
			put("Codex/Jane.md", "---\naliases: []\n---\nbody");
			await expect(g.writeText("_story-library/aaa/ch.md", "x")).rejects.toBeInstanceOf(ForbiddenWriteError);
			await expect(g.writeText("Codex/Jane.md", "x")).rejects.toBeInstanceOf(ForbiddenWriteError);
			await expect(g.writeText("_export/x.json", "{}")).rejects.toBeInstanceOf(ForbiddenWriteError);
			expect(() => g.rename("Codex/Jane.md", "Codex/Janet.md")).toThrow(ForbiddenWriteError);
			expect(() => g.retire("_story-library/aaa/ch.md")).toThrow(ForbiddenWriteError);
			expect(get("_story-library/aaa/ch.md")).toBe("prose");
			expect(get("Codex/Jane.md")).toBe("---\naliases: []\n---\nbody");
			await g.codexRename("Codex/Jane.md", "Codex/Janet.md");
			expect(fs.existsSync(abs("Codex/Janet.md"))).toBe(true);
			expect(await g.proseWrite("Codex/Janet.md", "---\naliases: []\n---\nbody", "---\naliases: []\n---\nnew")).toBe("written");
			await g.createBackup("_sf-backup/x.zip", new Uint8Array([1]));
			await g.createRecovery("_sf-backup/recovery/aaa/x.md", "t");
			noTemp();
		});

		it("through the guard: writes to one path run one at a time, in order", async () => {
			const g = new GuardedBackend(b);
			const order: number[] = [];
			await Promise.all([1, 2, 3, 4, 5].map((n) => g.writeText(`${BS}/q.md`, `v${n}`).then(() => order.push(n))));
			expect(order).toEqual([1, 2, 3, 4, 5]);
			expect(get(`${BS}/q.md`)).toBe("v5");
			noTemp();
		});
	});
}
