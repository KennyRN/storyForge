import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Who may call the caller-restricted backend operations. The guard sees paths and operations, not
 * callers, so this test is what keeps the prose tenet (decision 19): chapter and Codex note bodies
 * are written only by the prose writer and the link rewriter.
 */
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
		return p.endsWith(".ts") ? [p] : [];
	});
}
const files = walk(SRC).map((p) => ({ path: relative(SRC, p), text: readFileSync(p, "utf8") }));

/** Calls of `.name(` anywhere in src, outside the defining and allowed files. */
const RESTRICTED: Record<string, string[]> = {
	proseWrite: ["core/proseWriter.ts"],
	linkRewrite: ["core/linkRewriter.ts"],
	codexRename: ["core/linkRewriter.ts"],
	createBackup: ["core/backup.ts"],
	createRecovery: ["core/recovery.ts"],
	writeTextIfUnchanged: ["core/backend/guarded.ts", "backends/node-fs/index.ts"],
};
const DEFINERS = new Set(["core/backend/guarded.ts", "core/backend/types.ts", "backends/node-fs/index.ts"]);

describe("architecture: who may call the restricted backend operations", () => {
	for (const [method, allowed] of Object.entries(RESTRICTED)) {
		it(`${method} is called only from ${allowed.join(", ")}`, () => {
			const callers = files
				.filter((f) => new RegExp(`\\.${method}\\s*\\(`).test(f.text) && !DEFINERS.has(f.path) && !allowed.includes(f.path))
				.map((f) => f.path);
			expect(callers).toEqual([]);
		});
	}

	it("the restricted modules are imported only by the modules that may use them", () => {
		const importers = (mod: string) =>
			files.filter((f) => new RegExp(`from\\s+["'][^"']*/${mod}["']`).test(f.text) && f.path !== `core/${mod}.ts`).map((f) => f.path);
		// Nothing but the prose writer and the link rewriter may import each other's operations, and
		// reconciliation, opening, backups and recovery never import either writer.
		for (const writer of ["proseWriter", "linkRewriter"]) {
			const bad = importers(writer).filter((p) => !["core/openProject.ts", "core/index.ts"].includes(p));
			expect(bad, `${writer} is imported by`).toEqual([]);
		}
		expect(importers("reconciler").filter((p) => /proseWriter|linkRewriter/.test(files.find((f) => f.path === p)?.text ?? ""))).toEqual([]);
	});

	it("nothing outside the backend reaches the raw backend's write methods", () => {
		const offenders = files
			.filter((f) => !DEFINERS.has(f.path) && /\braw\.(writeText|writeTextIfUnchanged|createFile|rename|retire)\b/.test(f.text))
			.map((f) => f.path);
		expect(offenders).toEqual([]);
	});
});
