import { defineConfig, type Plugin } from "vite";

/**
 * The diagnostic page is for development builds only. In a production build its import resolves to an empty
 * module, so the page, its styles and the code only it uses are not in the bundle at all (test/releaseBuild.test.ts).
 */
function noDiagnosticsInRelease(): Plugin {
	const empty = "\0storyforge-no-diagnostics";
	return {
		name: "storyforge-no-diagnostics",
		apply: "build",
		enforce: "pre",
		resolveId(id) {
			return /diagnostic\/diagnostics(\.ts)?$/.test(id) ? empty : null;
		},
		load(id) {
			return id === empty ? "export const mountDiagnostics = undefined;" : null;
		},
	};
}

// The app's window: src/ui (plain TypeScript and DOM, no UI framework). The browser preview has its own config.
export default defineConfig({
	root: "src/ui",
	base: "./",
	clearScreen: false,
	server: { port: 1420, strictPort: true },
	plugins: [noDiagnosticsInRelease()],
	build: { outDir: "../../dist", emptyOutDir: true, target: "safari15", rollupOptions: { input: "src/ui/index.html" } },
});
