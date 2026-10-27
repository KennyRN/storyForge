# Typing aids (Brief 9): design

Status: **for H1 review.** Nothing is implemented. Branch `typing`, from `main` at `5b071bc` (0.12.0), tagged `v0.12.0`; the `shape` branch is deleted (it was never pushed, so there was nothing to remove on GitHub).

**Two findings need Kenny's ruling before anything is built** (§1.2 and §1.1). The rest is design for review.

## 1. The survey (Brief 9 §0)

### 1.1 The word counter

`countWords` strips frontmatter and `%% %% ` comments, then counts runs of non-whitespace (`/\S+/g`). Run on the cases in the brief, curly and straight:

| Straight | Words | Curly / dashed | Words |
|---|---|---|---|
| `don't` | 1 | `don’t` | 1 |
| `'tis` | 1 | `’tis` | 1 |
| `rock 'n' roll` | 3 | `rock ’n’ roll` | 3 |
| `word--word` | **1** | `word—word` | **1** |
| `word - word` | 3 | `word – word` | 3 |
| `wait...` | 1 | `wait…` | 1 |
| `wait...what` | 1 | `wait…what` | 1 |
| `1990-95` | 1 | `1990–95` | 1 |

**No aid changes any count.** Every conversion maps a run of non-space characters to a run of non-space characters, and the spaced en dash replaces a spaced hyphen, which is already its own "word". So the counter needs no change and this is not a hold.

**One statement in decision 37 doesn't match the counter.** It says an unspaced dash between two words "still counts as two words". Today `word--word` and `word—word` both count as **one**. Making them count as two would change the counter, and with it the count and history of every chapter already written. **Proposed ruling:** leave the counter alone, and read decision 37's sentence as "the count doesn't change because of the aid", which is true. (Question 1.)

### 1.2 What macOS does in the built app's editor: it acts, today

Tested in the built 0.12.0 app with real keystrokes (System Events), a fixture copy, and the editor's own content read back through accessibility. Nothing was typed into a real project.

Typed: `'Don't say "never" - not yet,' she said. Well--then... omw aelfric 'tis 'em' 90's`

Result, **with no aid of ours existing yet**:

`‘Don’t say “never” - not yet,’ she said. Well—then… On my way! aelfric ’tis ‘em’ 90’s`

