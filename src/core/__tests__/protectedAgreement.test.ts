import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { protectedRanges } from "../typing/protectedText";
import { lineScanProtectedRanges } from "../../../test/legacy/lineScanProtectedText";

/**
 * Brief 20 (ruling): protected text reads the parse tree only at runtime. The old line scan survives only here, as a check on
 * the fixtures: every disagreement is listed below with its reason, so none is silent.
 */
const body = (text: string): string => {
	if (!text.startsWith("---")) return text;
	const end = text.indexOf("\n---", 3);
	if (end === -1) return text;
	const after = text.indexOf("\n", end + 1);
	return after === -1 ? "" : text.slice(after + 1);
};
const files: string[] = [];
const walk = (dir: string): void => {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p);
		else if (name.endsWith(".md")) files.push(p);
	}
};
walk("test/fixtures");
const show = (text: string, r: readonly (readonly [number, number])[]): string[] => r.map(([a, b]) => text.slice(a, b));

describe("protected text: the parse tree against the old line scan, on every fixture", () => {
	it("has fixtures to read", () => expect(files.length).toBeGreaterThan(10));

	it("every disagreement is listed, with its reason", () => {
		const disagreements: Record<string, { tree: string[]; scan: string[] }> = {};
		for (const f of files) {
			const text = body(readFileSync(f, "utf8"));
			const tree = show(text, protectedRanges(text));
			const scan = show(text, lineScanProtectedRanges(text));
			if (JSON.stringify(tree) !== JSON.stringify(scan)) disagreements[f.replace(/\\/g, "/")] = { tree, scan };
		}
		// The scan knew `%%` and `[[ ]]` (plain text now) and protected any `|---|` line; the tree reads HTML comments, and a table's alignment row only under a header row.
		expect(disagreements).toEqual(EXPECTED);
	});
});

// Both are HTML comments, which only the tree knows: the sidecar's "AUTO-MAINTAINED" notice and the fixture's own comment (formerly `%%a hidden comment%%`).
const EXPECTED: Record<string, { tree: string[]; scan: string[] }> = {
	"test/fixtures/series/_backstage/storyforge/aaa/chapters/ch-a1.md": { scan: [], tree: ["<!-- AUTO-MAINTAINED BELOW — do not edit, the plugin overwrites it -->"] },
	"test/fixtures/series/_story-library/aaa/ch-a2.md": { scan: [], tree: ["<!--a hidden comment-->"] },
};
