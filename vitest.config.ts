import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
	resolve: {
		alias: {
			// node_modules/obsidian ships type declarations only (package.json
			// main: "") — the real module is supplied by the running Obsidian app.
			// Tests that need runtime behaviour from value-level obsidian exports
			// (TFile, parseYaml, stringifyYaml, ...) get a minimal stub instead.
			obsidian: fileURLToPath(new URL("./src/__tests__/obsidianStub.ts", import.meta.url)),
		},
	},
	test: {
		environment: "node",
	},
});
