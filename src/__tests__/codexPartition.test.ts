import { describe, expect, it } from "vitest";
import { findUnknownScopedNotes, partitionCodexNotes, type CodexNote } from "../codexPartition";

const note = (path: string, bookIds: string[] = []): CodexNote => ({ path, bookIds });

describe("partitionCodexNotes", () => {
	const notes = [
		note("Characters/Maren.md", []), // universal
		note("Characters/Elias.md", ["book-one"]), // scoped to current
		note("Places/Storm-Coast.md", ["book-two"]), // scoped to another book
		note("Characters/Both.md", ["book-one", "book-two"]), // scoped to both
	];

	it("Codex view is universal notes plus notes scoped to the current book", () => {
		const { codex } = partitionCodexNotes(notes, "book-one");
		expect(codex.map((n) => n.path)).toEqual(["Characters/Maren.md", "Characters/Elias.md", "Characters/Both.md"]);
	});

	it("Hidden view is exactly the notes scoped to some other book, and nothing else", () => {
		const { hidden } = partitionCodexNotes(notes, "book-one");
		expect(hidden.map((n) => n.path)).toEqual(["Places/Storm-Coast.md"]);
	});

	it("partitions notes into exactly one view each, never both or neither", () => {
		const { codex, hidden } = partitionCodexNotes(notes, "book-one");
		expect(codex.length + hidden.length).toBe(notes.length);
	});

	it("with no active book, Codex shows only universal notes and Hidden shows everything scoped", () => {
		const { codex, hidden } = partitionCodexNotes(notes, null);
		expect(codex.map((n) => n.path)).toEqual(["Characters/Maren.md"]);
		expect(hidden.map((n) => n.path)).toEqual(["Characters/Elias.md", "Places/Storm-Coast.md", "Characters/Both.md"]);
	});
});

describe("findUnknownScopedNotes", () => {
	it("surfaces a note scoped to an id that matches no known book", () => {
		const notes = [note("Characters/Ghost.md", ["typo-id"]), note("Characters/Maren.md", ["book-one"])];
		const unknown = findUnknownScopedNotes(notes, new Set(["book-one", "book-two"]));
		expect(unknown.map((n) => n.path)).toEqual(["Characters/Ghost.md"]);
	});
});
