import { defineConfig } from "vite";

// The app's window: src/ui (plain TypeScript and DOM, no UI framework). The browser preview has its own config.
export default defineConfig({
	root: "src/ui",
	base: "./",
	clearScreen: false,
	server: { port: 1420, strictPort: true },
	build: { outDir: "../../dist", emptyOutDir: true, target: "safari15", rollupOptions: { input: "src/ui/index.html" } },
});
