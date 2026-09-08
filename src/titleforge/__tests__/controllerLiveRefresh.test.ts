import type { Plugin } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTFile } from "../../__tests__/obsidianStub.js";
import { TITLEFORGE_BACKSTAGE_ROOT } from "../../paths.js";
import { TitleForgeController } from "../TitleForgeController.js";

const ADDITIONS_PATH = `${TITLEFORGE_BACKSTAGE_ROOT}/user enhanced lexicon.md`;

/** A fake Plugin whose vault dispatches `modify`/`create`/`delete` to registered handlers. */
function makeFakePlugin(initialFiles: Record<string, string> = {}): {
	plugin: Plugin;
	files: Map<string, string>;
	emit: (event: "modify" | "create" | "delete", path: string) => void;
} {
	const files = new Map(Object.entries(initialFiles));
	const handlers: Record<string, Array<(file: { path: string }) => void>> = {};
	const vault = {
		on: (event: string, cb: (file: { path: string }) => void) => {
			(handlers[event] ??= []).push(cb);
			return { event };
		},
		getAbstractFileByPath: (path: string) => (files.has(path) ? makeTFile(path) : null),
		read: async (file: { path: string }) => files.get(file.path)!,
		create: async (path: string, content: string) => {
			files.set(path, content);
			return makeTFile(path);
		},
		modify: async (file: { path: string }, content: string) => {
			files.set(file.path, content);
		},
		createFolder: async () => undefined,
		adapter: {
			exists: async (path: string) => files.has(path),
			read: async (path: string) => files.get(path)!,
		},
	};
	const app = { vault };
	const plugin = {
		app,
		addRibbonIcon: () => ({}),
		addCommand: () => ({}),
		registerEvent: () => undefined,
	} as unknown as Plugin;
	const emit = (event: "modify" | "create" | "delete", path: string): void => {
		for (const cb of handlers[event] ?? []) cb({ path });
	};
	return { plugin, files, emit };
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("TitleForgeController — live re-scan of the user-additions file", () => {
	it("picks up a new word (and notifies listeners) when the file changes, no reload", async () => {
		const { plugin, files, emit } = makeFakePlugin();
		const controller = new TitleForgeController(plugin);
		await controller.onload();

		const placeBefore = controller.getGeneratorById("title-composer")!.lexicon.place as unknown[];
		expect(placeBefore).not.toContainEqual({ gloss: "Neon Quay", tags: ["sf"] });

		const notified = vi.fn();
		controller.onGeneratorsReloaded(notified);

		files.set(ADDITIONS_PATH, ["## place", "- Neon Quay #sf"].join("\n"));
		emit("modify", ADDITIONS_PATH);
		await vi.runAllTimersAsync();

		const placeAfter = controller.getGeneratorById("title-composer")!.lexicon.place as unknown[];
		expect(placeAfter).toContainEqual({ gloss: "Neon Quay", tags: ["sf"] });
		expect(notified).toHaveBeenCalledTimes(1);
	});

	it("ignores changes to any other file", async () => {
		const { plugin, emit } = makeFakePlugin();
		const controller = new TitleForgeController(plugin);
		await controller.onload();

		const notified = vi.fn();
		controller.onGeneratorsReloaded(notified);

		emit("modify", `${TITLEFORGE_BACKSTAGE_ROOT}/settings.json`);
		await vi.runAllTimersAsync();

		expect(notified).not.toHaveBeenCalled();
	});
});
