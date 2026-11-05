# Brief 16: the project cards (decision 121)

H1: the survey and a mock-up. Read only; nothing in `src/` or `src-tauri/` has changed. Branch `project-cards`, cut from `main` at `v1.8.0` for the survey (the build branch is cut after `v1.8.2`, as the work order says). Mock-up pictures: `docs/project-cards-mockups/` (`mockup.html` is a throwaway page that borrows the app's theme; it is not app code).

## 1. The first novel's title and cover

- **Where things are recorded.**
  - Series: `_story-library/series.md` has `series-title`, `order` (book folder names), `books:` (a map of folder name to `book-id`, `book-title`, `book-color`) and `cover-image`. The series cover file is `_backstage/storyforge/_series/cover.<ext>`.
  - A book: its title is `books.<folder>.book-title` in `series.md` (and `book-title-reference` in its own file, `_story-library/novel-<folder>.md`); its `cover-image` is in that novel file; its cover file is `_backstage/storyforge/<folder>/cover.<ext>`.
  - Kind: `story-kind` in `_backstage/storyforge/project.md` (`series` default, or `standalone`).
- **How `peek_recent` finds the first book without the window naming a folder.** The first book is `order[0]`. Rust has **no YAML parser** (the fs crate has no such dependency, and Brief 16 adds none), so there are two ways to take `order[0]`:
  - **A. A small strict line reader in Rust** (recommended): find the `order:` key, take the first `- value` line under it (quotes stripped), accept only a plain folder name that passes `cover_folder`'s own check (`resolve_path`, no slashes, not `_series`, and the folder must exist). Anything else (flow style `order: [a, b]`, odd indentation, a duplicate key) gives no first novel, and the card falls back to the series cover, then the series title, then the folder's name. Never a failure. Rust tests would cover each shape.
  - **B. Window parses, Rust is asked twice:** the window reads `order[0]` from the returned `series.md` with `readFrontmatter` and calls `peek_recent(index, { book: 0 })`, "the first entry of `order`", and Rust still needs to find it, so this does not remove the reader.
  - Either way the window never sends a folder name or path.
- **What `peek_recent` returns,** all from `Project::open(root, true)` (which only canonicalises the folder and checks it is one: no lock, no write, no session): `exists`, `hasLibrary` (is `_story-library` a folder), the text of `project.md` and `series.md`, and, when a first novel is found, the text of its novel file (for `book-title-reference` and `cover-image`) plus **at most one cover**: the series cover if `series.md`'s `cover-image` names a file that reads, else the first novel's, using `read_cover`'s exact `cover.<ext>` name check and 10 MB limit (returned as base64 with its extension). The window parses the texts with `readFrontmatter` and the core's `safeCoverFilename`.
- **The name** on a card: series project, `series-title`; standalone, the first book's title (`books.<folder>.book-title`, else `book-title-reference`); empty or unreadable, the folder's name.

## 2. The `remember` fix

- **Where it is today.** `AppState::open` (`src-tauri/src/lib.rs`) runs `Project::open_checked` and then `remember`. `open_checked` only checks the folder exists and decides read-only; it does not look for `_story-library`. The project check is the TypeScript core's (`openProject`: `LegacyLayoutError` from `Project.open`, `NotAProjectError` when `_story-library` is not a folder), which runs afterwards in `attach`. So a refused folder is already on the list by then, as the brief says.
- **The complication.** New Project is `pick_project("create")` on an **empty** folder, then `createProject`, then `openProject`. A Rust-side "has `_story-library`" check would leave every new project off the list.
- **Proposed fix: `remember` moves out of `open`, to the moment `attach` succeeds.** A new command, `remember_project`, takes **no arguments** and records the root of the project Rust already holds (so decision 24 holds: no path comes from the window). It writes only `recent.json`, like `forget_recent` and `clear_recent`, so it falls under the same amendment of `AGENTS.md`'s command rule. The window calls it once, at the end of `attach`, after `openProject` returned and settings loaded.
- **Every open route:** the picker (`pick_project`, open), a recent entry (`open_recent`), and New Project (`pick_project` create) all go through `attach`, so all three record a real project, and none of the refused cases (`NotAProjectError`, `LegacyLayoutError`, a throw) reach the call. A newer-format project (read-only) opens successfully, so it is recorded.
- **Two details to keep.** (1) `openDialog`'s cancel path calls `open_recent(0)` to return to the project that was open: unchanged, since that project is still first. (2) `open_recent(index)` no longer moves the entry to the front when Rust opens it, only when the open succeeds; a folder that fails stays where it was.
- **Alternative with no extra command:** Rust remembers when the window next calls `watch_start`. Not recommended: read-only projects never call it, and it hides a write inside an unrelated command.

## 3. The Open Recent menu's name

Rust builds the menu from `recent.json` and labels each item with the folder's name. To show the card's name it would have to read `series.md` for every entry on every menu rebuild, on the main thread, from possibly offline drives. Not recommended.
**Proposal:** a small command, `set_recent_names(names)` (the window sends the names it already worked out for the cards, by index; Rust keeps them in memory and uses them for the labels, folder name until it has one). It touches only the app's own menu items, which the rule already allows. Cost: one small command, plus the menu showing folder names until the cards' details have arrived. If Kenny prefers no extra command, the menu keeps the folder's name.

## 4. Speed

- `peek_recent` does not exist yet, so **nothing was measured**; this is the design. Each peek reads at most `project.md`, `series.md`, one novel file and one image, so on a local drive it is a few milliseconds plus the image; ten of them are well under a second. The preview's own server answers file reads instantly and would say nothing about an offline drive, so I will measure the real app on a fixture with an artificial delay when the command exists.
- **Not holding the screen up:**
  - the start screen draws every card at once from `recent_projects` (names from the folder, image places empty);
  - each card makes its own peek, in parallel and independently, and fills itself in when its answer arrives (a card is never waited on by another);
  - Rust runs each peek on a blocking worker (as the other commands do), so a hung network drive stalls only its own worker;
  - the window stops waiting for a peek after 5 seconds: the card stays as drawn (folder's name, no image, clickable) and the answer is used if it arrives later. A slow folder is never shown as "Not found"; only a real "does not exist" answer is.
  - Peeks are cancelled by ignoring their answer if the start screen has been left.

## 5. Removing by keyboard

Cards are buttons in a grid (arrows move, Return opens). Proposal for "Remove from List":
- **Shift-F10 or Control-Return on a focused card opens its context menu** (Remove from List, the only item), which then follows the menu rules (arrows, Return, Escape; decision 110). Nothing else on the card changes.
- **Delete (Backspace) on a focused card removes it directly,** as Finder's sidebar and most Mac lists do, with no confirmation (it removes only the entry), and focus moves to the next card.
- Question for Kenny: both, or only the menu? Recommended: both.

## 6. Mock-up

All in `docs/project-cards-mockups/`. The stand-in "no cover" icon is a plain photo outline in `grey0`; the real one is Kenny's (H2). The cards are `bg0` on a `bg_dim` screen, 10 px corners, no border, the image on top (3:4), the name, and the path in `grey2` under it, all from the app's own theme file.

| What | File |
|---|---|
| one, three and ten cards, default window (1200 x 800) | `one-card-1200x800.png`, `three-cards-1200x800.png`, `ten-cards-1200x800.png` |
| the same at the smallest window (640 x 400) | `one-card-640x400.png`, `three-cards-640x400.png`, `ten-cards-640x400.png` |
| a series cover, a first-novel cover, no cover | in every picture (cards 1, 2 and 3) |
| image cropped to fill, or fitted whole (a wide image shows the difference) | `fit-cropped-1200x800.png`, `fit-whole-1200x800.png` |
| a long name and a long path | `long-name-path-1200x800.png` |
| "Not found" and "Not a project" | `states-1200x800.png` |
| hover (green edge) and the context menu | `hover-1200x800.png`, `menu-1200x800.png` |

Notes from the pictures:
- At 1200 wide five cards fit a row; ten cards are two rows, so the list needs to scroll vertically at the default height (the second row's names are at the very bottom edge). At 640 x 400 two cards fit a row and the list scrolls.
- **Hover:** a 2 px green border (the card's own space is reserved, so nothing moves). A green fill would hide the image's edge; the border is the proposal.
- **Dimmed cards** are at half strength with the state's words in full text colour so they stay readable (the state is words, not colour).
- **Crop or fit:** cropping fills the frame but loses the edges of a cover whose shape differs from 3:4; fitting shows the whole cover with bars of `bg_dim` beside or above a wide one. Recommended: **crop to fill** (a book cover is usually close to 3:4, and every card stays one shape, which is what the brief asks); Kenny rules.

## 7. Questions for Kenny

1. **The first book from `order`:** a strict line reader in Rust (A, recommended), or something else?
2. **The `remember` fix:** the argument-less `remember_project` called when `attach` succeeds (recommended), under the same amendment as forget and clear?
3. **The Open Recent menu's name:** `set_recent_names` (recommended), or keep the folder's name?
4. **Keyboard removal:** Shift-F10 / Control-Return for the menu plus Delete to remove (recommended), or the menu only?
5. **Image:** crop to fill (recommended), or fit whole?
6. **Hover:** green border (recommended), or green fill?
7. **The no-cover icon (H2):** please send it; I build with the stand-in until it arrives.
