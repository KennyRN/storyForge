import { describe, expect, it } from "vitest";
import { ForbiddenCodexWriteError, updateCodexFact } from "../recommend/factWrites";
import {
	parseFactsFromNote,
	setFactValue,
	writeFactsIntoNote,
} from "../recommend/facts";
import { makeTFile } from "./obsidianStub";
import type { App } from "obsidian";

describe("updateCodexFact path guard", () => {
	it("refuses library chapter paths", async () => {
		const app = { vault: { getAbstractFileByPath: () => makeTFile("_sf-storylibrary/B/ch.md") } } as unknown as App;
		await expect(updateCodexFact(app, "_sf-storylibrary/B/ch.md", "Facts", "hair", "dark")).rejects.toBeInstanceOf(
			ForbiddenCodexWriteError,
		);
	});

	it("refuses nested Codex paths (folders are virtual)", async () => {
		const app = { vault: { getAbstractFileByPath: () => null } } as unknown as App;
		await expect(updateCodexFact(app, "Codex/People/Jane.md", "Facts", "hair", "dark")).rejects.toBeInstanceOf(
			ForbiddenCodexWriteError,
		);
	});

	it("refuses backstage paths", async () => {
		const app = { vault: { getAbstractFileByPath: () => null } } as unknown as App;
		await expect(updateCodexFact(app, "_sf-backstage/codex.md", "Facts", "hair", "dark")).rejects.toBeInstanceOf(
			ForbiddenCodexWriteError,
		);
	});

	it("modifies a flat Codex note", async () => {
		const path = "Codex/Jane.md";
		let content = "---\naliases: []\n---\n\n## Facts\neye colour: green\n";
		const file = makeTFile(path);
		const app = {
			vault: {
				getAbstractFileByPath: () => file,
				read: async () => content,
				modify: async (_f: unknown, next: string) => {
					content = next;
				},
			},
		} as unknown as App;

		await updateCodexFact(app, path, "Facts", "eye colour", "amber");
		expect(content).toContain("eye colour: amber");
		expect(content).toContain("eye colour (was): green");
	});
});

describe("writeFactsIntoNote — non-fact lines under the Facts heading", () => {
	it("drops freeform lines that are not key: value pairs", () => {
		const raw = "## Facts\n\nJane hates cold tea.\neye colour: green\n";
		const facts = setFactValue(parseFactsFromNote(raw, "Facts"), "hair", "dark", false);
		const written = writeFactsIntoNote(raw, facts);
		expect(written).toContain("eye colour: green");
		expect(written).toContain("hair: dark");
		// Known limitation (AUDIT): freeform prose without a colon is not preserved.
		expect(written).not.toContain("Jane hates cold tea.");
	});

	it("treats freeform lines that contain a colon as fact keys", () => {
		const raw = "## Facts\n\nRemember: Jane hates cold tea.\neye colour: green\n";
		const facts = parseFactsFromNote(raw, "Facts");
		expect(facts.entries.remember?.value).toBe("Jane hates cold tea.");
	});
});
