/**
 * A project with a planted leftover temporary file of every kind, and the decoys that must never be touched
 * (docs/temp-tidy.md §6). Used by the tidy tests and by `npm run fixture:leftovers`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const ID = "19f2a3b4c5d6e7f8a9b0c1d2";
export const ID2 = "29f2a3b4c5d6e7f8a9b0c1d2";
const MIN = 60_000;

export interface Planted {
	/** Leftovers the tidy must deal with, by kind. */
	zip: string;
	identical: string;
	newerProse: string;
	olderCodex: string;
	structural: string;
	binary: string;
	recoveryFile: string;
	unclassifiable: string;
	/** Decoys: byte-identical afterwards. */
	decoys: string[];
	/** A matching temp younger than a minute: left alone. */
	young: string;
}

function put(root: string, rel: string, data: string | Buffer, agoMs: number, nowMs: number): void {
	const abs = path.join(root, rel);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, data);
	const t = new Date(nowMs - agoMs);
	fs.utimesSync(abs, t, t);
}

/** Plants the leftovers into a copy of the `series` fixture at `root`. */
/** `nowMs` is the moment the project will be opened at (the times are set relative to it). */
export function plantLeftovers(root: string, nowMs: number = Date.now()): Planted {
	const touchOld = (rel: string, agoMs: number) => {
		const t = new Date(nowMs - agoMs);
		fs.utimesSync(path.join(root, rel), t, t);
	};
	const read = (rel: string) => fs.readFileSync(path.join(root, rel));
	const p: Planted = {
		zip: `_sf-backup/.20261020 - fixture.zip.${ID}.tmp`,
		identical: `_story-library/aaa/.ch-a2.md.${ID}.tmp`,
		newerProse: `_story-library/aaa/.ch-a1.md.${ID}.tmp`,
		olderCodex: `Codex/.Sam.md.${ID}.tmp`,
		structural: `_backstage/storyforge/aaa/.wordcount.md.${ID}.tmp`,
		binary: `_story-library/aaa/.cover.png.${ID}.tmp`,
		recoveryFile: `_sf-backup/recovery/aaa/.ch-a3 2026-10-23 100000.md.${ID}.tmp`,
		unclassifiable: `_sf-backup/.notes.txt.${ID}.tmp`,
		decoys: [
			"_story-library/aaa/.DS_Store",
			"Codex/.Jane.md.icloud",
			`.obsidian/.workspace.json.${ID}.tmp`,
			"_story-library/aaa/.ch-a1.md.zzzz.tmp",
			`_story-library/aaa/ch-a1.md.${ID}.tmp`,
			`elsewhere/.x.md.${ID}.tmp`,
		],
		young: `_story-library/aaa/.ch-a1.md.${ID2}.tmp`,
	};
	put(root, p.zip, "PK partial zip", 10 * MIN, nowMs);
	put(root, p.identical, read("_story-library/aaa/ch-a2.md"), 10 * MIN, nowMs);
	// newer prose: the words being saved when the app died, newer than the file beside it
	touchOld("_story-library/aaa/ch-a1.md", 60 * MIN);
	put(root, p.newerProse, "---\nchapter-order: x\n---\nThe newest words, never swapped in.\n", 10 * MIN, nowMs);
	// older: the previous version of a Codex note, older than the note beside it
	touchOld("Codex/Sam.md", 10 * MIN);
	put(root, p.olderCodex, "---\naliases: []\n---\nSam, as he was before.\n", 120 * MIN, nowMs);
	touchOld("_backstage/storyforge/aaa/wordcount.md", 60 * MIN); // the file beside it is older than its leftover
	put(root, p.structural, "---\nversion: 2\ncurrent: 1\n---\n", 10 * MIN, nowMs);
	put(root, p.binary, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x80, 0x81]), 10 * MIN, nowMs);
	fs.mkdirSync(path.join(root, "_sf-backup/recovery/aaa"), { recursive: true });
	put(root, p.recoveryFile, "Conflict text that exists nowhere else.", 10 * MIN, nowMs);
	put(root, p.unclassifiable, "who knows", 10 * MIN, nowMs);
	for (const d of p.decoys) put(root, d, `decoy ${d}`, 10 * MIN, nowMs);
	put(root, p.young, "a save in flight", 5_000, nowMs);
	return p;
}
