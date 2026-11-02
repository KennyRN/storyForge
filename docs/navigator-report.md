# Brief 13: the navigator and Appearance, report

**Built app: 1.6.0, branch `navigator`** (not merged; `main` is v1.5.0). Commits from `main`: the survey, fonts, navigator, Appearance, defaults and spacing, the card, the key-posting safety work, the card's geometry (`79ffd63`), then this one.

## What was built
- Six embedded font families (Aleo, Atkinson Hyperlegible Next, Courier Prime, Fraunces, Inter, SN Pro), `core/fontFamilies.ts`, `Font Licences.md`, resources in `tauri.conf.json`.
- Settings ▸ Appearance: font, weight and size per part (Codex list, novel title, series name, selected chapter), Softness and Wonk for Fraunces; seven settings pages; Story page with `story-kind`.
- The rebuilt storytelling navigator (series and novel names open their library tabs, the chapter dropdown over the Codex card, "Add the next chapter" as a true append). The library side is unchanged.
- The Codex card, line height 1.1, both cards ending 12 px above the fixed 64 px stats section.
- Development tooling: every key posted to the test copy's process and checked before each key; a small C helper typing each character by the event itself.

## The fonts as built
All six are the SIL Open Font License 1.1, shipped unmodified (Fraunces as the supplied `.woff2`, the rest as supplied; only Fraunces' file names were shortened, as the supplied ones contain brackets). Licences are beside the files and shipped in the app's Resources (`OFL-<family>.txt`); notices in `Font Licences.md`. Loaded from the app only (`font-src 'self'`).

| Family | Files as built (bytes) | Axes (min / default / max) | Real italic | `ƿ Ƿ ȝ Ȝ` |
|---|---|---|---|---|
| Aleo | `Aleo-Variable.ttf` 146,636; `-VariableItalic.ttf` 152,620 | wght 100 / 400 / 900 | own file | Arial |
| Atkinson Hyperlegible Next | `…-Variable.ttf` 113,948; `-VariableItalic.ttf` 123,148 | wght 200 / 400 / 800 | own file | Arial |
| Courier Prime | Regular 68,304; Bold 69,944; Italic 76,656; Bold Italic 77,544 (static) | none (400 and 700 only) | own files | Arial |
| Fraunces | `Fraunces-Variable.woff2` 195,068; `-VariableItalic.woff2` 235,736 | opsz 9 / 9 / 144, SOFT 0 / 0 / 100, wght 100 / 900 / 900, WONK 0 / 1 / 1 | own file | Arial |
| Inter | `InterVariable.ttf` 879,708; `-Italic.ttf` 910,252 | opsz 14 / 14 / 32, wght 100 / 400 / 900 | own file | has them |
| SN Pro | `SNPro-Variable{Regular,Italic}.woff2` 108,624; 117,248 | wght 200–900 | own file | Arial |

- **Added to the app:** about 3.0 MB (Inter 1.79 MB of it).
- **Coverage:** all six have the typing aids' characters, `æ Æ œ Œ ð Ð þ Þ`, and the fixtures' accented letters. Wynn and yogh (`ƿ Ƿ ȝ Ȝ`, also `ǣ ǭ ſ`) are missing from all but Inter and go to Arial (real italic and bold). Atkinson has the least Latin Extended coverage; those characters go to Arial in a different design. Japanese is in none: the system font draws it, as before.
- **Fraunces:** its file defaults to weight 900 and Wonk 1, so every use sets weight, `SOFT` and `WONK` explicitly. Optical size follows the text size on Fraunces and Inter automatically (no control).
- **Ligatures and alternates** are off on every use (`font-variant-ligatures: none`, `liga`, `calt`, `dlig`, `ss01` zero), font synthesis off.

## The Appearance keys, as written to `project.md`
Only a changed key is written; an unknown or out-of-range value reads as the default and is never rewritten. For each part `codex`, `novel`, `series` and `chapter`:

```
appearance-codex-font: Atkinson Hyperlegible Next   # one of the six family names
appearance-codex-weight: 400                        # a weight the family has
appearance-codex-size: 1                            # rem; rounded to 0.125; ranges below
appearance-codex-soft: 0                            # Fraunces only, 0 to 100 (whole numbers)
appearance-codex-wonk: false                        # Fraunces only, true or false
story-kind: standalone                              # series (default) or standalone
```
Size ranges: Codex list and selected chapter 0.75–1.75 rem; novel title and series name 0.75–2 rem. A rem is drawn as 16 px.

## Kenny's defaults, as set (decision 84)
| Part | Font | Weight | Size |
|---|---|---|---|
| Codex list | Atkinson Hyperlegible Next | 400 | 1 rem |
| Novel title | Inter | 900 | 1 rem |
| Series name | Inter | 600 | 0.75 rem |
| Selected chapter | SN Pro | 300 | 1.375 rem |

Softness 0 and Wonk off for every part. Nothing is written to `project.md` until a setting is changed.

## Tests
- `npm test` 1,646; `npm run build` clean.
- `npm run test:ui` in full, after the icons: 404 passed, 1 skipped (the usual), 0 failed (the run before it had one race in the navigator test, which read a style before it was applied; it now waits, and passed 40 of 40 repeats).
- **Built app 1.6.0, branch `navigator`, through the typing guard, each under `caffeinate -u`:** `test:quit` 10 of 10 routes; `test:look`, `test:typing` and `test:fonts` pass. (The shortcode popup that failed in an earlier `test:typing` was the test tool's wrong characters, not the app.) Crash reports stayed at 7. `test:cover` and `test:widths` were not re-run for this brief.
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
- **H1 (decision 81):** the survey's seven questions (header, "Add the next chapter", the selected chapter's colour, font file formats, Fraunces' axes, coverage, series or standalone). Resolved by Kenny's rulings, recorded in `docs/navigator.md` §11.
- **H2 (commit 4, decision 83 to 84):** the defaults. Stopped for Kenny to choose in the built app; set as in the table above, with "Current look" removed and rem drawn as 16 px.
- **The hold on Mac runs (decision 89):** keys sent to whatever app was in front reached Kenny's Desktop between the test copy's windows. Stopped every built-app run; found the cause (keys sent to the frontmost app, not the test copy), moved every fixture off the Desktop, and made the scripts post keys to the test copy's process with a check before each key (decisions 90 and 91, unit-tested), then one controlled run (decision 92), which lifted it.
- No other hold in the brief's list was hit (no YAML construct that couldn't be rewritten minimally, no behaviour change in a kept module).

## Built-app screenshots (§5), `docs/navigator-shots/built/`, the test copy's window only
`chapter`, `chapter-30em`, `codex-storytelling-no-note`, `codex-note-in-context-panel`, `codex-note-in-workspace`, `codex-selected-and-focused`, `codex-accent-descender-focused`, `codex-library`, `navigator-closed`, `navigator-open`, `plot-note`, `strip-focused`, `storytelling-readout-off`, `storytelling-readout-on`. The stats section with the readout on (no session, during a session, paused) is in `docs/navigator-shots/built/stats-*.png`.

## Kenny's check (Brief 13 §5)
Waived for now (decision 94); to come back to.
