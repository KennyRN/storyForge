// Regenerates the synthetic fixture projects in this folder (node test/fixtures/build.mjs).
// Everything here is invented text. Never put real manuscript or Codex text in a fixture.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function project(name, files) {
	const root = join(here, name);
	rmSync(root, { recursive: true, force: true });
	mkdirSync(root, { recursive: true });
	for (const [path, content] of Object.entries(files)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
	}
}

const lf = (lines) => lines.join("\n") + "\n";
const crlf = (lines) => lines.join("\r\n") + "\r\n";
const ref = (path, name) => `v1;${encodeURIComponent(path)}=${encodeURIComponent(name)}`;

// ------------------------------------------------------------------------------ series
const series = lf([
	"---",
	"series-title: The Lantern Cycle",
	"series-id: s-7k2p",
	"order:",
	"  - aaa",
	"  - bbb",
	"unplaced-order:",
	"  - ccc",
	"books:",
	"  aaa:",
	"    book-id: b-aaa1",
	'    book-title: "Book #: The Harbour Wakes"',
	'    book-color: "#3a6ea5"',
	"  bbb:",
	"    book-id: b-bbb2",
	'    book-title: "Book #"',
	"  ccc:",
	"    book-id: b-ccc3",
	"    book-title: Spare Draft",
	"x-unknown-note: kept by every rewrite",
	"# a comment the app must not lose",
	"cover-image: cover.jpg",
	"---",
	"",
	"## Description",
	"A synthetic series used only for tests.",
	"",
]);

const novelAaa = lf([
	"---",
	"book-id-reference: b-aaa1",
	'book-title-reference: "Book #: The Harbour Wakes"',
	"series-order-reference: 1",
	"chapter-order:",
	"  - ch-a1.md",
	"  - ch-a2.md",
	"  - ch-a5.md",
	"unplaced:",
	"  - ch-a3.md",
	"archive:",
	"  - ch-a4.md",
	"cover-image: cover.png",
	"dialogue-quotes: single",
	"default-pov-path: Codex/Jane.md",
	"default-pov-name: Jane",
	"planned-novel-length: 80000",
	"planned-chapter-length: 2500",
	"novel-tags:",
	"  - drafting",
	"plot-thread: main   # residue of the cut plot-threads feature",
	"goal_daily: 500",
	"x-unknown-map: {alpha: 1, beta: [x, y]}",
	"chapters:",
	"  ch-a1.md:",
	"    chapter-id: c-a1k3",
	'    chapter-title: "Chapter #"',
	`    pov: "${ref("Codex/Jane.md", "Jane")}"`,
	`    location: "${ref("Codex/Harbour.md", "The Harbour")}"`,
	"    plot: Jane reaches the harbour at dawn.",
	"    tags:",
	"      - draft",
	'    chapter-color: "#aa3300"',
	"    plot-thread: main",
	"  ch-a2.md:",
	"    chapter-id: c-a2m8",
	'    chapter-title: "The Storm: Part Two"',
	"    pov-path:",
	"      - Codex/Jane.md",
	"    pov-name:",
	"      - Jane",
	"    location-path: Codex/Harbour.md",
	"    location-name: The Harbour",
	"    plot: ''",
	"  # a comment between entries",
	"  ch-a3.md:",
	"    chapter-id: c-a3q1",
	"    chapter-title: Unplaced idea // with a subtitle",
	"  ch-a4.md:",
	"    chapter-id: c-a4w5",
	"    chapter-title: 日本語の章",
	"  ch-a5.md:",
	"    chapter-id: c-a5z9",
	'    chapter-title: "Chapter #"',
	"    x-entry-unknown: keep",
	"---",
	"",
	"Notes below the frontmatter belong to the author.",
	"",
]);

const novelBbb = lf([
	"---",
	"book-id-reference: b-bbb2",
	'book-title-reference: "Book #"',
	"series-order-reference: 2",
	"chapter-order:",
	"  - ch-b1.md",
	"unplaced:",
	"archive:",
	"chapters:",
	"  ch-b1.md:",
	"    chapter-id: c-b1aa",
	"    chapter-title: Opening",
	"---",
	"",
]);

const novelCcc = lf([
	"---",
	"book-id-reference: b-ccc3",
	"book-title-reference: Spare Draft",
	"series-order-reference: 3",
	"chapter-order:",
	"---",
	"",
]);

const prose = (n) => lf(Array.from({ length: n }, (_, i) => `Synthetic sentence number ${i + 1} walks across the page without meaning anything.`));

const codex = lf([
	"---",
	"folders:",
	"  f-cast:",
	"    name: Cast",
	"    order:",
	"      - Codex/Jane.md",
	"      - Codex/Sam.md",
	"  f-places:",
	"    name: Places",
	"    order:",
	"      - Codex/Harbour.md",
	"    linkedNotePath: Codex/Harbour.md",
	"order:",
	"  - f-cast",
	"  - f-places",
	"  - Codex/Windows.md",
	"archive:",
	"  - Codex/Retired.md",
	"types:",
	"  Codex/Jane.md: person",
	"  Codex/Sam.md: person",
	"  Codex/Harbour.md: place",
	"  Codex/Windows.md: populace",
	"x-unknown-key: kept",
	"---",
	"",
]);

const tagRegistry = lf([
	"---",
	"codex-types:",
	'  - id: "person"',
	'    label: "Person"',
	'    icon-alias: "person-fill"',
	'  - id: "place"',
	'    label: "Place"',
	'    icon-alias: "location-pin"',
	'  - id: "populace"',
	'    label: "Populace"',
	'    icon-alias: "person-2-fill"',
	"chapter-tags:",
	'  - id: "draft"',
	'    label: "Draft"',
	'    icon-alias: "pencil"',
	"novel-tags:",
	'  - id: "drafting"',
	'    label: "Drafting"',
	'    icon-alias: "pencil"',
	"idea-types:",
	"archive-types:",
	"---",
	"",
]);

