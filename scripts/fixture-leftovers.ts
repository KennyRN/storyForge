/**
 * `npm run fixture:leftovers [-- <folder>]`: a copy of the synthetic `series` project with a leftover temporary file
 * of every kind planted in it (and the decoys that must never be touched), to open in the built app and look at the
 * summary and `_sf-backup/recovery/`. Never touches a real project.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { plantLeftovers } from "../test/helpers/leftovers";

const here = path.dirname(fileURLToPath(import.meta.url));
// Never among the author's own files (decision 89): the default is a fresh folder in the system's temporary directory.
const target = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), `storyForge leftovers fixture ${Date.now()}`));
if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
	console.error(`${target} already exists and is not empty. Give another folder, or remove it first.`);
	process.exit(1);
}
fs.cpSync(path.join(here, "../test/fixtures/series"), target, { recursive: true });
const planted = plantLeftovers(target);
console.log(`Planted in ${target}:`);
for (const [kind, rel] of Object.entries(planted)) console.log(`  ${kind}: ${Array.isArray(rel) ? rel.join(", ") : rel}`);
console.log("\nOpen that folder in storyForge, read the summary, then look in _sf-backup/recovery/.");
