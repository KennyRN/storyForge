import { describe, expect, it } from "vitest";
import { memoryProject } from "../../../test/helpers/memoryProject";
import { codexNameClash, createCodexFolder, createCodexNote, foldCodexName, readCodexFrontmatter } from "../codex";
import { CODEX_ROOT } from "../paths";

// Brief 10, commit 4: a folder or note made with the name the author typed (decision 56, ruling 5; decision 58, rulings 3 and 4).

describe("createCodexFolder with a name", () => {
	it("makes the folder with that name, at the end of the top level", async () => {
		const { project } = await memoryProject({ [CODEX_ROOT]: null });
		const id = await createCodexFolder(project, null, "Ships");
		const { folders, order } = readCodexFrontmatter(project);
		expect(folders[id]).toEqual({ name: "Ships", order: [] });
		expect(order.at(-1)).toBe(id);
		expect(id).not.toMatch(/new-folder/i);
	});

	it("puts a folder inside another when given a parent, and keeps the default name when none is given", async () => {
		const { project } = await memoryProject({ [CODEX_ROOT]: null });
		const outer = await createCodexFolder(project, null, "Places");
		const inner = await createCodexFolder(project, outer, "Harbours");
		const plain = await createCodexFolder(project, null);
		const { folders, order } = readCodexFrontmatter(project);
		expect(folders[outer].order).toEqual([inner]);
		expect(folders[inner].name).toBe("Harbours");
		expect(folders[plain].name).toBe("New Folder");
		expect(order).toEqual([outer, plain]);
	});

	it("gives two folders of the same name different ids", async () => {
		const { project } = await memoryProject({ [CODEX_ROOT]: null });
		const a = await createCodexFolder(project, null, "Ships");
		const b = await createCodexFolder(project, null, "Ships");
		expect(a).not.toBe(b);
	});
});

describe("codexNameClash", () => {
	it("folds case and accents", () => {
		expect(foldCodexName(" Élodie ")).toBe("elodie");
		expect(foldCodexName("ÆTHELSTAN")).toBe("æthelstan");
	});

	it("refuses a folder name already used in the same parent, ignoring case and accents, but not in another parent", async () => {
		const { project } = await memoryProject({ [CODEX_ROOT]: null });
		const places = await createCodexFolder(project, null, "Places");
		await createCodexFolder(project, null, "Élodie's Ships");
		await createCodexFolder(project, places, "Harbours");
		expect(codexNameClash(project, "folder", null, "places")).toBe(true);
		expect(codexNameClash(project, "folder", null, "PLACES ")).toBe(true);
		expect(codexNameClash(project, "folder", null, "elodie's ships")).toBe(true);
		expect(codexNameClash(project, "folder", null, "Harbours")).toBe(false); // that one is inside Places
		expect(codexNameClash(project, "folder", places, "harbours")).toBe(true);
		expect(codexNameClash(project, "folder", places, "Places")).toBe(false);
	});

	it("refuses a note name already used by any note, ignoring case, accents and .md", async () => {
		const { project } = await memoryProject({ [CODEX_ROOT]: null });
		await createCodexNote(project, null, { filename: "Zoë" });
		expect(codexNameClash(project, "note", null, "zoe")).toBe(true);
		expect(codexNameClash(project, "note", null, "ZOË.md")).toBe(true);
		expect(codexNameClash(project, "note", null, "Zoe Two")).toBe(false);
	});

	it("does not mix the two: a folder may share a note's name", async () => {
		const { project } = await memoryProject({ [CODEX_ROOT]: null });
		await createCodexNote(project, null, { filename: "Cast" });
		expect(codexNameClash(project, "folder", null, "Cast")).toBe(false);
	});
});
