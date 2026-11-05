import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture } from "../../../test/helpers/fixtures";
import { openProject, type OpenedProject } from "../openProject";
import { planCard } from "../projectCard";
import { getSeriesBooks, numberedBookTitle } from "../series";

// Brief 16: a card names a novel exactly as the library does. The library's title for a novel is `numberedBookTitle`; the card's must agree with it for every book.
const opened: OpenedProject[] = [];
afterEach(async () => {
	for (const o of opened.splice(0)) await o.close();
	cleanupFixtures();
});

describe("a card names a novel as the library does", () => {
	it("for every book of the fixture, in either numbering style, whichever book is first", async () => {
		for (const style of ["arabic", "roman-upper", "words-title"] as const) {
			const root = copyFixture("series");
			const settings = path.join(root, "_backstage/storyforge/project.md");
			fs.mkdirSync(path.dirname(settings), { recursive: true });
			fs.writeFileSync(settings, `---\nformat-version: 1\nstory-kind: standalone\nseries-numbering-style: ${style}\n---\n`);
			const o = await openProject(root, { backend: new NodeFsBackend(root), now: () => new Date(2026, 9, 23, 10, 0, 0) });
			opened.push(o);
			const { ordered, unplaced } = getSeriesBooks(o.project);
			const folders = fs.readdirSync(path.join(root, "_story-library"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
			const seriesMd = fs.readFileSync(path.join(root, "_story-library/series.md"), "utf8");
			const projectMd = fs.readFileSync(settings, "utf8");
			const plan = planCard({ exists: true, hasLibrary: true, projectMd, seriesMd, bookFolders: folders, seriesCover: null }, "folder");
			const first = ordered[0].name;
			expect(plan.firstBook?.folder).toBe(first);
			expect(plan.name).toBe(numberedBookTitle(o.project, first, { ordered, unplaced }, style)); // the library's own function
			await o.close();
			opened.pop();
		}
	});
});
