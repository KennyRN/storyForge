import { defineConfig, devices } from "@playwright/test";

// The interface tests run in WebKit (the engine closest to macOS's own) against the browser preview
// (docs/interface.md §8). One worker: the preview server holds one project at a time.
export default defineConfig({
	testDir: "test/ui",
	testMatch: "**/*.ui.ts",
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: { baseURL: "http://127.0.0.1:1421", ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" },
	projects: [{ name: "webkit" }],
	webServer: { command: "npx vite --config vite.preview.config.ts", url: "http://127.0.0.1:1421/index.html", reuseExistingServer: true, timeout: 120_000, env: { VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" } },
});
