import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The window may call only this app's own commands (Brief 4 §1.1). This fails if a capability grants
 * anything outside the allow-list, if a file-system, shell, network or dialog plugin appears, or if
 * the content security policy would let the window talk to the network.
 */
function readdirSyncRecursive(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = `${dir}/${e.name}`;
		if (e.isDirectory()) return e.name === "__tests__" ? [] : readdirSyncRecursive(p);
		return /\.(ts|css|html)$/.test(e.name) ? [readFileSync(p, "utf8")] : [];
	});
}
const root = (p: string) => fileURLToPath(new URL(`../src-tauri/${p}`, import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(root(p), "utf8"));

/** The commands declared in build.rs. */
const manifest = readFileSync(root("build.rs"), "utf8");
const commands = [...(/const COMMANDS: &\[&str\] = &\[([^\]]*)\]/.exec(manifest)?.[1].matchAll(/"([a-z_]+)"/g) ?? [])].map((m) => m[1]);

const CORE_ALLOWED = new Set(["core:event:allow-listen", "core:event:allow-unlisten", "core:window:allow-destroy", "core:window:allow-start-dragging", "core:window:allow-internal-toggle-maximize"]);

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

	it("the content security policy lets the window draw the image sources the interface really uses, and no more", () => {
		// The browser preview serves no policy, so only this keeps a cover from being blocked in the built app (0.12.0 shipped
		// with `img-src 'self' data:` while the cover box drew `blob:` URLs, and showed "No cover" for a cover that was saved).
		const csp: string = json("tauri.conf.json").app.security.csp;
		const img = (/img-src([^;]*)/.exec(csp)?.[1] ?? "").trim().split(/\s+/);
		const ui = readdirSyncRecursive(fileURLToPath(new URL("../src/ui/", import.meta.url)));
		const used = new Set<string>();
		for (const text of ui) {
			if (/URL\.createObjectURL/.test(text)) used.add("blob:");
			if (/src:\s*["'`]data:/.test(text) || /["'`]data:image/.test(text)) used.add("data:");
		}
		expect(used.has("blob:"), "the cover box draws blob: URLs").toBe(true);
		for (const scheme of used) expect(img, `img-src allows ${scheme}`).toContain(scheme);
		expect(img.every((s) => ["'self'", "data:", "blob:"].includes(s)), `img-src is only ${img.join(" ")}`).toBe(true);
		// Nothing else got broader because of it.
		expect(csp).toContain("default-src 'self'");
		expect(csp).toMatch(/connect-src ipc: http:\/\/ipc\.localhost;/);
		expect(/script-src ([^;]*)/.exec(csp)?.[1]).toBe("'self'");
	});

	it("the font comes from the app itself: font-src is 'self' only, and the faces are the two unmodified files (Brief 10)", () => {
		const csp: string = json("tauri.conf.json").app.security.csp;
		expect(/font-src ([^;]*)/.exec(csp)?.[1]).toBe("'self'");
		const dir = fileURLToPath(new URL("../src/ui/theme/", import.meta.url));
		const css = readFileSync(`${dir}fonts.css`, "utf8");
		// Every source is a relative file inside the app: no URL scheme, no network.
		const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
		expect(urls.sort()).toEqual([
			"./fonts/SNPro-VariableItalic.woff2", "./fonts/SNPro-VariableRegular.woff2",
			"./fonts/aleo/Aleo-Variable.ttf", "./fonts/aleo/Aleo-VariableItalic.ttf",
			"./fonts/atkinson/AtkinsonHyperlegibleNext-Variable.ttf", "./fonts/atkinson/AtkinsonHyperlegibleNext-VariableItalic.ttf",
			"./fonts/courier-prime/CourierPrime-Bold.ttf", "./fonts/courier-prime/CourierPrime-BoldItalic.ttf", "./fonts/courier-prime/CourierPrime-Italic.ttf", "./fonts/courier-prime/CourierPrime-Regular.ttf",
			"./fonts/fraunces/Fraunces-Variable.woff2", "./fonts/fraunces/Fraunces-VariableItalic.woff2",
			"./fonts/inter/InterVariable-Italic.ttf", "./fonts/inter/InterVariable.ttf",
		].sort());
		for (const u of urls) expect(existsSync(`${dir}${u}`), u).toBe(true);
		// Both faces carry the whole weight axis (the files' own default is the thinnest), so bold is never synthesised.
		expect(css.match(/font-weight: 200 900;/g)?.length).toBe(2); // SN Pro; the others declare their own ranges
		expect(css.match(/font-weight: 100 900;/g)?.length).toBe(6); // Aleo, Fraunces, Inter (each upright and italic)
		expect(css).toMatch(/font-style: italic;/);
		// The licence travels with the app and with the files.
		expect(existsSync(`${dir}fonts/OFL.txt`)).toBe(true);
		expect(json("tauri.conf.json").bundle.resources).toEqual({
			"../src/ui/theme/fonts/OFL.txt": "OFL.txt",
			"../src/ui/theme/fonts/aleo/OFL.txt": "OFL-Aleo.txt",
			"../src/ui/theme/fonts/atkinson/OFL.txt": "OFL-Atkinson-Hyperlegible-Next.txt",
			"../src/ui/theme/fonts/courier-prime/OFL.txt": "OFL-Courier-Prime.txt",
			"../src/ui/theme/fonts/fraunces/OFL.txt": "OFL-Fraunces.txt",
			"../src/ui/theme/fonts/inter/OFL.txt": "OFL-Inter.txt",
		});
		for (const d of ["aleo", "atkinson", "courier-prime", "fraunces", "inter"]) expect(existsSync(`${dir}fonts/${d}/OFL.txt`), d).toBe(true);
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
