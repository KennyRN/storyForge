# The series page, round two: a survey (no build)

Written for Kenny and the next release's brief. Nothing here is built; the redesign goes into the next release with its own hold point. Read with `docs/novel-2.md` (the novel tab's chosen chapter, which this copies) and `docs/story-shape.md` (what the overviews may write).

## 1. What there is today

- **The left pane's series tab** (`faces/seriesTab.ts`): the series title row (inline rename, `writeSeriesTitle`), the placed and unplaced novels (drag to sequence, inline rename through `renameBookTitle`). A click on a novel calls `model.selectBook(folder)`: it sets `nav.book`, sets `nav.chapter` to that novel's first chapter, **switches the library side to the novel tab**, opens that chapter in the one chapter editor (`editors.open("centre", …)`, with the usual save first) and shows the novel overview.
- **The central pane** (`overviews/seriesOverview.ts`): the series title (`h2`, not editable here), the series cover and the description beside it, then a row per placed novel (its cover, title as a button, a plain word-count bar and its synopsis), then the unplaced novels.
- **The context panel on the series tab** is the ordinary one: a Codex note if one is open, otherwise blank. Only the novel tab has the chosen-chapter panel (`context/chapterContext.ts`, `showsChosenChapter`).

## 2. The redesign: the central pane always shows the series

- The central pane would be the series overview as it is, with the novels drawn as rows or cards of their cover, title and (read-only) bar; nothing in the pane would depend on which novel is chosen, so it never changes when a novel is chosen. It is `mountSeriesOverview` minus the per-row synopsis fields (they move to the context panel, §3), keeping the cover (`coverBox`), the title and the description (`descriptionField`).
- It stays a layer over the still-mounted chapter editor, `inert` while covered, exactly as the overviews are now.

## 3. The context panel shows a chosen novel

When the series tab is up, the context panel would show the chosen novel (`nav.book`), as `chapterContext.ts` shows the chosen chapter on the novel tab: a `showsChosenNovel(model)` beside `showsChosenChapter(model)`, one host (`sf-novel-context`), hiding the Codex-note host while it is shown. Top to bottom:

1. the novel's **cover** (`coverBox`), 2. its **title**, 3. its **default PoV** (the same Codex picker menu as the novel tab's left pane), 4. its **synopsis** (`synopsisField`, a card on bg0), 5. its **novel data bar** (the progress bar of `novelOverview.ts`: segments, dividers and the structure strip, read-only), 6. its **chapters as unlabelled data bars** (`dataBar` from `overviews/bars.ts` without the name: a `labelled: false` option that keeps the tooltip and the `aria-label`, so the bar is still a named control). A click on a chapter bar would be `chooseChapter` as on the novel tab, or nothing (Kenny's call: a bar with no label that also moves you is easy to hit by mistake).

## 4. What writes today, and how each would move without changing its writer

| Thing | Writer today | Where it is written from today | In the redesign |
|---|---|---|---|
| Series description | `commitDescription` (`core/fieldWriter.ts`), section `## Description`, compare-then-write, recovery under `recovery/_fields/` | `descriptionField` in the series overview | Unchanged: the central pane keeps `descriptionField`. |
| A novel's synopsis | `commitSynopsis`, section `## Synopsis`, same rules, `rescueSynopsis` | `synopsisField` in the series overview rows and the novel overview | Mounted in the context panel instead of the rows. The same `textField`/`FieldBin`, so the close route (`registerCloseCommit`), the compare-then-write and the recovery path are the ones already proved. Its host must register and clear as the chosen novel changes, as the plot note does (`commitFocusedFields` before the panel is rebuilt). |
| Default PoV | `writeDefaultPov(project, book, path, name)` (frontmatter `default-pov`) | the novel tab's left pane (`novelTab.ts`, `metaRow` with the Codex menu) | The context panel calls the same function from the same menu. |
| Covers | Rust `pick_cover` (only `ui/model.ts` calls it, an architecture test), `read_cover` (only `overviews/cover.ts`), then `writeBookCoverName` / `writeSeriesCoverName` in TypeScript | `coverBox` | The context panel reuses `coverBox` for the novel; no new Rust command. |
| Series title | `writeSeriesTitle`, inline rename in the left pane | `seriesTab.ts` | Unchanged (the central `h2` could become an inline rename later; not needed). |
| A novel's title | `renameBookTitle` | inline rename in the left pane | Unchanged; the context title is read-only. |
| Planned lengths | `writeBookPlanned*` through the shared `lengthFields.ts` | the novel tab's left pane | Not moved. |
| Novel data bar, chapter bars | read-only | the novel overview | Read-only in the panel too. |

Opening any of these writes nothing (a test compares the folder byte for byte, as for the other overviews). No writer changes; what changes is where the field editors are mounted and which host owns the close registration.

## 5. Things the redesign must keep or decide

- **The Codex note on the series tab is displaced** by the novel panel, as it is on the novel tab; opening a Codex note on the series tab would need the same rule as the novel tab has (it switches tab, or is refused).
- **Unlabelled bars and colour:** a bar's name is today its only label; unlabelled, the chapter's name is in the tooltip and `aria-label`. The rail and bar colours (round five) apply as they do everywhere.
- **Widths:** the series tab's side panels already have their own set (round five: `seriesWidths`); the context panel's width there would now be a real design input, not a leftover.
- **Chosen state:** `nav.book` is already shared by both sides; the redesign adds no new state if the chosen novel is `nav.book`.

## 6. For Kenny to decide: does choosing a novel also change the novel being written?

Today it does, and more: `selectBook` switches to the novel tab, sets `nav.chapter` to the first chapter and opens it in the one chapter editor. In the redesign the series tab should stay the series tab, so there are two ways:

- **A. Choosing a novel only chooses it for the panel** (a separate `nav.chosenNovel`). The storytelling side keeps its novel until the author asks to write that one (an explicit "Write this novel", or the novel tab's own list). Cost: a second piece of state, and two things called "the novel".
- **B. Choosing a novel changes `nav.book`, as choosing a chapter changes `nav.chapter`** (`chooseChapter` is the precedent: the one editor switches by the save-and-open route with `reveal: false`, no focus moves, the library side keeps its view). The storytelling side then follows: its navigator, its chapter list and its editor are that novel's. Cost: browsing the series changes what you will type into when you flip back; the first chapter is opened without a choice.

Recommendation: **B**, because the app already has one chosen novel and one chosen chapter shared by both sides (decision of Brief 14), and a second chosen novel would contradict it; make the opening of the first chapter silent (`reveal: false`) and keep the last chapter the author was in per novel (a machine setting) so choosing a novel and coming back does not lose their place. Kenny decides.

## 7. Hold points for the build

The close path (every field the panel mounts must register and rescue like the plot note), the disk-safety suite, `test:quit` with text typed in the synopsis in the panel, `test:cover`, and the sessions rules (switching the novel must not end or count a session: nothing is typed in the switch).
