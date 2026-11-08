import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = fileURLToPath(new URL("..", import.meta.url));

/**
 * The diagnostic view is for development builds only (decision 26, ruling 10): compiled out of a release, not
 * merely hidden. Rust leaves its menu item out of a release; the window's bundle must not contain the page.
 */
describe("a release build has no diagnostics", () => {
	it("the window's production bundle does not contain the diagnostic page", () => {
		const out = mkdtempSync(path.join(os.tmpdir(), "sf-release-"));
		try {
			execFileSync(process.execPath, [path.join(repo, "node_modules/vite/bin/vite.js"), "build", "--outDir", out, "--emptyOutDir"], { cwd: repo, stdio: "pipe", env: { ...process.env, NODE_ENV: "production" } });
			const files = readdirSync(path.join(out, "assets"));
			expect(files.some((f) => f.endsWith(".js"))).toBe(true);
			for (const f of files) {
				const text = readFileSync(path.join(out, "assets", f), "utf8");
				expect(text.includes("storyForge diagnostic"), `${f} contains the diagnostic page`).toBe(false);
				expect(text.includes("sf-diagnostics"), `${f} contains the diagnostic styles or layer`).toBe(false);
			}
			// The tracker's test hook is compiled out of a release: nothing shipped can make the button forget where the author was.
			for (const f of files.filter((f) => f.endsWith(".js"))) {
				expect(readFileSync(path.join(out, "assets", f), "utf8").includes("sfWritingTestHookForget"), `${f} contains the writing tracker's test hook`).toBe(false);
			}
			// The font is in the bundle, both faces, as files of the app itself.
			expect(files.filter((f) => /^SNPro-Variable(Regular|Italic).*\.woff2$/.test(f)).length, `assets: ${files.join(", ")}`).toBe(2);
			expect(files.filter((f) => /diagnostic/i.test(f) && !/no-diagnostics/.test(f)), `assets: ${files.join(", ")}`).toEqual([]);
		} finally {
			rmSync(out, { recursive: true, force: true });
		}
	}, 60_000);

	it("the Rust menu's Diagnostics item is behind debug_assertions", () => {
		const lib = readFileSync(path.join(repo, "src-tauri/src/lib.rs"), "utf8");
		const at = lib.indexOf('"diagnostics"');
		expect(at).toBeGreaterThan(0);
		const before = lib.slice(Math.max(0, at - 400), at);
		expect(before).toMatch(/#\[cfg\(debug_assertions\)\]/);
		expect(lib.split('"diagnostics"').length - 1).toBe(1);
	});
});
