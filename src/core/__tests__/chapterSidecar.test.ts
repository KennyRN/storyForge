import { describe, expect, it } from "vitest";
import { memoryProject } from "../../../test/helpers/memoryProject";
import { deleteChapterSidecar, renameChapterSidecar, updateChapterFingerprint } from "../chapterSidecar";
import { chapterSidecarPath } from "../paths";

describe("updateChapterFingerprint", () => {
	it("serializes overlapping writes so one fingerprint wins whole", async () => {
		const { project, backend } = await memoryProject();
		const path = chapterSidecarPath("BookA", "ch1.md");
		await Promise.all([
			updateChapterFingerprint(project, "BookA", "ch1.md", { opening: "AAA", closing: "aaa" }),
			updateChapterFingerprint(project, "BookA", "ch1.md", { opening: "BBB", closing: "bbb" }),
		]);
		const final = (backend.files.get(path) as string) ?? "";
		expect(final.includes("AAA") && final.includes("BBB")).toBe(false);
		expect(final.includes("AAA") || final.includes("BBB")).toBe(true);
	});

	it("creates a sidecar with a chapter key and the opening/closing body", async () => {
		const { project, backend } = await memoryProject();
		await updateChapterFingerprint(project, "BookA", "ch1.md", { opening: "first words", closing: "last words" });
		expect(backend.files.get(chapterSidecarPath("BookA", "ch1.md"))).toBe(
			"---\nchapter: ch1.md\n---\n\n<!-- AUTO-MAINTAINED BELOW — do not edit, the plugin overwrites it -->\n\n## opening\nfirst words\n\n## closing\nlast words\n",
		);
	});

	it("rewrites only the body, keeping the frontmatter's unknown keys and comments exactly", async () => {
		const path = chapterSidecarPath("BookA", "ch1.md");
		const original = "---\n# kept comment\nchapter: ch1.md\nx-unknown: {a: 1}\n---\n\nold body\n";
		const { project, backend } = await memoryProject({ [path]: original });
		await updateChapterFingerprint(project, "BookA", "ch1.md", { opening: "O", closing: "C" });
		const text = backend.files.get(path) as string;
		expect(text.startsWith("---\n# kept comment\nchapter: ch1.md\nx-unknown: {a: 1}\n---\n")).toBe(true);
		expect(text).toContain("## opening\nO\n");
		expect(text).not.toContain("old body");
	});

	it("writes nothing when the fingerprint hasn't changed", async () => {
		const { project, backend } = await memoryProject();
		await updateChapterFingerprint(project, "BookA", "ch1.md", { opening: "O", closing: "C" });
		backend.writes.length = 0;
		await updateChapterFingerprint(project, "BookA", "ch1.md", { opening: "O", closing: "C" });
		expect(backend.writes).toEqual([]);
	});
});

describe("renameChapterSidecar / deleteChapterSidecar", () => {
	it("moves the sidecar and updates its chapter key, keeping the rest", async () => {
		const oldPath = chapterSidecarPath("BookA", "ch1.md");
		const { project, backend } = await memoryProject({ [oldPath]: "---\nchapter: ch1.md\nx-keep: 1\n---\nbody\n" });
		await renameChapterSidecar(project, "BookA", "ch1.md", "ch2.md");
		expect(backend.files.has(oldPath)).toBe(false);
		expect(backend.files.get(chapterSidecarPath("BookA", "ch2.md"))).toBe("---\nchapter: ch2.md\nx-keep: 1\n---\nbody\n");
	});

	it("does nothing when there is no sidecar", async () => {
		const { project, backend } = await memoryProject();
		await renameChapterSidecar(project, "BookA", "ch1.md", "ch2.md");
		await deleteChapterSidecar(project, "BookA", "ch1.md");
		expect(backend.writes).toEqual([]);
	});

	it("retires the sidecar into .trash/ on delete", async () => {
		const path = chapterSidecarPath("BookA", "ch1.md");
		const { project, trashed } = await memoryProject({ [path]: "---\nchapter: ch1.md\n---\n" });
		await deleteChapterSidecar(project, "BookA", "ch1.md");
		expect(project.exists(path)).toBe(false);
		expect(trashed()).toEqual([`.trash/${path}`]);
	});
});
