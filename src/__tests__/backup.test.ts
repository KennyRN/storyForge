import { describe, expect, it } from "vitest";
import { zipSync, unzipSync, type Zippable } from "fflate";
import { formatBackupFilename, formatFullBackupFilename } from "../backup";

describe("formatBackupFilename", () => {
	it("formats a date-only filename when includeTime is false", () => {
		const when = new Date(2026, 6, 13, 9, 5, 3); // 2026-07-13 09:05:03
		expect(formatBackupFilename("My Novel", when, false)).toBe("20260713 - My Novel.zip");
	});

	it("includes zero-padded time when includeTime is true", () => {
		const when = new Date(2026, 0, 5, 8, 3, 9); // 2026-01-05 08:03:09
		expect(formatBackupFilename("My Novel", when, true)).toBe("20260105-080309 - My Novel.zip");
	});

	it("sanitizes filesystem-illegal characters in the vault name", () => {
		const when = new Date(2026, 6, 13, 0, 0, 0);
		expect(formatBackupFilename('My/Novel:"Draft"', when, false)).toBe("20260713 - My-Novel--Draft-.zip");
	});
});

describe("formatFullBackupFilename", () => {
	it("formats yyyymmdd-hhmmss - <vault> - full.zip", () => {
		const when = new Date(2026, 6, 13, 9, 5, 3); // 2026-07-13 09:05:03
		expect(formatFullBackupFilename("My Novel", when)).toBe("20260713-090503 - My Novel - full.zip");
	});

	it("sanitizes filesystem-illegal characters in the vault name", () => {
		const when = new Date(2026, 0, 5, 8, 3, 9);
		expect(formatFullBackupFilename('My/Novel:"Draft"', when)).toBe("20260105-080309 - My-Novel--Draft- - full.zip");
	});
});

describe("fflate zip round trip", () => {
	it("zips and reads back in-memory entries with matching content", () => {
		const entries: Zippable = {
			"notes/hello.md": [new TextEncoder().encode("Hello, storyForge!"), { level: 6 }],
			"assets/cover.png": [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { level: 0 }],
		};

		const buffer = zipSync(entries);
		const unzipped = unzipSync(buffer);

		expect(new TextDecoder().decode(unzipped["notes/hello.md"])).toBe("Hello, storyForge!");
		expect(Array.from(unzipped["assets/cover.png"])).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	});
});