// Brought up to date with the chapters as the app counts them (22 and 10 words), so a screenshot's day figure shows only what was typed (decision 72). The daily entries are left as they were: tests read them.
const wordcount = lf([
	"version: 2",
	"current: 32",
	"lifetimeWritten: 41",
	"lifetimeRemoved: 9",
	"chapters:",
	"  ch-a1.md:",
	"    words: 22",
	"    archivedWords: null",
	"  ch-a2.md:",
	"    words: 10",
	"    archivedWords: null",
	"daily:",
	"  2026-10-20:",
	"    net: 25",
	"    chapters:",
	"      ch-a1.md: 25",
	"  2026-10-21:",
	"    net: 6",
	"    chapters:",
	"      ch-a2.md: 6",
]);

const sidecar = lf([
	"---",
	"chapter: ch-a1.md",
	"x-sidecar-unknown: keep",
	"---",
	"",
	"<!-- AUTO-MAINTAINED BELOW — do not edit, the plugin overwrites it -->",
	"",
	"## opening",
	"Synthetic sentence number 1 walks across the page without meaning anything.",
	"",
	"## closing",
	"Synthetic sentence number 2 walks across the page without meaning anything.",
	"",
]);

const full = {
	"_story-library/series.md": series,
	"_story-library/novel-aaa.md": novelAaa,
	"_story-library/novel-bbb.md": novelBbb,
	"_story-library/novel-ccc.md": novelCcc,
	"_story-library/aaa/ch-a1.md": prose(2),
	"_story-library/aaa/ch-a2.md": lf(["Opening line of a second chapter %%a hidden comment%% continues here.", "", "It ends.",]),
	"_story-library/aaa/ch-a3.md": prose(1),
	"_story-library/aaa/ch-a4.md": prose(3),
	"_story-library/aaa/ch-a5.md": "A chapter with no trailing newline at the end of the file",
	"_story-library/bbb/ch-b1.md": prose(2),
	"_story-library/ccc/.gitkeep": "",
	"Codex/Jane.md": lf(["---", "aliases:", "  - J", '  - "Jay: the first"', "tags: [hero]", "custom-key: kept", "---", "", "Jane is an invented character. Nothing here is real."]),
	"Codex/Sam.md": lf(["---", "aliases: Sammy", "---", "", "Sam is invented too."]),
	"Codex/Harbour.md": lf(["# The Harbour", "", "A note with no frontmatter at all."]),
	"Codex/Windows.md": crlf(["---", "aliases:", "  - Win", "---", "", "A note written with Windows line endings.", "Second line."]),
	"Codex/Retired.md": lf(["---", "aliases: []", "---", "", "An archived note."]),
	"Codex/Zoë Åberg — 日本語.md": lf(["---", "aliases:", "  - Zoe", "---", "", "A non-ASCII title."]),
	"Codex/NoNewline.md": "---\naliases:\n  - NN\n---\nno newline at the end",
	"_backstage/storyforge/codex.md": codex,
	"_backstage/storyforge/tag-registry.md": tagRegistry,
	"_backstage/storyforge/plot-threads.md": lf(["---", "threads:", "  - id: main", "    label: Main thread", '    color: "#f59e0b"', "---", ""]),
	"_backstage/storyforge/vault-tags.md": lf(["---", "order: []", "tags: []", "---", ""]),
	"_backstage/storyforge/notes.md": lf(["---", "folders:", "order:", "archive:", "types:", "---", ""]),
	"_backstage/storyforge/aaa/wordcount.md": wordcount,
	"_backstage/storyforge/aaa/chapters/ch-a1.md": sidecar,
	"_backstage/storyforge/aaa/story-details/ch-a1.md": lf(["---", "contentHash: abc", "---", "", "cut-feature residue"]),
	"_backstage/storyforge/aaa/story-details/attribution.md": lf(["---", "decisions: {}", "---", ""]),
	"_backstage/storyforge/aaa/cover.png": "\u0089PNG synthetic cover bytes",
	"_backstage/storyforge/_series/cover.jpg": "synthetic series cover bytes",
	"_backstage/storyforge/settings-presets/My Theme.json": '{"synthetic": true}\n',
	"_backstage/titleforge/settings.json": '{"lastGenre":"fantasy"}\n',
	"_backstage/titleforge/lexicons/title-composer.json": '{"id":"title-composer"}\n',
	"_export/types-tags 2026-10-01.json": '{"format":"synthetic"}\n',
	"notes/idea.md": lf(["---", "type: idea", "---", "", "A notebook note."]),
	"notes/archive/old.md": lf(["An archived notebook note."]),
	"elsewhere/readme.md": lf(["---", "unrelated: true", "---", "", "A file outside storyForge's folders."]),
	"elsewhere/picture.png": "synthetic image bytes",
	".obsidian/app.json": "{}\n",
	".obsidian/plugins/storyforge/data.json": '{"autoFocus":true,"layout":"novelBrowse"}\n',
};

project("series", full);

project("empty", { ".gitkeep": "" });

// A project in a layout older than 0.14: must be refused, with no writes.
project("pre-0.17", {
	"_sf-storylibrary/tec/ch1.md": prose(1),
	"_sf-backstage/series.md": lf(["---", "title: Old Series", "order:", "---", ""]),
	"_sf-backstage/tec/novel.md": lf(["---", "id: tec", "title: Old Book", "order:", "  - ch1.md", "---", ""]),
});
console.log("fixtures written");
