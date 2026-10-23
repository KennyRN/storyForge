import { defineConfig } from "vite";
import { previewHostPlugin } from "./scripts/preview/plugin";

// The browser preview (docs/interface.md §8): development only, 127.0.0.1 only, never part of a release build.
export default defineConfig({
	root: "src/ui/preview",
	clearScreen: false,
	server: { host: "127.0.0.1", port: 1421, strictPort: true },
	plugins: [previewHostPlugin()],
	build: { outDir: "../../../.preview-dist", emptyOutDir: true, target: "safari15" },
});
