import type { App } from "obsidian";
import { makeTFile } from "../../__tests__/obsidianStub.js";
import { beforeEach, describe, expect, it } from "vitest";
import { TITLEFORGE_BACKSTAGE_ROOT } from "../../paths.js";
import { ALL_TITLEFORGE_LEXICONS } from "../lexicons/index.js";
import { TitleForgeStorage } from "../storage.js";

/**
 * In-memory stand-in for the vault surface `storage.ts` actually touches
 * (`getAbstractFileByPath`, `create`/`modify`/`createFolder`, `adapter.exists`/`read`) — same
 * fake-vault convention as `writeGuard.test.ts`, just persistent across calls so a whole
 * seed/reset/reload sequence can be exercised in one test.
 */
function makeFakeApp(initialFiles: Record<string, string> = {}): { app: App; files: Map<string, string> } {
	const files = new Map<string, string>(Object.entries(initialFiles));
	const vault = {
		getAbstractFileByPath: (path: string) => (files.has(path) ? makeTFile(path) : null),
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
			read: async (path: string) => {
				if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
				return files.get(path)!;
			},
		},
	};
	const app = { vault } as unknown as App;
	return { app, files };
}

const ID = ALL_TITLEFORGE_LEXICONS[0].id;
const NAME = ALL_TITLEFORGE_LEXICONS[0].name;
const bundledText = JSON.stringify(ALL_TITLEFORGE_LEXICONS[0], null, "\t");
const lexiconPath = `${TITLEFORGE_BACKSTAGE_ROOT}/lexicons/${ID}.json`;
const manifestPath = `${TITLEFORGE_BACKSTAGE_ROOT}/lexicons/.seed-manifest.json`;

describe("resetLexiconToBundled — bug fix 2 (the reset action can't repair a stale spec)", () => {
	it("re-resolves the bundled spec by id, ignoring whatever spec the caller passes", async () => {
		const { app, files } = makeFakeApp({ [lexiconPath]: JSON.stringify({ stale: true }) });
		const storage = new TitleForgeStorage(app);

		// The caller passes a deliberately-stale/wrong spec object — the very bug: a vault-preferred
		// "bundled" reference. The fix must not trust it.
		const staleSpec = { ...ALL_TITLEFORGE_LEXICONS[0], id: ID, genres: [] } as never;
		await storage.resetLexiconToBundled(staleSpec);

		expect(files.get(lexiconPath)).toBe(bundledText);
	});

	it("accepts a bare id directly", async () => {
		const { app, files } = makeFakeApp();
		const storage = new TitleForgeStorage(app);
		await storage.resetLexiconToBundled(ID);
		expect(files.get(lexiconPath)).toBe(bundledText);
	});

	it("throws for an unknown id rather than writing nothing silently", async () => {
		const { app } = makeFakeApp();
		const storage = new TitleForgeStorage(app);
		await expect(storage.resetLexiconToBundled("not-a-real-generator")).rejects.toThrow(
			/No bundled lexicon/,
		);
	});
});

describe("ensureLexiconsSeeded — bug fix 1 (safe seed propagation)", () => {
	it("seeds a brand-new vault with the bundled bytes and records the manifest", async () => {
		const { app, files } = makeFakeApp();
		const storage = new TitleForgeStorage(app);
		await storage.ensureLexiconsSeeded();

		expect(files.get(lexiconPath)).toBe(bundledText);
		const manifest = JSON.parse(files.get(manifestPath)!);
		expect(manifest[ID].bundledHash).toBe(manifest[ID].fileHash);
	});

	it("re-seeds an untouched file when the bundle changes (the propagation fix)", async () => {
		const staleBundledText = JSON.stringify({ ...ALL_TITLEFORGE_LEXICONS[0], name: "Old name" });
		// Simulate: this id was seeded once, from an older bundle, and never hand-edited since.
		const { app, files } = makeFakeApp({ [lexiconPath]: staleBundledText });
		const storage = new TitleForgeStorage(app);
		const oldHash = await sha256(staleBundledText);
		files.set(
			manifestPath,
			JSON.stringify({ [ID]: { bundledHash: oldHash, fileHash: oldHash } }),
		);

		await storage.ensureLexiconsSeeded();

		expect(files.get(lexiconPath)).toBe(bundledText);
	});

	it("keeps a hand-edited file when the bundle changes, and does not throw", async () => {
		const staleBundledText = JSON.stringify({ ...ALL_TITLEFORGE_LEXICONS[0], name: "Old name" });
		const editedText = JSON.stringify({ ...ALL_TITLEFORGE_LEXICONS[0], name: "My hand-edited copy" });
		const { app, files } = makeFakeApp({ [lexiconPath]: editedText });
		const storage = new TitleForgeStorage(app);
		// The manifest reflects the moment of the *original* seed — bundledHash and fileHash both
		// equal the old bundled bytes' hash, since that's what was written then. The hand-edit
		// happened afterwards, on disk only, so the manifest never learned about it directly; it's
		// detected here purely from currentFileHash no longer matching entry.fileHash.
		const oldHash = await sha256(staleBundledText);
		files.set(manifestPath, JSON.stringify({ [ID]: { bundledHash: oldHash, fileHash: oldHash } }));

		await storage.ensureLexiconsSeeded();

		expect(files.get(lexiconPath)).toBe(editedText);
	});

	it("leaves a pre-existing (pre-manifest) vault copy untouched and just records it", async () => {
		const preExisting = JSON.stringify({ ...ALL_TITLEFORGE_LEXICONS[0], name: "From an old install" });
		const { app, files } = makeFakeApp({ [lexiconPath]: preExisting });
		const storage = new TitleForgeStorage(app);
		// No manifest file at all yet.
		expect(files.has(manifestPath)).toBe(false);

		await storage.ensureLexiconsSeeded();

		expect(files.get(lexiconPath)).toBe(preExisting);
		const manifest = JSON.parse(files.get(manifestPath)!);
		expect(manifest[ID].fileHash).toBe(await sha256(preExisting));
	});

	it("is idempotent: a second run with nothing changed writes nothing further", async () => {
		const { app, files } = makeFakeApp();
		const storage = new TitleForgeStorage(app);
		await storage.ensureLexiconsSeeded();
		const afterFirst = new Map(files);

		await storage.ensureLexiconsSeeded();
		expect(files).toEqual(afterFirst);
	});
});

async function sha256(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
