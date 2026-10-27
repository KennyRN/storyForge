import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { readBookSynopsis, writeBookSynopsis } from "../book";
import { commitSynopsis } from "../fieldWriter";
import { LIBRARY_ROOT, bookFilePath } from "../paths";
import { SectionContentError, SectionDuplicateError, readSection, writeSection } from "../sectionBody";

const H = "## Synopsis";

describe("strict sections", () => {
	it("matches only a line that is exactly the heading, trailing spaces and CR allowed", () => {
		expect(readSection(`${H}   \nText\n`, H)).toEqual({ status: "ok", text: "Text" });
		expect(readSection(`${H}\r\nText\r\n`, H)).toEqual({ status: "ok", text: "Text" });
		expect(readSection(`## Synopsis notes\nText\n`, H)).toEqual({ status: "ok", text: "" });
		expect(readSection(`### Synopsis\nText\n`, H)).toEqual({ status: "ok", text: "" });
		expect(readSection(`text ## Synopsis\nmore\n`, H)).toEqual({ status: "ok", text: "" });
	});

	it("runs to the next line starting '# ' or '## ', and not past a '### ' line", () => {
		expect(readSection(`${H}\nA\n### Sub\nB\n## Next\nC\n`, H)).toEqual({ status: "ok", text: "A\n### Sub\nB" });
		expect(readSection(`${H}\nA\n# Top\nB\n`, H)).toEqual({ status: "ok", text: "A" });
	});

	it("reports and refuses a duplicated heading", () => {
		const body = `${H}\nOne\n\n${H}\nTwo\n`;
		expect(readSection(body, H)).toEqual({ status: "duplicate" });
		expect(() => writeSection(body, H, "x")).toThrow(SectionDuplicateError);
	});

	it("replaces the section and leaves every other line, and the blank lines that closed it, byte-identical", () => {
		const body = `Intro line\n\n${H}\nOld\ntext\n\n## Other\nKeep  me\n\n### Deeper\n`;
		expect(writeSection(body, H, "New")).toBe(`Intro line\n\n${H}\nNew\n\n## Other\nKeep  me\n\n### Deeper\n`);
		expect(writeSection(body, H, "Old\ntext")).toBe(body);
	});

	it("removes the whole section when the text is empty, and nothing else", () => {
		const body = `Intro\n\n${H}\nOld\n\n## Other\nKeep\n`;
		expect(writeSection(body, H, "  \n")).toBe(`Intro\n\n## Other\nKeep\n`);
		expect(writeSection(`Intro\n`, H, "")).toBe(`Intro\n`);
		expect(writeSection(`${H}\nOld\n`, H, "")).toBe("");
	});

	it("appends when absent, and keeps CRLF files CRLF", () => {
		expect(writeSection("Intro\n", H, "New")).toBe(`Intro\n\n${H}\nNew\n`);
		expect(writeSection("", H, "New")).toBe(`\n${H}\nNew\n`);
		expect(writeSection(`Intro\r\n\r\n${H}\r\nOld\r\n`, H, "A\nB")).toBe(`Intro\r\n\r\n${H}\r\nA\r\nB\r\n`);
	});

	it("refuses text that would split the section", () => {
		expect(() => writeSection(`${H}\nOld\n`, H, "fine\n## sneaky\nmore")).toThrow(SectionContentError);
	});

	it("keeps a section at the end of a file with no final newline", () => {
		expect(writeSection(`Intro\n\n${H}\nOld`, H, "New")).toBe(`Intro\n\n${H}\nNew`);
	});
});

describe("synopsis writes", () => {
	const BOOK = "BookA";
	const NOVEL = bookFilePath(BOOK);
	const make = (body: string) => memoryProject({ [`${LIBRARY_ROOT}/${BOOK}`]: null, [NOVEL]: fmFile({ "chapter-order": [] }) + body });

	it("changes only the section: frontmatter and other headings stay byte-identical", async () => {
		const { project, backend } = await make(`\n## Notes\nKeep\n\n${H}\nOld\n\n## Tail\nAlso keep\n`);
		const before = backend.files.get(NOVEL) as string;
		await writeBookSynopsis(project, BOOK, "A new synopsis.", "Old");
		const after = backend.files.get(NOVEL) as string;
		expect(after).toBe(before.replace("Old", "A new synopsis."));
		expect(await readBookSynopsis(project, BOOK)).toEqual({ status: "ok", text: "A new synopsis." });
	});

	it("an empty synopsis removes the section and only that", async () => {
		const { project, backend } = await make(`\n## Notes\nKeep\n\n${H}\nOld\n\n## Tail\nAlso keep\n`);
		const before = backend.files.get(NOVEL) as string;
		await writeBookSynopsis(project, BOOK, "", "Old");
		expect(backend.files.get(NOVEL)).toBe(before.replace(`${H}\nOld\n\n`, ""));
	});

	it("a conflict leaves the file byte-identical and the author's text in recovery/_fields", async () => {
		const { project, backend } = await make(`\n${H}\nChanged elsewhere\n`);
		const before = backend.files.get(NOVEL);
		const r = await commitSynopsis(project, BOOK, "What the field saw", "My words");
		expect(r.status).toBe("conflict");
		if (r.status !== "conflict" || !r.recovery.ok) throw new Error("expected a recovered conflict");
		expect(r.current).toBe("Changed elsewhere");
		expect(backend.files.get(NOVEL)).toEqual(before);
		expect(r.recovery.path).toMatch(/^_sf-backup\/recovery\/_fields\/BookA synopsis .*\.md$/);
		const saved = backend.files.get(r.recovery.path);
		expect(typeof saved === "string" ? saved : new TextDecoder().decode(saved as Uint8Array)).toBe("My words");
	});

	it("a duplicated heading refuses the write and recovers the text", async () => {
		const { project, backend } = await make(`\n${H}\nOne\n\n${H}\nTwo\n`);
		const before = backend.files.get(NOVEL);
		const r = await commitSynopsis(project, BOOK, "One", "Mine");
		expect(r.status).toBe("refused");
		expect(backend.files.get(NOVEL)).toEqual(before);
		expect(r.status === "refused" && r.recovery.ok).toBe(true);
	});
});
