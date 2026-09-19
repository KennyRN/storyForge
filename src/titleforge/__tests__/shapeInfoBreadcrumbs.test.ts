import { describe, expect, it } from "vitest";
import { shapeCrumbs } from "../view/TitleShapeInfoModal.js";

describe("TitleShapeInfoModal — shapeCrumbs (breadcrumb article collapsing)", () => {
	it("collapses a composite label that's only an optional leading article into one short crumb", () => {
		expect(shapeCrumbs("[Adjective] [Noun] / The [Adjective] [Noun]", undefined)).toEqual([
			"(the) [adjective] [noun]",
		]);
	});

	it("handles the article on either side of the slash, and a/an as well as the", () => {
		expect(shapeCrumbs("The [Adjective] [Noun] / [Adjective] [Noun]", undefined)).toEqual([
			"(the) [adjective] [noun]",
		]);
		expect(shapeCrumbs("[Noun] of [Noun] / A [Noun] of [Noun]", undefined)).toEqual(["(a) [noun] of [noun]"]);
	});

	it("leaves a plain, non-composite label alone (just lower-cased)", () => {
		expect(shapeCrumbs("[Adjective] [Noun]", undefined)).toEqual(["[adjective] [noun]"]);
	});

	it("leaves a composite label whose alternatives genuinely differ (not just an article) untouched", () => {
		expect(shapeCrumbs("[Adjective] [Noun] / [Noun] of [Noun]", undefined)).toEqual([
			"[adjective] [noun] / [noun] of [noun]",
		]);
	});
});
