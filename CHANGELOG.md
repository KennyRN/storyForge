# Changelog

## 0.17.0

- Continuous mode is a real manuscript editor: the whole book as one document you can write straight through, saved per chapter (only chapters you change), with the depth guide at every chapter start, the cycling guide across the book, prose dressing and emphasis keys, and new chapters from inside the manuscript. Read-only on mobile.
- Series overview: word-count bars on placed novel cards, kept up to date as chapters and novels change.
- Novel overview and Story Context's Novel tab: three-tier chapter cards with the data bar as the button; hover for word count and description.
- Story Context: the Notebook opens on the Codex first, notes can be renamed, new dossier prompt; Codex dropped from the Chapter tab; re-clicking an open codex page closes it. "Recommend" renamed to Story Context throughout, with settings migrated (the command id changed, so a hotkey on it must be set again).
- Codex notes are no longer scoped to a single book; old `book:` keys are left in place but ignored.
- Sliding ink indicator on the Notebook and Archive source rails, the Codex `#tag` rails and the continuous-mode toggle; redesigned project pane; name-only novel title modal with inline series dice.
- Command "Open storyforge" renamed "Open story library" (same id, existing hotkeys keep working).
- storyForge no longer contains any file-delete call: the Codex ghost eviction (which never succeeded on a real ghost) is gone.
- Community-scanner clean-up: inline styles through `setCssStyles`, window-scoped timers and DOM helpers, no `:has` or `!important` in the stylesheet, typed narrowing in place of `any`, titleForge's command-line tools moved to `tools/titleforge/` as `.mjs`.
- titleForge: title-composer and japanese-ln no longer reproduce real titles (a guard built from their corpora, exemplars and a list of translated classics); plurals and verb agreement fixed ("Centuries", not "Centurys"; "Where the Wolves Rise").
- titleForge: thin word lists expanded across every lexicon (webnovel additions harvested from the frozen corpus); pools of three words or fewer down from 455 to 6, all deliberate. Decades and ordinals now title-case correctly ("1980s", not "1980S").
- titleForge: character names in titles are invented (nameForge's Markov model, seven title-composer registers plus a webnovel hero register) instead of real or scraped names; writers can point any register at their own nameForge pack in titleForge settings.
- titleForge: vocabulary is additive across every lexicon — a genre's own words join its parent's lexicon (words in 2+ of its subgenres) and a general list (words spanning 2+ genres) instead of replacing them; thin pools down from 1,075 to 347 in title-composer, isekai roles 2 → 17.
- western-serial: webnovel v1.2.0 — genre tree (progression × 10, isekai × 2), 9 new patterns, 2 retired, collision guard.