So the Mac's own substitutions already run inside the editor: smart quotes (including `’tis` and `‘em’` by its own rules), `--` to an em dash, `...` to an ellipsis, **and the author's own Text Replacements** (`omw` became "On my way!", from this Mac's System Settings). It does not make an en dash from a spaced hyphen, does not touch `aelfric`, and the Edit menu has no Substitutions submenu to switch it off.

**They also act inside text that must never change** (decision 37, Brief 9 §1.3). Typed `[[it's]] `don't` %% 'x' -- y %% https://a.b/it's -- end` came out as `[[it’s]] `don’t` %% ‘x’ — y %% https://a.b/it's — end`. A curled apostrophe in a link breaks it. **This is a bug in 0.12.0 today, independent of the aids,** and it would also make every aid act twice.

The editor already sets `autocorrect="off"` and `autocapitalize="off"`; those attributes do not stop these substitutions.

**Can they be switched off cleanly? Yes, for this app only.** WebKit reads three per-application defaults. Passed as launch arguments (so nothing on the Mac was written), same typing:

| Arguments | Quotes | `--` and `...` | `omw` (Text Replacement) |
|---|---|---|---|
| none | curled | converted | **replaced** |
| `-NSAutomatic{Quote,Dash,TextReplacement}SubstitutionEnabled NO` | straight | straight | **still replaced** |
| `-WebAutomaticQuoteSubstitutionEnabled NO -WebAutomaticDashSubstitutionEnabled NO -WebAutomaticTextReplacementEnabled NO` | straight | straight | straight |

The three `Web…` keys do all of it. **Proposed:** register those three defaults as `NO` at start-up, in `platform.rs` (macOS-only code, which is where it belongs: Brief 4), using `registerDefaults` on this app's own defaults domain. That:
- changes nothing in System Settings, other apps, or the author's Text Replacements;
- leaves spellchecking alone (it's a different key, `WebContinuousSpellCheckingEnabled`; to be confirmed in the built app at commit 3, with the red underline still appearing);
- uses `objc2`, already a dependency, with no new crate; and has a safe fallback (if it fails, a warning is logged and today's behaviour remains);
- is not a hold (§8 of the brief): the substitutions *can* be cleanly turned off.

**The cost, and the choice it forces:** the Mac's smart quotes, dashes and Text Replacements would stop working in the manuscript editor **whether or not the author's smart-punctuation switch is on**. With the switch off, straight quotes stay straight. The alternative (leave the Mac's on when the switch is off) means the app can't promise that links and code stay untouched, and the aids can act twice. **Recommended:** always off in the editor, and say so in the Typing settings group. (Question 2.)

### 1.3 CodeMirror and the editor's input handling

- **In the build:** `@codemirror/commands`, `search`, `state` and `view`. **`@codemirror/autocomplete` is not in the build.** The shortcode popup is therefore designed with `@codemirror/view`'s own tooltip (`showTooltip`) and a keymap, with no new dependency (§5). If Kenny would rather add `@codemirror/autocomplete`, that needs an H1 ruling. (Question 3.)
- **Origins (decision 35):** `originOf` maps CodeMirror user events to `type`, `paste`, `drop`, `cut`, `undo`, `redo`, `delete`, `other`, with anything unnamed under `input` counted as typing. An aid's own transaction will carry the user event `input.type.aid`, which `isUserEvent("input")` matches, so the session tracker sees an aid's change as **typing** and the paste rule (more than 30 words) can never be triggered by one.
- **Undo steps:** `@codemirror/commands` exports `isolateHistory`. A transaction annotated `isolateHistory.of("full")` is its own history event, never merged with the typing before or after it. That is the mechanism for "one ⌘Z gives back exactly what was typed" (§2). It changes nothing about undo elsewhere, so this is not the "can't be its own undo step" hold.
- **Covered and read-only editors** already refuse input (`beforeinput` guard, `EditorView.editable.of(false)`); an aid never runs there because it only runs from the typing hook.

### 1.4 The Edit menu

`Edit` already has Undo, Redo, Cut, Copy, Paste, Select All, Find…, Find and Replace…, **Writing Tools, AutoFill, Start Dictation… and Emoji & Symbols**. macOS adds the last three itself to a menu called Edit. So **the Edit menu item the brief asks for already exists**; there is nothing to add, and nothing in `lib.rs` changes. (It inserts through the web view as ordinary input.)

## 2. How the aids hook into the editor

**One CodeMirror extension, `typingAids`,** built from pure functions (§3). It acts only from `EditorView.inputHandler`, which CodeMirror calls for text typed at the keyboard.

- **What counts as typing:** a single character (or a short run from a keyboard, not from an IME or dictation) inserted by `inputHandler`, with `view.composing` false and `view.compositionStarted` false. Paste, drop, cut, undo, redo, reloads from disk (`fromWriter`), IME composition, dictation and the Emoji & Symbols viewer never reach an aid.
- **How a change becomes its own undo step:** the handler first dispatches the typed character as an ordinary transaction (`userEvent: "input.type"`), then asks the pure function what the aid wants, and dispatches **a second transaction** with `userEvent: "input.type.aid"` and `isolateHistory.of("full")`. ⌘Z undoes only the second; the typed character remains straight. The next ⌘Z undoes the typing; ⇧⌘Z redoes the aid. Selection and the caret end where the author expects (after the converted character).
- **"Right now" (Brief 9 §1.1):** a StateField, `typedRun`, records the span of characters typed in the current unbroken run. It is cleared by any selection change that isn't a typed character, by every non-typing change, and by a reload. An aid that looks backwards (the word just finished, a multi-word name, `--`) may only change text **inside** `typedRun`. So putting the caret after an old word and typing a space corrects nothing.
- **Order within one keystroke:** smart punctuation, then name autocorrect, then the shortcode popup update. At most one aid change per keystroke, each its own undo step.
- **Undoing a correction never re-triggers it:** an aid fires only from a typed character, never from the state after an undo.
- **Switches:** each aid is a facet-driven setting read from the project's settings; turning one off removes it from the extension immediately (settings change reconfigures the compartment).

## 3. Protected text (Brief 9 §1.3)

A pure function, `protectedRanges(text)`, scans one paragraph (the line group around the caret, up to the previous blank line, and the fenced-code state from the document start) and returns ranges where **no aid acts and the popup doesn't open**:

| Protected | Recognised as |
|---|---|
| `[[links]]`, `![[embeds]]` | `[[` to the next `]]` on the line, including alias and anchor |
| Markdown link targets | the `(...)` straight after a `](` |
| Bare URLs | `https?://` to the next whitespace |
| Inline code | a backtick run to the next run of the same length (as the dressing's `skipCodeSpan`) |
| Fenced code | lines between ``` or `~~~` fences |
| `%% comments %%` | `%%` to the next `%%`, which may span lines |
| Table separator rows | a line made only of `|`, `-`, `:` and spaces |
| `~~strikethrough~~` | for shortcodes only |
| A list marker | a `-` or `*` that is the first non-space character of a line, for dashes only |

An **unclosed** `[[`, backtick or `%%` while typing protects from its opener to the caret, so the first characters of a link can't be curled before it's closed. **Indented lines are not code** (decision 22: fiction is often indented with tabs or spaces, and the app treats it as prose), so 4-space and tab-indented text gets the aids. The scanner is shared with the dressing's `%%` handling where it can be.

## 4. The rules

### 4.1 Quotes (smart punctuation, §2.1 of the brief)

`prev` is the character before the one typed (or the line start).

| Typed | `prev` | Result | Example |
|---|---|---|---|
| `"` | line start, space, `(` `[` `{`, `—` `–`, `‘` | `“` | `“Hello` |
| `"` | anything else | `”` | `go”` |
| `'` | a letter or digit | `’` | `don’t`, `Ælfric’s` |
| `'` | `‘` | `’` (apostrophe after an opening quote) | `‘’Tis` |
| `'` | `“` | `‘` (nested speech) | `“‘Yes` |
| `'` | line start, space, `(` `[` `{`, `—` `–` | `‘` | `‘Hello` |
| `'` | `.` `,` `!` `?` `…` `;` `:` `”` `’` `)` | `’` | `said.’` |

- **Apostrophe before a digit:** typing a digit right after a `‘` that starts a word replaces that `‘` with `’`, as its own undo step (`’90s`). A `‘` that starts a word means its `prev` is a boundary.
- **Elisions:** when a word that began with `‘` is finished, and its lower-cased text is on the project's elision list, that `‘` becomes `’` (own undo step). **Not if the word is finished by a quote mark**: `‘em’` is a quoted word and stays. Finishing means a space or punctuation other than `'`, `’`, `-`.
- **Starting elision list (editable):** `tis`, `twas`, `twere`, `twill`, `twould`, `em`, `til`, `cause`. **`cause` is the one that can also start ordinary speech** (‘Cause and effect,’ she said); it is in the list because Kenny named it, and the doc flags it. **`em` has a similar risk** (‘Em’ as a name). Both are removable.
- Straight and curly input are accepted: typing `’` or `‘` directly (a US keyboard can't, a British one can) is left as typed.

### 4.2 Dashes and ellipsis

| Typed | Condition | Result |
|---|---|---|
| second space of ` - ` | not a list marker (only whitespace before the `-`), and the word before is not a number | ` – ` (en dash) |
| any character after `--` | the `--` is exactly two hyphens, not part of `---` or a longer run; the line isn't only hyphens; not a table separator | `—` (em dash), the typed character stays after it |
| third `.` | the three dots are exactly three, with no `.` before | `…` |
| fourth `.` after a `…` | | a full stop, left as typed |
| a single `-` | always | untouched, so are number ranges (`1990-95`) |

`---` and a line of hyphens are never touched, so a horizontal rule and YAML fences stay as typed. **The "not between two numbers" rule** can only look left when the second space is typed (the right-hand number isn't typed yet), so it reads "the word before the hyphen is a number". `5 - 3` stays; `Chapter 5 - the storm` also stays, which is the cost of not looking ahead. (Question 6.)

## 5. Name autocorrect (§2.2)

- **Names:** every Codex note's title (archived ones too), each note's `aliases:` frontmatter (read only, through the existing reader; the app never writes it), and the project word list. The set is rebuilt when the Codex index changes.
- **A word** is a maximal run of letters, marks and digits, with `'` `’` or `-` allowed **between** letters (so `Mary-Anne`, `Ælfric’s` are single words). A word is **finished** by the typed character after it: whitespace or punctuation that isn't part of a word.
- **The word must lie inside `typedRun`** (§2), and **not directly after a `~`** (a shortcode in progress).
- **Folding** (applied to both the typed word and each name): lowercase; strip combining marks after NFD; then the table below. A name can have more than one fold key where a letter has two plausible spellings.

| Letter | Fold keys | Note |
|---|---|---|
| `æ` `Æ` | `ae` | |
| `œ` `Œ` | `oe` | |
| `ð` `Ð` | `th` **and** `d` | two keys, so `Aelfric`-style names with `ð` match either spelling (Question 4) |
| `þ` `Þ` | `th` | |
| `ƿ` `Ƿ` | `w` | wynn |
| `ȝ` `Ȝ` | `g`, `y` **and** `gh` | yogh (Question 4) |
| `ß` | `ss` | |
| accented letters | the base letter | `Zoë`→`zoe`, `Åberg`→`aberg` |
| `’` | `'` | |

- **Match:** the typed word's key must equal **exactly one** name's key (a name with two keys counts once). If two different names share a key, the key is **ambiguous and nothing is changed**. If the typed word is already spelt exactly as the matching name, nothing is changed.
- **Possessive:** if the word ends in `'s` or `’s` and the whole word has no match but the stem does, the stem is corrected and the possessive kept, with its apostrophe curled when smart punctuation is on (`Aelfric's` becomes `Ælfric’s`).
- **Lazy lowercase** is corrected (decision 37). **Opt-outs:** an opted-out name is never put in place of an **all-lowercase** typed word (`the red blossom fell` stays), but is still corrected when typed with any capital (`Red blossom`).
- **Multi-word names** (`Red Blossom`): when a word is finished, look for names whose **last** token matches it; for each, the preceding tokens, separated by single spaces and **all inside `typedRun`**, must match the name's earlier tokens by folding. The look-back is at most the name's token count. **The longest match wins**; the usual ambiguity rule applies; the whole phrase is replaced as one undo step.
- **The opt-out offer:** when the author undoes a **lowercase** correction (the next ⌘Z after it), a small notice, dismissing itself after a few seconds, offers "Stop correcting <name>?". Accepting adds it to the opt-out list in `project.md`. It is not a sticky notice (those are for the author's words).
- **No fuzzy matching, no suggestions during ordinary typing** (not in this brief).

## 6. Shortcodes (§2.3)

- **Trigger:** a `~` typed at the start of a word (previous character is line start, whitespace or opening punctuation), outside protected text, with the switch on. `~~` (a second `~` immediately) and `~` followed by a digit or space never open it, and nor does a `~` inside `~~strikethrough~~`.
- **The popup** is a `@codemirror/view` tooltip at the caret, listing matches for the letters typed so far: **the author's codes first** (by case-insensitive prefix), then, if the Codex-names switch is on, **Codex names whose fold key starts with the letters**, labelled by type. Up to 8 shown.
- **Keys** (a high-precedence keymap active only while the popup is open): **Tab** accepts the highlighted entry; **Escape** dismisses; **Up/Down** move; **Return is never captured**, so it always makes a new paragraph; every other key carries on typing and narrows or closes the popup. **Tab with no popup** does whatever it does today.
- **Accepting** replaces `~` and the letters with the full text (a code's text, or a name's proper spelling), as one undo step with `userEvent: "input.type.aid"`. Name autocorrect does not then fire on it.
- **Declining** (any other key, a space, a quote) leaves the code as typed.
- **The popup is `aria-live`-announced** as a listbox, reachable only through the keys above while it's open.

## 7. The special-characters button (§2.4)

- **Where:** bottom-right corner of the context panel **only while it is blank**; absent if the context panel is hidden. Absent too when the switch is off. The Edit menu's Emoji & Symbols item (§1.4) needs nothing.
- **Behaviour:** a `<button aria-haspopup>` opens a small palette (a popover, not a dialog) of the project's characters. **The button and the palette take `mousedown` without moving focus** (`preventDefault`), so the chapter keeps its selection and caret while the palette is open. Clicking a character (or pressing Return on it) asks the editor host to **insert at the centre chapter's current selection, replacing it**, as ordinary typing (`userEvent: "input.type"`), then moves focus back to the chapter with the caret just after the character. Opening and closing the palette moves nothing.
- **Disabled, with a short reason,** when no chapter is open, or the editor is read-only, archived or covered by an overview.
- **Spoken names:** `æ`/`Æ` ash, `œ`/`Œ` ethel, `ð`/`Ð` eth, `þ`/`Þ` thorn, `ƿ`/`Ƿ` wynn, `ȝ`/`Ȝ` yogh; any other character is announced as itself with its code point.
- **The set** is edited in settings (add, remove, reorder). **Starting set `æ Æ œ Œ`**; a one-click "add the Old English group" adds `ð Ð þ Þ ƿ Ƿ ȝ Ȝ`.
- The palette uses existing purposes only.

## 8. Settings (§2.5)

A **Typing** group in the settings view, written to `project.md` only when a value changes (decision 23). Keys, in the file's existing kebab-case style, all additive; unknown keys are kept; **no `format-version` change**:

| Key | Type | Default |
|---|---|---|
| `typing-smart-punctuation` | boolean | `true` |
| `typing-name-autocorrect` | boolean | `true` |
| `typing-shortcodes` | boolean | `true` |
| `typing-shortcode-names` | boolean (Codex names in the popup) | `true` |
| `typing-special-characters-button` | boolean | `true` |
| `typing-elisions` | list of strings | `tis, twas, twere, twill, twould, em, til, cause` |
| `typing-name-opt-outs` | list of strings (names) | empty |
| `typing-word-list` | list of strings (names without a note) | empty |
| `typing-shortcodes-list` | map of code → full text (code without the `~`) | empty |
| `typing-special-characters` | list of strings | `æ Æ œ Œ` |

A changed list is rewritten whole and a changed map entry alone (decision 18). **Defaults:** every aid on. I'd keep that: Kenny designed these to be always there, and a switch is one click. The settings group says that **the Mac's own smart quotes, dashes and Text Replacements are off in the editor** (§1.2). If a project has none of these keys, nothing is written.

## 9. Tests and checks

- **Core (table-driven, pure functions):** every row of §4 and §5, protected text of every kind in §3, the word counter cases of §1.1 (a regression test fixing the counter's behaviour), folding and ambiguity, opt-outs, possessives, multi-word names, elisions including `‘em’`.
- **Fuzzer:** random documents and random typing; an aid's change **never lies outside `typedRun`** and **never inside protected text**; and **undoing every aid change returns exactly the typed text**.
- **WebKit interface tests:** each aid in the real editor; one ⌘Z leaves exactly what was typed, a second undoes the typing, ⇧⌘Z redoes the aid; paste, drop, undo, redo and a reload never trigger an aid; the session tracker sees an aid as typing; each switch; read-only and covered editors; the popup keys (Tab, Escape, Return = new paragraph, `~~`); the button inserts at the cursor, replaces a selection and returns focus. Screenshots: the Typing group, the popup, the palette.
- **In the built app (decision 45): `npm run test:typing`**, a new Mac-only script like `test:quit` and `test:cover`: real keystrokes into a chapter of a fixture copy, then the saved file is read. It checks a curly quote, a spaced en dash, an em dash, a name correction and a one-step undo, **and that the Mac's own substitutions no longer act** (`[[it's]]` stays straight, `omw` stays `omw`), and that spellcheck still underlines. It refuses to run while storyForge is open, as the others do.
- **Disk-safety:** changing a typing setting changes only `project.md`.

## 10. Commit plan

As the brief (§5), with one addition in commit 2: the macOS defaults registration (`platform.rs`), so the Mac's substitutions are off before any aid exists. No commit touches the close path; if one does, it runs `npm run test:quit` first.

## 11. Questions for H1

1. **Word counter:** leave it as it is, and read decision 37's "an unspaced dash still counts as two words" as "the aid doesn't change the count"? (Both `word--word` and `word—word` are one word today.)
2. **The Mac's substitutions** act in the editor today, and curl quotes inside links and code. Register the three `Web…Enabled NO` defaults for this app (no effect outside it, spellcheck untouched), **always off in the editor, whatever the aid switches say**?
3. **The popup:** build it on `@codemirror/view`'s tooltip (no new dependency, my proposal), or add `@codemirror/autocomplete`?
4. **Folding:** `ð` as `th` and `d`, and `ȝ` as `g`, `y` and `gh`. Right, or fewer?
5. **Elisions:** keep `cause` and `em` in the starting list, knowing each can also open ordinary speech?
6. **Spaced hyphen between numbers:** leave `5 - 3` and also `Chapter 5 - the storm` as typed (the rule can only look left), or only skip when both sides are numbers once known?
7. **Defaults:** every aid on for a project without the keys?
8. **`aria`/spoken names** for custom characters: the character plus its code point. Fine?
