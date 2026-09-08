import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTFile } from "../../__tests__/obsidianStub.js";
import { TITLEFORGE_BACKSTAGE_ROOT } from "../../paths.js";
import { ALL_TITLEFORGE_LEXICONS } from "../lexicons/index.js";
import { TitleForgeStorage } from "../storage.js";

/**
 * In-memory stand-in for the vault surface `storage.ts` touches. `writes` records every path ever
 * created/modified, so a test can assert that loading writes no lexicon JSON (invariant I0).
 */
function makeFakeApp(initialFiles: Record<string, string> = {}): {
	app: App;
	files: Map<string, string>;
	writes: string[];
} {
	const files = new Map<string, string>(Object.entries(initialFiles));
	const writes: string[] = [];
	const vault = {
		getAbstractFileByPath: (path: string) => (files.has(path) ? makeTFile(path) : null),
		read: async (file: { path: string }) => {
			if (!files.has(file.path)) throw new Error(`ENOENT: ${file.path}`);
			return files.get(file.path)!;
		},
		create: async (path: string, content: string) => {
			files.set(path, content);
			writes.push(path);
			return makeTFile(path);
		},
		modify: async (file: { path: string }, content: string) => {
			files.set(file.path, content);
			writes.push(file.path);
		},
		createFolder: async () => undefined,
		adapter: {
			exists: async (path: string) => files.has(path),
			read: async (path: string) => {
				if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
				return files.get(path)!;
			},
		},
	};
	return { app: { vault } as unknown as App, files, writes };
}

const ADDITIONS_PATH = `${TITLEFORGE_BACKSTAGE_ROOT}/user enhanced lexicon.md`;
const TITLE_COMPOSER = ALL_TITLEFORGE_LEXICONS.find((s) => s.id === "title-composer")!;

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("loadAllGenerators — compiled-in bundle + user additions", () => {
	it("bootstraps the additions file on first load and writes no lexicon JSON (I0)", async () => {
		const { app, files, writes } = makeFakeApp();
		const storage = new TitleForgeStorage(app);

		const generators = await storage.loadAllGenerators();

		expect(generators.map((g) => g.id)).toEqual(ALL_TITLEFORGE_LEXICONS.map((g) => g.id));
		expect(files.has(ADDITIONS_PATH)).toBe(true);
		expect(writes.every((p) => !p.includes("/lexicons/"))).toBe(true);
		expect(writes).toEqual([ADDITIONS_PATH]);
	});

	it("with the bootstrap template only, title-composer deep-equals the bundle (I1)", async () => {
		const { app } = makeFakeApp();
		const storage = new TitleForgeStorage(app);

		const generators = await storage.loadAllGenerators();
		const titleComposer = generators.find((g) => g.id === "title-composer")!;
		expect(titleComposer).toEqual(TITLE_COMPOSER);
	});

	it("merges a real user word into title-composer's slot", async () => {
		const { app } = makeFakeApp({
			[ADDITIONS_PATH]: ["## place", "- Neon Quay #sf"].join("\n"),
		});
		const storage = new TitleForgeStorage(app);

		const generators = await storage.loadAllGenerators();
		const place = generators.find((g) => g.id === "title-composer")!.lexicon.place as unknown[];
		expect(place).toContainEqual({ gloss: "Neon Quay", tags: ["sf"] });
		// A non-title-composer generator is the untouched bundled object.
		expect(generators.find((g) => g.id === "western-serial")).toBe(
			ALL_TITLEFORGE_LEXICONS.find((s) => s.id === "western-serial"),
		);
	});

	it("falls back to the pure bundle when the additions file can't be read (I3)", async () => {
		const { app } = makeFakeApp();
		// adapter.exists says yes, but every read throws — a corrupt/locked file.
		app.vault.getAbstractFileByPath = () => null;
		app.vault.adapter.exists = async () => true;
		app.vault.adapter.read = async () => {
			throw new Error("EIO");
		};
		const storage = new TitleForgeStorage(app);

		const generators = await storage.loadAllGenerators();

		expect(generators.find((g) => g.id === "title-composer")).toBe(TITLE_COMPOSER);
	});
});

describe("grep-guard — the retired seed machinery is gone (test §7)", () => {
	it("storage.ts no longer mentions the seed/reset concepts", () => {
		const source = readFileSync(
			fileURLToPath(new URL("../storage.ts", import.meta.url)),
			"utf8",
		);
		expect(source).not.toMatch(/ensureLexiconsSeeded/);
		expect(source).not.toMatch(/resetLexiconToBundled/);
		expect(source).not.toMatch(/seed-manifest/);
	});
});
