/**
 * Times opening a synthetic project through the real Rust code: `npx tsx scripts/measure-scan.ts [chapters] [words]`.
 * Builds the project in a temp folder (invented text), runs the one bulk scan, and builds the index.
 * Needs the Rust bridge: `cargo build -p storyforge-fs --bin sf-bridge` in src-tauri.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFsBackend } from "../src/backends/node-fs";
import { TauriBackend } from "../src/backends/tauri";
import { Project } from "../src/core/project";
import { RustBridge, buildBridge } from "../test/helpers/rustBridge";

const chapters = Number(process.argv[2] ?? 2000);
const words = Number(process.argv[3] ?? 2000);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "sf-measure-"));
const books = Math.max(1, Math.round(chapters / 40));
const paragraph = "Synthetic sentence number one walks across the page without meaning anything at all. ";
const body = Array.from({ length: Math.ceil(words / 14) }, () => paragraph).join("").trim() + "\n";
fs.mkdirSync(path.join(root, "_story-library"), { recursive: true });
fs.writeFileSync(path.join(root, "_story-library/series.md"), "---\nseries-title: Measure\norder:\nbooks:\n---\n");
for (let b = 0; b < books; b++) {
	const code = `b${String(b).padStart(3, "0")}`;
	fs.mkdirSync(path.join(root, "_story-library", code));
	for (let c = 0; c < Math.ceil(chapters / books); c++) fs.writeFileSync(path.join(root, "_story-library", code, `c${String(c).padStart(3, "0")}.md`), body);
}
fs.mkdirSync(path.join(root, "Codex"));
for (let i = 0; i < 300; i++) fs.writeFileSync(path.join(root, "Codex", `Note ${i}.md`), `---\naliases: []\n---\n${body.slice(0, 2000)}`);
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

async function time<T>(label: string, f: () => Promise<T>): Promise<T> {
	const t = performance.now();
	const out = await f();
	console.log(`${label.padEnd(34)} ${(performance.now() - t).toFixed(0).padStart(6)} ms`);
	return out;
}

async function main() {
	buildBridge();
	const bridge = await RustBridge.open(root);
	let payload = 0;
	let entries = 0;
	const backend = new TauriBackend(async (cmd, a) => {
		const out = await bridge.invoke(cmd, a);
		if (cmd === "scan") {
			payload = JSON.stringify(out).length;
			entries = (out as unknown[]).length;
		}
		return out;
	});
	console.log(`${chapters} chapters of about ${words} words in ${books} books, 300 Codex notes (${mb(chapters * body.length)} MB of prose)`);
	await time("node-fs: open (scan + index)", () => Project.open(new NodeFsBackend(root)));
	await time("Rust over the bridge: open", () => Project.open(backend));
	console.log(`scan reply: ${entries} entries, ${mb(payload)} MB of JSON`);
	bridge.close();
	fs.rmSync(root, { recursive: true, force: true });

}
void main();
