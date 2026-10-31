import { describe, expect, it } from "vitest";
import { memoryProject } from "../../../test/helpers/memoryProject";
import { moveCodexItem } from "../codex";

// Decision 65: the interface hides a folder's own linked note when it is also in the folder's `order`. The entry is data the
// author may have, so it must stay exactly where it is when its folder's other items are moved.
const CODEX = "_backstage/storyforge/codex.md";
const file = (members: string[]) =>
	`---\nfolders:\n  f-crew:\n    name: Crew\n    order:\n${members.map((m) => `      - ${m}\n`).join("")}    linkedNotePath: Codex/Crew.md\norder:\n  - f-crew\narchive:\ntypes:\n---\n`;

describe("a reorder inside a folder that holds its own linked note", () => {
	it("changes only the moved item's lines; the hidden entry keeps its place in order", async () => {
		const before = file(["Codex/Crew.md", "Codex/Jane.md", "Codex/Sam.md"]);
		const { project, backend } = await memoryProject({ [CODEX]: before });
		await moveCodexItem(project, "Codex/Sam.md", "file", "f-crew", "Codex/Jane.md");
		expect(backend.files.get(CODEX)).toBe(file(["Codex/Crew.md", "Codex/Sam.md", "Codex/Jane.md"]));
	});

	it("moving an item to the end leaves the hidden entry where it was", async () => {
		const { project, backend } = await memoryProject({ [CODEX]: file(["Codex/Jane.md", "Codex/Crew.md", "Codex/Sam.md"]) });
		await moveCodexItem(project, "Codex/Jane.md", "file", "f-crew", null);
		expect(backend.files.get(CODEX)).toBe(file(["Codex/Crew.md", "Codex/Sam.md", "Codex/Jane.md"]));
	});
});
