import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../index";
import { BackendError } from "../../../core/backend/types";

let dir: string;
let b: NodeFsBackend;
beforeEach(() => {
	dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sf-nodefs-")));
	b = new NodeFsBackend(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function collect(it_: AsyncIterable<{ path: string; kind: string }>): Promise<string[]> {
	const out: string[] = [];
	for await (const e of it_) out.push(`${e.kind === "folder" ? "d" : "f"}:${e.path}`);
	return out;
}

describe("NodeFsBackend reads", () => {
	it("scans recursively including hidden entries, skipping symlinks", async () => {
		fs.mkdirSync(path.join(dir, "a/b"), { recursive: true });
		fs.mkdirSync(path.join(dir, ".obsidian"));
		fs.writeFileSync(path.join(dir, "a/b/c.md"), "x");
		fs.writeFileSync(path.join(dir, ".obsidian/app.json"), "{}");
		fs.symlinkSync(path.join(dir, "a"), path.join(dir, "link"));
		expect(await collect(b.scan())).toEqual(["d:.obsidian", "f:.obsidian/app.json", "d:a", "d:a/b", "f:a/b/c.md"]);
		expect(await collect(b.scan("a"))).toEqual(["d:a/b", "f:a/b/c.md"]);
		expect(await collect(b.scan("missing"))).toEqual([]);
	});

	it("stats, reads text and binary, and maps errors", async () => {
		fs.writeFileSync(path.join(dir, "t.md"), "héllo");
		expect(await b.stat("t.md")).toMatchObject({ kind: "file", size: 6 });
		expect(await b.stat("nope")).toBeNull();
		expect(await b.readText("t.md")).toBe("héllo");
		expect(Array.from(await b.readBinary("t.md"))).toEqual(Array.from(Buffer.from("héllo")));
		await expect(b.readText("nope.md")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps a BOM in the text it returns", async () => {
		fs.writeFileSync(path.join(dir, "bom.md"), "﻿hi");
		expect(await b.readText("bom.md")).toBe("﻿hi");
	});

	it("refuses unsafe paths", async () => {
		await expect(b.readText("../x")).rejects.toBeInstanceOf(BackendError);
		await expect(b.stat("/etc/passwd")).rejects.toBeInstanceOf(BackendError);
	});
});

describe("NodeFsBackend writes", () => {
	it("writes atomically, creating parents, leaving no temp files", async () => {
		await b.writeText("x/y/z.md", "one");
		await b.writeText("x/y/z.md", "two");
		expect(fs.readFileSync(path.join(dir, "x/y/z.md"), "utf8")).toBe("two");
		expect(fs.readdirSync(path.join(dir, "x/y"))).toEqual(["z.md"]);
	});

	it("leaves the old file and no temp file when the write cannot complete", async () => {
		fs.mkdirSync(path.join(dir, "d"));
		await expect(b.writeText("d", "text")).rejects.toBeInstanceOf(BackendError); // target is a folder
		expect(fs.readdirSync(dir)).toEqual(["d"]);
	});

	it("keeps CRLF when rewriting a CRLF file with LF text, and writes new files as given", async () => {
		fs.writeFileSync(path.join(dir, "w.md"), "a\r\nb\r\n");
		await b.writeText("w.md", "a\nc\n");
		expect(fs.readFileSync(path.join(dir, "w.md"), "utf8")).toBe("a\r\nc\r\n");
		await b.writeText("new.md", "a\nb\n");
		expect(fs.readFileSync(path.join(dir, "new.md"), "utf8")).toBe("a\nb\n");
		fs.writeFileSync(path.join(dir, "lf.md"), "a\nb\n");
		await b.writeText("lf.md", "x\ny\n");
		expect(fs.readFileSync(path.join(dir, "lf.md"), "utf8")).toBe("x\ny\n");
		await b.writeText("w.md", "p\r\nq\r\n"); // already CRLF: untouched
		expect(fs.readFileSync(path.join(dir, "w.md"), "utf8")).toBe("p\r\nq\r\n");
	});

	it("createFile never overwrites", async () => {
		await b.createFile("a/b.md", "first");
		await expect(b.createFile("a/b.md", "second")).rejects.toMatchObject({ code: "EEXIST" });
		expect(fs.readFileSync(path.join(dir, "a/b.md"), "utf8")).toBe("first");
		expect(fs.readdirSync(path.join(dir, "a"))).toEqual(["b.md"]);
		await b.createFile("bin.dat", new Uint8Array([1, 2, 3]));
		expect(Array.from(fs.readFileSync(path.join(dir, "bin.dat")))).toEqual([1, 2, 3]);
	});

	it("createFolder is idempotent", async () => {
		await b.createFolder("a/b/c");
		await b.createFolder("a/b/c");
		expect((await b.stat("a/b/c"))?.kind).toBe("folder");
	});

	it("renames files and folders, never overwriting", async () => {
		await b.writeText("a.md", "A");
		await b.writeText("b.md", "B");
		await expect(b.rename("a.md", "b.md")).rejects.toMatchObject({ code: "EEXIST" });
		await b.rename("a.md", "sub/c.md");
		expect(fs.readFileSync(path.join(dir, "sub/c.md"), "utf8")).toBe("A");
		expect(fs.existsSync(path.join(dir, "a.md"))).toBe(false);
		await b.writeText("f/x.md", "X");
		await b.rename("f", "g");
		expect(fs.readFileSync(path.join(dir, "g/x.md"), "utf8")).toBe("X");
		await expect(b.rename("missing", "z")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("handles a case-only rename", async () => {
		await b.writeText("note.md", "N");
		await b.rename("note.md", "Note.md");
		expect(fs.readdirSync(dir)).toEqual(["Note.md"]);
		await b.rename("Note.md", "Note.md"); // no-op
		expect(fs.readdirSync(dir)).toEqual(["Note.md"]);
	});

	it("retires into .trash/ with a unique name, never overwriting", async () => {
		await b.writeText("_backstage/storyforge/a.md", "1");
		expect(await b.retire("_backstage/storyforge/a.md")).toBe(".trash/_backstage/storyforge/a.md");
		await b.writeText("_backstage/storyforge/a.md", "2");
		expect(await b.retire("_backstage/storyforge/a.md")).toBe(".trash/_backstage/storyforge/a (2).md");
		await b.writeText("_backstage/storyforge/a.md", "3");
		expect(await b.retire("_backstage/storyforge/a.md")).toBe(".trash/_backstage/storyforge/a (3).md");
		expect(fs.readFileSync(path.join(dir, ".trash/_backstage/storyforge/a.md"), "utf8")).toBe("1");
		expect(fs.readFileSync(path.join(dir, ".trash/_backstage/storyforge/a (2).md"), "utf8")).toBe("2");
		await expect(b.retire("nope.md")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("refuses to write through a symlink that leaves the project", async () => {
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sf-outside-"));
		try {
			fs.symlinkSync(outside, path.join(dir, "escape"));
			await expect(b.writeText("escape/x.md", "bad")).rejects.toMatchObject({ code: "EACCES" });
			expect(fs.readdirSync(outside)).toEqual([]);
		} finally {
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it("round-trips Unicode names", async () => {
		await b.writeText("Codex/Café — 日本語.md", "x");
		const names = (await collect(b.scan())).map((n) => n.normalize("NFC"));
		expect(names).toContain("f:Codex/Café — 日本語.md".normalize("NFC"));
		expect(await b.readText("Codex/Café — 日本語.md")).toBe("x");
	});
});

describe("NodeFsBackend.writeTextIfUnchanged", () => {
	it("writes when the file still holds the expected text, exactly as given, leaving no temp file", async () => {
		fs.writeFileSync(path.join(dir, "a.md"), "one\r\ntwo\r\n");
		expect(await b.writeTextIfUnchanged("a.md", "one\r\ntwo\r\n", "one\ntwo\nthree\n")).toBe("written");
		expect(fs.readFileSync(path.join(dir, "a.md"), "utf8")).toBe("one\ntwo\nthree\n");
		expect(fs.readdirSync(dir)).toEqual(["a.md"]);
	});
	it("reports a conflict and leaves the file and the folder untouched when the text changed", async () => {
		fs.writeFileSync(path.join(dir, "a.md"), "outside edit");
		expect(await b.writeTextIfUnchanged("a.md", "what we last saw", "ours")).toBe("conflict");
		expect(fs.readFileSync(path.join(dir, "a.md"), "utf8")).toBe("outside edit");
		expect(fs.readdirSync(dir)).toEqual(["a.md"]);
	});
	it("rejects with ENOENT for a missing file and never creates it", async () => {
		await expect(b.writeTextIfUnchanged("nope.md", "", "x")).rejects.toMatchObject({ code: "ENOENT" });
		expect(fs.readdirSync(dir)).toEqual([]);
	});
	it("treats a replaced file (same text, new inode) between the comparison and the swap as a conflict", async () => {
		fs.writeFileSync(path.join(dir, "a.md"), "same");
		b.afterCompareHook = (abs) => {
			fs.rmSync(abs);
			fs.writeFileSync(abs, "same");
		};
		expect(await b.writeTextIfUnchanged("a.md", "same", "ours")).toBe("conflict");
		expect(fs.readFileSync(path.join(dir, "a.md"), "utf8")).toBe("same");
		expect(fs.readdirSync(dir)).toEqual(["a.md"]);
	});
	it("treats an appended-to file between the comparison and the swap as a conflict", async () => {
		fs.writeFileSync(path.join(dir, "a.md"), "same");
		b.afterCompareHook = (abs) => fs.appendFileSync(abs, " + more");
		expect(await b.writeTextIfUnchanged("a.md", "same", "ours")).toBe("conflict");
		expect(fs.readFileSync(path.join(dir, "a.md"), "utf8")).toBe("same + more");
	});
});
