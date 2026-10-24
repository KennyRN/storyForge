import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The window may call only this app's own commands (Brief 4 §1.1). This fails if a capability grants
 * anything outside the allow-list, if a file-system, shell, network or dialog plugin appears, or if
 * the content security policy would let the window talk to the network.
 */
const root = (p: string) => fileURLToPath(new URL(`../src-tauri/${p}`, import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(root(p), "utf8"));

/** The commands declared in build.rs. */
const manifest = readFileSync(root("build.rs"), "utf8");
const commands = [...(/const COMMANDS: &\[&str\] = &\[([^\]]*)\]/.exec(manifest)?.[1].matchAll(/"([a-z_]+)"/g) ?? [])].map((m) => m[1]);

const CORE_ALLOWED = new Set(["core:event:allow-listen", "core:event:allow-unlisten", "core:window:allow-destroy"]);

describe("the window's permissions", () => {
	const files = readdirSync(root("capabilities")).filter((f) => f.endsWith(".json"));

	it("there is at least the main capability", () => {
		expect(files).toContain("main.json");
	});

	for (const file of files) {
		it(`${file} grants only the app's own commands and the window's own needs`, () => {
			const cap = json(`capabilities/${file}`);
			for (const perm of cap.permissions as (string | { identifier: string })[]) {
				const id = typeof perm === "string" ? perm : perm.identifier;
				const isOwn = /^allow-[a-z-]+$/.test(id) && commands.includes(id.slice("allow-".length).replace(/-/g, "_"));
				expect(isOwn || CORE_ALLOWED.has(id), `${file} grants "${id}"`).toBe(true);
			}
			expect(cap.windows).toEqual(["main"]);
			expect(cap.remote, "no remote origin may be granted anything").toBeUndefined();
		});
	}

	it("every declared command is granted, and registered in the handler, and nothing else is", () => {
		expect(commands.length).toBeGreaterThan(10);
		const granted = (json("capabilities/main.json").permissions as string[]).filter((p) => p.startsWith("allow-")).map((p) => p.slice(6).replace(/-/g, "_"));
		expect([...granted].sort()).toEqual([...commands].sort());
		const lib = readFileSync(root("src/lib.rs"), "utf8");
		const handler = /generate_handler!\[([\s\S]*?)\]/.exec(lib)?.[1] ?? "";
		const registered = handler.split(",").map((x) => x.trim()).filter(Boolean);
		expect([...registered].sort()).toEqual([...commands].sort());
	});

	it("no Tauri plugin that exposes the file system, shell, network or dialogs is a dependency", () => {
		const cargo = readFileSync(root("Cargo.toml"), "utf8");
		for (const banned of ["plugin-fs", "plugin-shell", "plugin-http", "plugin-dialog", "plugin-opener", "plugin-os", "plugin-process", "plugin-updater", "plugin-websocket", "plugin-upload"]) {
			expect(cargo.includes(`tauri-${banned}`), banned).toBe(false);
		}
		const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
		const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
		expect(deps.filter((d) => d.startsWith("@tauri-apps/plugin-"))).toEqual([]);
	});

	it("the configuration allows no network and no global API", () => {
		const conf = json("tauri.conf.json");
		expect(conf.app.withGlobalTauri).toBe(false);
		const csp: string = conf.app.security.csp;
		expect(csp).not.toMatch(/https?:\/\/(?!ipc\.localhost)/);
		expect(csp).toContain("default-src 'self'");
		expect(csp).not.toContain("*");
		expect(conf.app.windows[0].theme).toBe("Dark");
		expect(conf.app.windows[0].backgroundColor).toBe("#293136");
		expect(conf.identifier).toBe("io.github.kennyrn.storyforge");
		expect(conf.plugins ?? {}).toEqual({});
	});

	it("the first frame is dark before any script runs", () => {
		// The window itself starts on Soft Dark's bg_dim; the page's stylesheet is a render-blocking link in a production build.
		const conf = json("tauri.conf.json");
		const window0 = conf.app.windows[0];
		expect(String(window0.backgroundColor).toLowerCase()).toBe("#293136");
		expect(window0.theme).toBe("Dark");
		const html = readFileSync(fileURLToPath(new URL("../src/ui/index.html", import.meta.url)), "utf8");
		expect(html).not.toMatch(/<script(?![^>]*type="module")/); // no classic script runs before the first paint
	});
});
