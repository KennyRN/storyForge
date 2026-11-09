// Writes the small sample project for the Windows preview's tester (Brief 22; docs/windows-test.md).
// Usage: node scripts/sample-project.mjs <empty folder>
// Everything in it is invented. It is made from scratch, not copied from test/fixtures: the fixtures hold files that exist
// only to test the app (broken covers, legacy keys, comments the app must keep), and none of that belongs in a tester's hands.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.argv[2];
if (!root) {
	console.error("Usage: node scripts/sample-project.mjs <folder>");
	process.exit(2);
}
const put = (rel, text) => {
	const file = join(root, ...rel.split("/"));
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
};
const para = (n) => `Lanterns line the harbour wall, and ${n} small boats ride at their ropes. Nobody here is real, and nothing that happens is meant to matter.\n\nThe tide turns slowly. Someone says the word "morning" as if it were a promise, and the gulls pretend not to hear.\n`;

put("_story-library/series.md", `---
series-title: The Sample Series
series-id: s-sample
order:
  - one
  - two
books:
  one:
    book-id: b-one1
    book-title: "Book #: The Harbour Wakes"
  two:
    book-id: b-two2
    book-title: "Book #: The Long Night"
---

## Description
A small invented series for trying storyForge. Nothing in it is real.
`);

put("_story-library/novel-one.md", `---
book-id-reference: b-one1
book-title-reference: "Book #: The Harbour Wakes"
series-order-reference: 1
chapter-order:
  - ch-one-1.md
  - ch-one-2.md
  - ch-one-3.md
unplaced:
archive:
default-pov-path: Codex/Jane.md
default-pov-name: Jane
planned-novel-length: 30000
planned-chapter-length: 1500
chapters:
  ch-one-1.md:
    chapter-id: c-one-1
    chapter-title: "Chapter #"
    pov: "v1;Codex%2FJane.md=Jane"
    location: "v1;Codex%2FHarbour.md=Harbour"
    plot: Jane reaches the harbour at dawn.
  ch-one-2.md:
    chapter-id: c-one-2
    chapter-title: "Chapter #"
    pov: "v1;Codex%2FSam.md=Sam"
    plot: Sam waits for the tide.
  ch-one-3.md:
    chapter-id: c-one-3
    chapter-title: "Chapter #"
---
`);
for (const [i, n] of [[1, 3], [2, 5], [3, 4]]) put(`_story-library/one/ch-one-${i}.md`, para(n));

put("_story-library/novel-two.md", `---
book-id-reference: b-two2
book-title-reference: "Book #: The Long Night"
series-order-reference: 2
chapter-order:
  - ch-two-1.md
  - ch-two-2.md
unplaced:
archive:
default-pov-path: Codex/Zo%C3%AB%20%C3%85berg.md
default-pov-name: Zoë Åberg
planned-novel-length: 30000
planned-chapter-length: 1500
chapters:
  ch-two-1.md:
    chapter-id: c-two-1
    chapter-title: "Chapter #"
  ch-two-2.md:
    chapter-id: c-two-2
    chapter-title: "Chapter #"
---
`);
for (const i of [1, 2]) put(`_story-library/two/ch-two-${i}.md`, para(i + 6));

put("_backstage/storyforge/tag-registry.md", `---
codex-types:
  - id: "person"
    label: "Person"
    icon-alias: "person-fill"
  - id: "place"
    label: "Place"
    icon-alias: "location-pin"
chapter-tags:
novel-tags:
idea-types:
archive-types:
---
`);
put("_backstage/storyforge/codex.md", `---
folders:
  f-cast:
    name: Cast
    order:
      - Codex/Jane.md
      - Codex/Sam.md
      - Codex/Zoë Åberg.md
      - Codex/The Keeper of the Long Lantern Light.md
  f-places:
    name: Places
    order:
      - Codex/Harbour.md
order:
  - f-cast
  - f-places
archive:
  - Codex/Retired.md
types:
  Codex/Jane.md: person
  Codex/Sam.md: person
  Codex/Zoë Åberg.md: person
  Codex/The Keeper of the Long Lantern Light.md: person
  Codex/Harbour.md: place
---
`);
put("Codex/Jane.md", "---\naliases:\n  - Janey\n---\n\nJane is invented. She reaches the harbour at dawn.\n");
put("Codex/Sam.md", "---\naliases: Sammy\n---\n\nSam is invented too, and prefers to wait.\n");
put("Codex/Zoë Åberg.md", "---\naliases:\n  - Zoe\n---\n\nA name with accents, to check they survive the trip.\n");
put("Codex/The Keeper of the Long Lantern Light.md", "---\naliases: []\n---\n\nA long name, to see how it fits.\n");
put("Codex/Harbour.md", "---\naliases: []\n---\n\nThe harbour where the lanterns hang. Jane and [Sam](Sam.md) both know it.\n");
put("Codex/Retired.md", "---\naliases: []\n---\n\nAn archived note: try unarchiving it.\n");
console.log(`Sample project written to ${root}`);
