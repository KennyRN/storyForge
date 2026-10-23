import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture } from "../../../test/helpers/fixtures";
import { Project } from "../../core/project";
import { projectAsText } from "../projectText";

afterEach(cleanupFixtures);

describe("projectAsText", () => {
	it("shows the series, novels, chapters with word counts, the Codex tree and the archive", async () => {
		const root = copyFixture("series");
		const text = projectAsText(await Project.open(new NodeFsBackend(root)));
		expect(text).toContain("SERIES: The Lantern Cycle");
		expect(text).toMatch(/1\. aaa — Book #: The Harbour Wakes/);
		expect(text).toMatch(/· unplaced ccc — Spare Draft/);
		expect(text).toMatch(/\(ch-a1\.md, \d+ words\)/);
		expect(text).toContain("archived: 日本語の章  (ch-a4.md)");
		expect(text).toContain("CODEX:");
		expect(text).toMatch(/\[Cast\]/);
		expect(text).toMatch(/Jane \(person\)/);
		expect(text).toContain("archived:");
	});

	it("reports unreadable frontmatter, collisions and iCloud placeholders instead of hiding them", async () => {
		const root = copyFixture("series");
		const fs = await import("node:fs");
		fs.writeFileSync(`${root}/notes/bad.md`, "---\na: &x 1\nb: *x\n---\n");
		fs.writeFileSync(`${root}/notes/.later.md.icloud`, "stub");
		const text = projectAsText(await Project.open(new NodeFsBackend(root)));
		expect(text).toContain("UNREADABLE FRONTMATTER");
		expect(text).toContain("notes/bad.md");
		expect(text).toContain("ICLOUD (present, not downloaded):\n  notes/later.md");
	});
});
