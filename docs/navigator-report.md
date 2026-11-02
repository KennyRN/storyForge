# Brief 13: the navigator and Appearance, report

**Built app: 1.6.0, branch `navigator`** (not merged; `main` is v1.5.0). Commits from `main`: the survey, fonts, navigator, Appearance, defaults and spacing, the card, the key-posting safety work, the card's geometry (`79ffd63`), then this one.

## What was built
- Six embedded font families (Aleo, Atkinson Hyperlegible Next, Courier Prime, Fraunces, Inter, SN Pro), `core/fontFamilies.ts`, `Font Licences.md`, resources in `tauri.conf.json`.
- Settings ▸ Appearance: font, weight and size per part (Codex list, novel title, series name, selected chapter), Softness and Wonk for Fraunces; seven settings pages; Story page with `story-kind`.
- The rebuilt storytelling navigator (series and novel names open their library tabs, the chapter dropdown over the Codex card, "Add the next chapter" as a true append). The library side is unchanged.
- The Codex card, line height 1.1, both cards ending 12 px above the fixed 64 px stats section.
- Development tooling: every key posted to the test copy's process and checked before each key; a small C helper typing each character by the event itself.

## Tests
- `npm test` 1,646; `npm run build` clean.
- `npm run test:ui` in full: 402 passed, 1 skipped (the usual), 0 failed.
- Built app (1.5.0 build with the card, then rebuilt as 1.6.0): `test:look --shots`, `test:typing` and `test:fonts` pass (`test:typing` after the C helper; the shortcode popup that failed earlier was the test tool's wrong characters, not the app). `test:quit`, `test:cover` and `test:widths` were not re-run for this brief.
- New suites: `navigator`, `appearance`, `fonts`, `spacing` (WebKit), `fontFamilies`, `settings` and the typing guard's 21 unit tests.

## Screenshots (`docs/navigator-shots/`, `docs/navigator-shots/built/`)
Preview: current and new navigator, Appearance, Story. Built (the test copy's window only): chapter, Codex in each state, the navigator open and closed, the library side, the whole storytelling window with the readout off and on, the Óswyg row (an accented capital, descenders, three folders deep) focused.

## Findings
- **The "quit unexpectedly" reports** come from `SIGABRT` raised by the app after a script piped its stderr and went away first, not from the script's kill. Fixed in the scripts (`stdio: "ignore"`); the count of seven older reports did not change in any run of this brief.
- **Keys reaching the Desktop (decisions 89 to 92).** Keys sent to whatever app was in front reached it between the test copy's windows; Kenny's Desktop had two items selected, matching Finder's "launch 2 items". Nothing in the app opens files. With keys posted to the test copy's process and checked before each one, it no longer happens (controlled run: two items selected before and after, nothing but the test copy in front, nothing opened).
- **The Mac's layout is British.** A US key table typed `@` for `"` and a backslash for a backtick; keys now carry their character.
- **Keys posted to a process don't reset the Mac's idle timer**, so the screen locked mid-run; runs are wrapped in `caffeinate -u`.
- **Wonk** only reshapes a few letters (n, m, h) and only above about 28 px, so it is subtle at normal sizes.

## What happens today when `project.md` changes on disk while the app is open (read-only, from the code; not changed)
- **Does the app ever pick up the change? No, not while it is open.** `loadSettings` is called once, when a project opens (`app/appLife.ts`); the watcher's batch (`applyBatch.ts`) has no step that re-reads settings. The window keeps the values it loaded. A built-app run confirmed it: rewriting `project.md` with `show-session-readout: true` while the app was open changed nothing on screen. It is read again at the next open.
- **If the author then changes a setting:** `setSetting` writes through `modifyFrontmatter`, which **re-reads the file from disk inside the write** and changes only that one key's lines. So:
  - an outside change to a **different** key is **kept** on disk (not written over, not a conflict); the window still shows the old value of that key until the project is reopened;
  - an outside change to the **same** key is **written over** by the author's value; there is no conflict notice;
  - if the author sets a value equal to what the window believes, `setSetting` sees "unchanged" against its own copy and **writes nothing**, so a different outside value stays on disk and takes effect at the next open;
  - if the outside edit left `project.md` unreadable (bad YAML), the write is refused, as for any unreadable frontmatter.

## Holds
H1 and H2 (decisions 81 to 84), then the hold on Mac runs (decision 89, lifted by decision 92).

## Kenny's check (Brief 13 §5)
Waived for now (decision 94); to come back to.
