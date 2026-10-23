import { defineConfig } from "vite";

// The window's TypeScript (the diagnostic window now, Brief 5's interface later). No UI framework.
export default defineConfig({
	root: "src/diagnostic",
	base: "./",
	clearScreen: false,
	server: { port: 1420, strictPort: true },
	build: { outDir: "../../dist", emptyOutDir: true, target: "safari15" },
});
