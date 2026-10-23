import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { readCodexFrontmatter, rekeyCodexNotePath } from "../codex";
import { codexFilePath } from "../paths";

async function codexOrderProject(existingNotePaths: string[], initialFm: Record<string, unknown>) {
	const files: Record<string, string | null> = { Codex: null, [codexFilePath()]: fmFile(initialFm) };
	for (const p of existingNotePaths) files[p] = "note";
	return memoryProject(files);
}

describe("rekeyCodexNotePath", () => {
	it("strips a deleted note from order and types", async () => {
		const { project, fm } = await codexOrderProject(["Codex/Kept.md"], {
			folders: { characters: { name: "Characters", order: ["Codex/Jane.md", "Codex/Kept.md"] } },
			order: ["characters", "Codex/Jane.md"],
			archive: ["Codex/Jane.md"],
			types: { "Codex/Jane.md": "person", "Codex/Kept.md": "person" },
		});
		await rekeyCodexNotePath(project, "Codex/Jane.md", null);
		expect(fm(codexFilePath()).order).toEqual(["characters"]);
		expect((fm(codexFilePath()).folders as { characters: { order: string[] } }).characters.order).toEqual(["Codex/Kept.md"]);
		expect(fm(codexFilePath()).archive).toEqual([]);
		expect(fm(codexFilePath()).types).toEqual({ "Codex/Kept.md": "person" });
	});

	it("rekeys a renamed note everywhere it is referenced", async () => {
		const { project, fm } = await codexOrderProject(["Codex/Janet.md"], {
			folders: { f: { name: "F", order: ["Codex/Jane.md"], linkedNotePath: "Codex/Jane.md" } },
			order: ["f", "Codex/Jane.md"],
			archive: ["Codex/Jane.md"],
			types: { "Codex/Jane.md": "person" },
		});
		await rekeyCodexNotePath(project, "Codex/Jane.md", "Codex/Janet.md");
		const data = fm(codexFilePath());
		expect(data.order).toEqual(["f", "Codex/Janet.md"]);
		expect(data.archive).toEqual(["Codex/Janet.md"]);
		expect(data.types).toEqual({ "Codex/Janet.md": "person" });
		expect(data.folders).toEqual({ f: { name: "F", order: ["Codex/Janet.md"], linkedNotePath: "Codex/Janet.md" } });
	});
});
