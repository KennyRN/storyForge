import { describe, expect, it } from "vitest";
import { decideDiskChange, minimalReplacement, recoveryFilePath } from "../manuscript/manuscriptSync";

describe("decideDiskChange", () => {
	it("ignores our own write echoing back, before or after it resolves", () => {
		expect(decideDiskChange({ disk: "A", knownDisk: "A", inFlight: null, dirty: true })).toBe("ignore");
		expect(decideDiskChange({ disk: "B", knownDisk: "A", inFlight: "B", dirty: false })).toBe("ignore");
	});

	it("reloads an outside change when nothing local is unsaved", () => {
		expect(decideDiskChange({ disk: "C", knownDisk: "A", inFlight: null, dirty: false })).toBe("reload");
	});

	it("recovers local text first when an outside change meets unsaved edits", () => {
		expect(decideDiskChange({ disk: "C", knownDisk: "A", inFlight: null, dirty: true })).toBe("recover-then-reload");
		expect(decideDiskChange({ disk: "C", knownDisk: "A", inFlight: "B", dirty: true })).toBe("recover-then-reload");
	});
});

describe("recoveryFilePath", () => {
	it("lands under the backup root, per book, timestamped", () => {
		const path = recoveryFilePath("_sf-backup", "TECa", "teca_chapter-aab", new Date(2026, 9, 1, 9, 5, 7));
		expect(path).toBe("_sf-backup/recovery/TECa/teca_chapter-aab 2026-10-01 090507.md");
	});

	it("never lets a basename add folders", () => {
		expect(recoveryFilePath("_sf-backup", "B", "a/b:c", new Date(2026, 0, 1))).toBe("_sf-backup/recovery/B/a-b-c 2026-01-01 000000.md");
	});
});

describe("minimalReplacement", () => {
	const apply = (s: string, r: { from: number; to: number; insert: string } | null) => (r ? s.slice(0, r.from) + r.insert + s.slice(r.to) : s);

	it("returns null for identical text", () => {
		expect(minimalReplacement("abc", "abc")).toBeNull();
	});

	const cases: [string, string][] = [
		["One\n\nTwo\n\nThree", "One\n\nThree"],
		["One\n\nThree", "One\n\nTwo\n\nThree"],
		["One\n\nTwo\n\nThree", "Two\n\nOne\n\nThree"],
		["aaa", "aaaa"],
		["", "x"],
		["x", ""],
	];
	for (const [before, after] of cases) {
		it(`${JSON.stringify(before)} → ${JSON.stringify(after)}`, () => {
			const r = minimalReplacement(before, after);
			expect(apply(before, r)).toBe(after);
		});
	}

	it("keeps the untouched head and tail", () => {
		const r = minimalReplacement("Head. Middle. Tail.", "Head. Changed. Tail.")!;
		expect(r.from).toBe(6);
		expect("Head. Middle. Tail.".slice(r.to)).toBe(". Tail.");
	});
});
