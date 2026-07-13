import { describe, expect, it } from "vitest";
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
