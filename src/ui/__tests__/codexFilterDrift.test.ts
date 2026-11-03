import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { getArchivedCodexItems, getCodexView } from "../../core/codex";
import { archivedItemShown, newTypeFilter, plainCodexTree } from "../faces/codexFilter";

// Decision 107: the filter's own tree builder must not drift from the normal list. With no filter set it is asked for every note and
// must give exactly what the normal list gives (order, a folder that is also a note and its hidden child, folders that say "Empty",
// the notes that are in no folder), and the archive must show every archived item. If the two ever differ, this fails.
const note = (name: string) => `Codex/${name}.md`;
const NOTES = ["Jane", "Sam", "Harbour", "Dock", "Windows", "Loose", "Gone", "Zoë"];

async function project(codex: Record<string, unknown>) {
	const files: Record<string, string> = { "_backstage/storyforge/codex.md": fmFile(codex as never) };
	for (const n of NOTES) files[note(n)] = `# ${n}\n`;
	return (await memoryProject(files)).project;
}

describe("the filter's tree with no filter is the normal list", () => {
	const cases: Record<string, Record<string, unknown>> = {
		"the fixture's shape: a folder, a folder that is also a note, a loose note": {
			folders: { cast: { name: "Cast", order: [note("Jane"), note("Sam")] }, places: { name: "Places", order: [note("Harbour")], linkedNotePath: note("Harbour") } },
			order: ["cast", "places", note("Windows")],
			archive: [],
			types: { [note("Jane")]: "person", [note("Harbour")]: "place" },
		},
		"an empty organisational folder, which the normal list keeps (it says Empty)": {
			folders: { nothing: { name: "Nothing", order: [] }, cast: { name: "Cast", order: [note("Jane")] } },
			order: ["nothing", "cast"],
			archive: [],
			types: {},
		},
		"a folder whose contents are all missing from disk, which the normal list drops": {
			folders: { ghosts: { name: "Ghosts", order: [note("Nobody")] }, cast: { name: "Cast", order: [note("Jane")] } },
			order: ["ghosts", "cast"],
			archive: [],
			types: {},
		},
		"a note-folder with more than its own note, nested folders, and notes in no folder at all": {
			folders: {
				places: { name: "Places", order: [note("Harbour"), "dock", note("Dock")], linkedNotePath: note("Harbour") },
				dock: { name: "Dock side", order: [note("Sam")] },
			},
			order: [note("Windows"), "places"],
			archive: [note("Jane")],
			types: {},
		},
		"a Codex index with nothing in it": { folders: {}, order: [], archive: [], types: {} },
	};
	for (const [name, codex] of Object.entries(cases)) {
		it(name, async () => {
			const p = await project(codex);
			expect(plainCodexTree(p)).toEqual(getCodexView(p, "codex"));
		});
	}

	it("the archive shows every archived item when no filter is set", async () => {
		const p = await project({ folders: { cast: { name: "Cast", order: [note("Jane")] } }, order: [note("Windows")], archive: ["cast", note("Sam"), note("Loose")], types: { [note("Sam")]: "person" } });
		const all = getArchivedCodexItems(p).map((i) => i.key);
		expect(all.length).toBe(3);
		expect(all.filter((k) => archivedItemShown(p, newTypeFilter(), k))).toEqual(all);
	});
});
