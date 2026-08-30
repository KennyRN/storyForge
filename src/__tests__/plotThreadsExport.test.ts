import { describe, expect, it } from "vitest";
import {
	buildPlotThreadsExport,
	DEFAULT_NEW_THREAD_LABEL,
	isPlotThreadsListPopulated,
	mergePlotThreadsImport,
	parsePlotThreadsExport,
	PLOT_THREADS_EXPORT_FORMAT,
	stringifyPlotThreadsExport,
} from "../plotThreadsExport";
import { MAIN_THREAD_FALLBACK_COLOR, MAIN_THREAD_ID, type PlotThread } from "../plotThreads";

const threads: PlotThread[] = [
	{ id: MAIN_THREAD_ID, label: "main thread", color: "#f59e0b", textColor: "#111111" },
	{ id: "romance", label: "Romance", color: "#4a90d9", textColor: "#ffffff" },
];

describe("plot threads export", () => {
	it("round-trips JSON and accepts dash-cased text colour", () => {
		const document = buildPlotThreadsExport(threads, new Date("2026-08-29T12:00:00.000Z"), {
			description: "roman strands",
		});
		expect(document.format).toBe(PLOT_THREADS_EXPORT_FORMAT);
		expect(document.included).toEqual({ colours: true, names: true });
		expect(document.threads).toEqual(threads);
		expect(document.description).toBe("roman strands");

		const parsed = parsePlotThreadsExport(stringifyPlotThreadsExport(document));
		expect(parsed.threads).toEqual(document.threads);

		const dashCased = parsePlotThreadsExport(
			JSON.stringify({
				format: PLOT_THREADS_EXPORT_FORMAT,
				version: 1,
				exportedAt: "2026-08-29T12:00:00.000Z",
				threads: [{ id: "romance", label: "Romance", color: "#4a90d9", "text-color": "#ffffff" }],
			}),
		);
		expect(dashCased.threads).toEqual([
			{ id: "romance", label: "Romance", color: "#4a90d9", textColor: "#ffffff" },
		]);
	});

	it("rejects JSON that is not a plot threads export", () => {
		expect(() => parsePlotThreadsExport("{")).toThrow("not valid");
		expect(() => parsePlotThreadsExport(JSON.stringify({ format: "storyforge-types-tags" }))).toThrow(
			"plot threads export",
		);
	});

	it("rewrites names or colours when those sections are omitted", () => {
		const namesOnly = buildPlotThreadsExport(threads, new Date(), {
			included: { colours: false, names: true },
		});
		expect(namesOnly.threads.map((thread) => thread.label)).toEqual(["main thread", "Romance"]);
		expect(namesOnly.threads.every((thread) => thread.color === "#f59e0b")).toBe(true);
		expect(namesOnly.threads.every((thread) => thread.textColor === "#111111")).toBe(true);

		const coloursOnly = buildPlotThreadsExport(threads, new Date(), {
			included: { colours: true, names: false },
		});
		expect(coloursOnly.threads.map((thread) => thread.label)).toEqual([
			"main thread",
			"secondary threads",
		]);
		expect(coloursOnly.threads.map((thread) => thread.color)).toEqual(["#f59e0b", "#4a90d9"]);
	});

	it("treats a lone main thread as not populated", () => {
		expect(isPlotThreadsListPopulated([threads[0]])).toBe(false);
		expect(isPlotThreadsListPopulated(threads)).toBe(true);
	});

	it("replaces names in list order and fills extra rows with the default colour", () => {
		const current: PlotThread[] = [
			{ id: MAIN_THREAD_ID, label: "main thread", color: "#c41e3a", textColor: "#0a0a0a" },
			{ id: "old", label: "Old", color: "#111111", textColor: "#eeeeee" },
		];
		const incoming: PlotThread[] = [
			{ id: MAIN_THREAD_ID, label: "alpha", color: "#ffffff" },
			{ id: "beta", label: "beta", color: "#ffffff" },
			{ id: "gamma", label: "gamma", color: "#ffffff" },
		];
		const merged = mergePlotThreadsImport(current, incoming, { colours: false, names: true }, "replace");
		expect(merged).toEqual([
			{ id: MAIN_THREAD_ID, label: "alpha", color: "#c41e3a", textColor: "#0a0a0a" },
			{ id: "old", label: "beta", color: "#111111", textColor: "#eeeeee" },
			{ id: "gamma", label: "gamma", color: MAIN_THREAD_FALLBACK_COLOR },
		]);
	});

	it("replaces colours in list order and fills extra rows with the default name", () => {
		const current: PlotThread[] = [
			{ id: MAIN_THREAD_ID, label: "main thread", color: "#c41e3a" },
		];
		const incoming: PlotThread[] = [
			{ id: MAIN_THREAD_ID, label: "main thread", color: "#4a90d9", textColor: "#ffffff" },
			{ id: "romance", label: "secondary threads", color: "#22c55e", textColor: "#111111" },
		];
		const merged = mergePlotThreadsImport(current, incoming, { colours: true, names: false }, "replace");
		expect(merged).toEqual([
			{ id: MAIN_THREAD_ID, label: "main thread", color: "#4a90d9", textColor: "#ffffff" },
			{
				id: "romance",
				label: DEFAULT_NEW_THREAD_LABEL,
				color: "#22c55e",
				textColor: "#111111",
			},
		]);
	});

	it("appends imported threads after the live list", () => {
		const merged = mergePlotThreadsImport(
			threads,
			[
				{ id: MAIN_THREAD_ID, label: "main thread", color: "#000000" },
				{ id: "subplot", label: "Subplot", color: "#22c55e", textColor: "#111111" },
			],
			{ colours: true, names: true },
			"add",
		);
		expect(merged.map((thread) => thread.id)).toEqual([MAIN_THREAD_ID, "romance", "subplot"]);
		expect(merged[0]).toEqual(threads[0]);
		expect(merged[2]).toEqual({
			id: "subplot",
			label: "Subplot",
			color: "#22c55e",
			textColor: "#111111",
		});
	});
});
