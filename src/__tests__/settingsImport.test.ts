import { describe, expect, it } from "vitest";
import { findInvalidEnumSettings } from "../hostApi";
import { yamlQuotedScalar } from "../yamlQuote";

describe("findInvalidEnumSettings", () => {
	it("accepts known enums and ignores absent keys", () => {
		expect(
			findInvalidEnumSettings({
				layout: "hybrid",
				automaticBackupFrequency: "daily",
				seriesNumberingStyle: "arabic",
			}),
		).toEqual([]);
	});

	it("flags unknown enum values", () => {
		expect(findInvalidEnumSettings({ layout: "codexFocus" })).toEqual(["layout"]);
		expect(findInvalidEnumSettings({ automaticBackupFrequency: "hourly" })).toEqual([
			"automaticBackupFrequency",
		]);
		expect(findInvalidEnumSettings({ panelOrderMode: "whatever" })).toEqual(["panelOrderMode"]);
	});
});

describe("yamlQuotedScalar", () => {
	it("double-quotes a plain id", () => {
		expect(yamlQuotedScalar("TECa")).toBe('"TECa"');
	});

	it("escapes quotes without breaking the scalar", () => {
		expect(yamlQuotedScalar('x"y')).toBe('"x\\"y"');
	});

	it("rejects newlines that would inject YAML keys", () => {
		expect(() => yamlQuotedScalar("TECa\nrole: admin")).toThrow(/newlines/);
	});
});
