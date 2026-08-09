# Continuous mode — inline click-to-edit: status, postmortem, and full audit trail

**Status as of 2026-08-09: disabled.** Continuous mode is a read-only, virtualised
read-through of every chapter in a book (`src/view/ContinuousReadThrough.ts` /
`src/view/ContinuousReadView.ts`). Clicking into a chapter's text used to graft a real,
live, auto-saving editor in place, inline in the scroll. That click handler is now
commented out at its entry point (`ContinuousReadThrough.ts`, the body `click` listener) —
see that comment for the one-line pointer back to this document. Nothing described below
was deleted; it's dormant, not gone.

This document exists because three separate rounds of trying to fix this — two of them
full research hand-offs to another, more thorough agent, the third a live, iterative
debugging session — never landed a working result, and the person who owns this project
(Kenny) asked for a complete paper trail before parking it, rather than a summary. So this
is long and unedited on purpose: it includes the full text of both research prompts and
both research responses, not paraphrases of them, plus a faithful account of the live
debugging session that came after the second response, including the fixes that turned
out to be real but insufficient.

---

## TL;DR for whoever picks this up next

- The technique for getting a *real*, auto-saving Obsidian `MarkdownView` into arbitrary
  plugin DOM (`src/view/graftedEditor.ts`, a hand-built `WorkspaceSplit` graft) **works**
  and is not in question. Two independent research rounds confirmed it against the actual
  public API surface. Don't re-litigate this part.
- What never got solved: making that grafted editor render and scroll as an honest part of
  the outer continuous-scroll container, rather than as its own separate box.
- Across this whole effort, at least **four distinct, confirmed bugs** were found and
  fixed one after another (a 0-height collapse, a `.cm-scroller { overflow-x: auto }`
  blockification bug, a width collapse from `all: unset` wiping native leaf flex sizing,
  and Obsidian's own `contain: strict` on `.workspace-leaf` neutralising all
  content-based sizing) — and after all four fixes, the chapter **still** disappeared on
  click in live testing. There is likely at least one more factor that was never isolated.
- Given the effort already sunk and the number of times "found it" turned out to be
  "found *a* real bug, not *the* bug," the decision (Kenny's, 2026-08-09) was to stop
  fighting it live and ship continuous mode as read-through only, rather than continue an
  open-ended live debugging loop.
- See [§9](#9-how-to-re-enable--where-to-pick-this-up) for exactly what's still in the
  codebase, dormant, ready to resume from.

---

## 1. What this feature was supposed to do

A deliberate click on a chapter's rendered text, inside continuous mode's one long virtualised
scroll, should turn *that chapter's rendered block, in place, inline in the scroll* into a
real, live, fully-functional Obsidian editor — the same editing experience as opening the
file normally (auto-save, all of Obsidian's own editing behaviour) — without ever leaving
the scroll. In Kenny's own words, from partway through this effort:

> "Clicking brings me into the editor, but not to the right place, and I can't after
> editing carry on scrolling as I wanted. The idea was to edit within the view and then
> carry on with the scrolling. Touch edit here, touch edit there, without leaving the
> scrolling mode. But part of the scrolling mode would bring forth the editor as part of
> the scrolling mode. That was how it was sold to me."

That's the bar. It was never hit cleanly.

---

## 2. Timeline, high level

1. Continuous mode's read-through (CM-1) and an initial click-to-edit stopgap (CM-2, hand
   off to a normal editor tab, leaving the scroll) were built first.
2. Kenny rejected the "leaves the scroll" stopgap as not meeting the actual requirement,
   and asked for a research hand-off — **Round 1** (§4 below). The response corrected a
   wrong premise (that no public API could do this at all) and specified a full
   implementation: the `WorkspaceSplit` graft technique, plus a work-ordered list of
   prerequisite fixes and the caret-resolution logic. This was implemented in full,
   across several commits, with live testing and fixes in between (icon sizing, exit/
   re-entry state, sidebar-vs-main-pane architecture — all resolved, not part of this
   postmortem).
3. Once the graft was live, Kenny reported a specific, detailed UX bug: the edited
   chapter rendered inside its own bounded box with a visible internal scrollbar, so the
   continuous scroll broke into two independent, stacked scroll regions. Another research
   hand-off followed — **Round 2** (§5 below). The response identified the actual
   CodeMirror 6 mechanism at fault and prescribed a specific CSS fix.
4. Implementing Round 2's fix kicked off **Round 3** — this session's live, iterative
   debugging (§6 below), which never fully closed. That's the round this document exists
   to preserve in detail, since none of it went through an external research hand-off —
   it's the direct back-and-forth between Kenny live-testing in Obsidian and fixes applied
   in response to `getComputedStyle`/DOM dumps he pasted back.
5. Kenny decided to stop and disable the feature (§8).

---

## 3. Where the code lives

- `src/view/graftedEditor.ts` — the graft itself (`graftEditor()`). Untouched by the
  disabling; still fully functional if called.
- `src/view/ContinuousReadThrough.ts` — owns the click listener that used to call
  `onEditChapter`. **This is where click-to-edit is now disabled** — see the comment at
  that call site.
- `src/view/ContinuousReadView.ts` — `editChapter()`, `commitActiveEdit()`,
  `openInMainPaneFallback()`. All left intact and dormant; nothing calls `editChapter`
  anymore with the click listener disabled.
- `src/clickToCaret.ts` / `src/view/clickToEditDom.ts` — the click-to-source-offset
  resolution logic. Fully unit-tested, not implicated in any of the bugs below, left as-is.
- `styles.css`, search for `.sf-grafted-editor` — every CSS fix from every round described
  below is still there, most-recent on top, each with its own explanatory comment. Not
  reverted — if this is picked up again, that CSS is the actual current state of the
  investigation, not scaffolding to throw away.

---

## 4. Round 1 — getting a real editor into arbitrary DOM at all

### 4.1 The prompt

Written after Kenny explicitly said the "leaves the scroll" fallback didn't meet the
requirement and asked for a research hand-off. Full text in
[Appendix A](#appendix-a-round-1---prompt-full-text).

In short: is there any way, documented or not, to mount a real, auto-saving
`MarkdownView` into arbitrary plugin DOM, given `Editor`/`MarkdownView` have no public
constructor and `createLeafInParent` appeared to require a `WorkspaceSplit` already in
Obsidian's own layout tree?

### 4.2 The response

Full text in [Appendix B](#appendix-b-round-1-response-full-text). Headline finding: the
premise in the prompt was **wrong**. A freshly constructed `WorkspaceSplit`, with its
`getRoot`/`getContainer` overridden on that one instance, works as a parent for
`createLeafInParent` — this is precedented (Hover Editor, MIT; Daily Notes Editor, used
for design lessons only, no code copied) and every operation involved is public,
documented API except the `WorkspaceSplit` constructor's argument shape.

The response also specified, in full: why this option ("C") beats the alternative
embed-registry technique ("A") and the always-on-every-chapter shape ("B", rejected for
iPad memory reasons); the full graft implementation; the state model and commit-ordering
rules; the decision to ship block-level-only caret placement and defer character-level
refinement; a full iPad/mobile section; five prerequisite lifecycle bug fixes; the actual
root cause and fix for a separate, unrelated icon-sizing bug; and licensing/attribution
requirements for the techniques being drawn on.

### 4.3 What got built, and what it produced live

This was implemented in full, in the specified work order, with `tsc`/vitest checkpoints
between stages, across several commits. Live testing surfaced and fixed (not part of this
postmortem, already resolved): the sidebar rendering manuscript text instead of being
menus-only, the live position indicator needing to move back to the sidebar, exit/
re-entry state bugs, and the icon-sizing bug identified in §7 of the response.

Once those were resolved, the graft itself worked: clicking a chapter produced a real,
editable, auto-saving `MarkdownView` in place. But it rendered inside a bounded box
(`.sf-grafted-editor { height: 70vh; }`) with its own internal scrollbar — which is what
prompted Round 2.

---

## 5. Round 2 — the editor scrolls in its own pane

### 5.1 The prompt

Full text in [Appendix C](#appendix-c-round-2---prompt-full-text). Written after Kenny's
detailed bug report (quoted in full inside the prompt itself): clicking into a chapter
shifted its position, changed its typography (wider borders, looser line spacing), and
broke continuous scrolling into two independent regions — scrolling near the edited
chapter scrolled *inside its box* first, and the chapters above/below it (part of the
outer scroll) didn't move until the inner box's scroll was exhausted.

The prompt documents, in detail, two earlier failed attempts at fixing this within the
same session (a CSS-only `height: auto` cascade that collapsed the editor to zero height,
and a forced-then-`ResizeObserver`-snapped height that produced a 27,126px scroller with
only four real rendered paragraphs) — both diagnosed via live DOM dumps Kenny pasted back
— and asks specifically whether CodeMirror 6 has any way to be made to treat the outer
scroll container as its own effective viewport.

### 5.2 The response

Full text in [Appendix D](#appendix-d-round-2-response-full-text). Verified directly
against `@codemirror/view@6.38.6`'s actual shipped source in this repo's `node_modules`
(cited by line number throughout), not inferred from behaviour. Headline finding:
**CodeMirror 6 already does this natively** — it measures visibility by walking its own
ancestor chain and clips against whichever ancestor is genuinely overflowing with a
non-`visible` computed `overflow`, and it attaches scroll listeners to every ancestor up
to the document. No bridging code was needed; the outer `.sf-continuous-scroll` was
already capable of being CM6's effective viewport.

What was actually wrong, per the response: `.cm-scroller` was still a clipping ancestor,
for two compounding reasons — (1) CodeMirror's own base theme sets
`overflow-x: auto` on `.cm-scroller`, and per the CSS Overflow spec, a lone
`overflow-y: visible` paired with a scrolling other axis gets *blockified* back into
`auto` — so the earlier `overflow: visible` attempt never actually removed the clip; and
(2) Obsidian's own leaf chrome (`.workspace-leaf`, built as a flex item with
`min-height: 0` against a definite-height ancestor that only exists in the real,
window-filling workspace) collapses to zero when grafted into ordinary page flow with no
such ancestor.

The prescribed fix: drop `.sf-grafted-editor`'s bounded height entirely; `all: unset` +
`display: block` on `.workspace-leaf`; `height: auto` down the
`workspace-leaf-content`/`view-content`/`markdown-source-view`/`cm-editor`/`cm-scroller`
chain, `min-height: auto` on `.cm-editor`; `overflow: clip` (the shorthand, both axes) on
`.cm-scroller`; hide `.inline-title`/`.metadata-container` alongside the existing
`.view-header`/tab-header hiding; and — explicitly — do **not** touch `.cm-content`'s own
`padding-bottom` with `!important`, since CM6 writes that inline to reserve space for
virtualised lines still below the viewport. It also specified a position-anchoring fix
(record the clicked element's `getBoundingClientRect().top`, and after the graft resolves,
use the public `EditorView.findFromDOM`/`coordsAtPos` statics to measure the real
resulting position and correct the outer scroll by the delta, before focusing rather than
after).

---

## 6. Round 3 — this session's live debugging (no external hand-off)

Everything in this section happened directly between Kenny live-testing in Obsidian and
fixes applied here in response, with no further research hand-off — it's included in full
because it's where the actual final (partial) root cause was found, and because the
pattern across it — each fix being real but insufficient — is itself the reason the
feature is being parked rather than fixed.

### 6.1 Implementing Round 2's prescription

Round 2's CSS and position-anchoring fix were implemented as specified: `styles.css`'s
`.sf-grafted-editor` height rule was removed and replaced with the `all: unset`/
`height: auto`/`overflow: clip` chain; `graftedEditor.ts` was changed to no longer call
`.focus()` itself (moved to the caller, after the scroll correction); `ContinuousReadThrough.ts`
was changed to capture and pass through the clicked element's `getBoundingClientRect().top`;
`ContinuousReadView.ts` was changed to use `EditorView.findFromDOM`/`coordsAtPos` to correct
the outer scroll position before focusing. `tsc` and all 340 vitest tests passed; the build
was verified fresh via file timestamps.

**Live result: the chapter disappeared on click** — the same failure mode as the very
first attempt in Round 2's history, before any of this session's fixes.

### 6.2 First live diagnosis: a width collapse from `all: unset`

Kenny ran a console script walking up from the clicked `.cm-line` logging
`getBoundingClientRect().width` and key computed styles at each ancestor. Result: the
clicked line was **11px wide and 6090px tall** — narrow enough to be functionally
invisible (a paragraph wrapped to one word per line reads as a blank sliver), not
actually zero.

Diagnosis: `all: unset` on `.workspace-leaf` had also wiped Obsidian's own
`flex: 1 0 0px` — confirmed by comparing against the *real*, un-grafted leaf elsewhere
in the same DOM dump, which showed exactly that native value. That flex value is what
gives every leaf its width (flex-grow fills the row-direction split's available space,
ignoring the item's own content size via `flex-basis: 0px`); once removed, nothing below
had a real width for CM6's own percentage flex-bases to resolve against.

Fix: stop using `all: unset` on `.workspace-leaf`; override only `min-height:
min-content`, leaving its native `flex`/`overflow` alone. Rebuilt, tests green.

### 6.3 A screenshot, a misdiagnosis, and an irrelevant-but-harmless fix

Kenny sent a screenshot after the fix above, showing two chapters' worth of readable text
in the continuous scroll. This was misread here as confirmation the fix had worked —
Kenny corrected this: the screenshot actually showed **Chapter 1's header, then a blank
area, then Chapter 2's header and text** — the blank area was Chapter 1's own paragraph,
which existed in the DOM (visible in the inspector tree) but wasn't rendering visibly.

Before that correction landed, a plausible-but-wrong theory was pursued: that the new
scroll-position-correction code (§5.2's `coordsAtPos`-based delta) was measuring against
an unsettled layout and scrolling the editor off-screen. A defensive clamp was added
(skip the scroll correction if the computed delta is implausibly large). This is still in
the code and is harmless, but **it did not address the actual bug** — the real problem
was the same rendering collapse as before, not a scroll-position error. Recorded here so
a future reader doesn't waste time thinking this clamp was ever the fix for anything.

### 6.4 Second live diagnosis: `contain: strict`

Once the misreading was corrected, Kenny re-ran (and extended) the diagnostic console
script, this time also checking `height`, `visibility`, `opacity`, and `color` at each
ancestor. Result: every element *inside* `.workspace-leaf` had a real, non-zero height
(~11,867px, consistent with a full chapter's worth of CM6 content) — but `.workspace-leaf`
itself, and its parent `.sf-grafted-editor`, both reported **height: 0**, despite the
`min-height: min-content` rule from §6.2 being present and applied.

A second, more targeted script specifically checked `contain` and `content-visibility`.
Result: `.sf-grafted-editor .workspace-leaf` had `contain: strict` — Obsidian's own native
rule, not anything storyForge had set, almost certainly a performance guard for
many-leaves vaults.

This matters because CSS size containment (part of `contain: strict`) makes the browser
compute intrinsic sizes — `auto`, `min-content`, `max-content` — **as if the element had
no content at all**, regardless of what's actually inside it. That means every
content-based sizing fix attempted up to this point (`height: auto`, `min-height:
min-content`) had been measuring against a phantom empty box the entire time. It also
retroactively explains why the very first bounded-height fix, back in Round 1
(`.sf-grafted-editor { height: 70vh; }`), ever worked at all: `vh` resolves to a concrete
pixel value at layout time, never touching intrinsic sizing, so it was the one value in
this entire saga that size containment couldn't quietly defeat.

Fix applied: `.sf-grafted-editor .workspace-leaf { contain: layout style paint; }` —
dropping just the `size` component of `contain: strict`, scoped to this one synthetic
leaf only, so none of Obsidian's real tabs lose whatever performance benefit the
containment provides. Rebuilt, `tsc` clean, all 340 tests passed.

### 6.5 Still broken live — decision to stop

Kenny reloaded and tested again. **The chapter still disappeared on click.** No further
diagnostic was gathered at this point — Kenny made the call to stop debugging live and
park the feature rather than continue iterating, which is the origin of this document.

This is the honest, load-bearing gap in this postmortem: `contain: strict` was a real,
confirmed, well-evidenced bug (not a guess — it was read directly off the live element via
`getComputedStyle`), and fixing it was clearly correct on its own terms. But fixing it did
not resolve the visible symptom. That means there is **at least one more factor** still
uncaught — possibly another containment/isolation property on a different ancestor,
possibly something in how Obsidian defers/lazy-initialises a leaf it doesn't consider
part of the normal visible-tab tracking (§3.2 of Round 1's response notes the grafted leaf
is deliberately invisible to `getLeavesOfType`, which might have other consequences never
explored), or something else entirely not yet suspected. Nobody ran the same
`getComputedStyle` walk after this fix to see what, if anything, changed — that would be
the correct next diagnostic step if this is picked up again.

---

## 7. Confirmed facts vs. open questions

**Confirmed, via direct evidence (not inferred):**

- The `WorkspaceSplit` graft technique itself works and produces a real, auto-saving
  `MarkdownView`.
- CodeMirror 6 natively supports an outer scroll container as its effective viewport; no
  bridging extension is needed (Round 2 response, §0–§1, verified against actual CM6
  source).
- `overflow: clip` (not `overflow: visible`) is required on `.cm-scroller` because of
  overflow blockification with CM6's own `overflow-x: auto` base rule.
- `all: unset` on `.workspace-leaf` breaks its width by discarding native
  `flex: 1 0 0px` (§6.2 above, confirmed via live DOM comparison against a real leaf).
- `.workspace-leaf` carries `contain: strict` natively, which defeats all
  content-based/intrinsic height sizing regardless of `min-height` overrides (§6.4 above,
  confirmed via `getComputedStyle`).

**Not confirmed / open:**

- What is *still* causing the chapter to disappear after the `contain` fix. Not
  diagnosed — no dump was taken after that fix.
- Whether there's a *second* containment or isolation property somewhere else in the
  chain (e.g. on `.sf-grafted-editor` itself, on `.view-content`, or on an ancestor not
  yet inspected).
- Whether the grafted leaf being invisible to Obsidian's normal leaf-tracking
  (`getLeavesOfType`, `getActiveViewOfType` — noted as a known gap in Round 1's response,
  §3.2/§3.7) has any bearing on this specific rendering problem, as opposed to just the
  command-routing question it was originally flagged for.
- Whether the position-anchoring code (§5.2/§6.3) actually works correctly once the
  underlying rendering is fixed — it was never tested against a working render.
- The typography-matching suggestion from Round 2's response (§8, matching `.cm-line`'s
  vertical rhythm to rendered paragraph spacing) was never attempted — deliberately, since
  it needs live pixel comparison to tune correctly and there was no point tuning
  typography on a box that wasn't reliably visible yet.

---

## 8. Decision: click-to-edit disabled, read-through only

Kenny's decision (2026-08-09), verbatim reasoning: after four confirmed-real bugs fixed in
sequence still didn't produce working behaviour, continuing to debug live — where every
diagnostic round costs a full reload-click-report cycle — was no longer worth it for now.
Rather than leave the feature half-working (silently disappearing chapters is worse than
no inline editing at all), click-to-edit is disabled at its entry point, and continuous
mode ships as a pure read-through of every chapter. This is a parking decision, not a
verdict that the feature is impossible — §7's open questions are concrete enough that a
future attempt has real footholds, particularly re-running the same `getComputedStyle`
walk after the `contain` fix, which was never done.

---

## 9. How to re-enable / where to pick this up

1. Re-enable the click listener in `ContinuousReadThrough.ts` (search for this document's
   filename in that file — the disabling comment points back here).
2. Everything it calls (`ContinuousReadView.editChapter`, `graftedEditor.graftEditor`, the
   lock/unlock lifecycle) is untouched and should work exactly as it did at the end of
   §6.4 above.
3. First diagnostic step, before writing any new code: reproduce the disappearing chapter
   live, and re-run the `getComputedStyle` ancestor-walk script from §6.4 (both the
   width/height/overflow version and the `contain`/`content-visibility` version) to see
   what, if anything, is different now versus what was found then. This is the step that
   was skipped when the feature was parked.
4. All the CSS fixes from every round are still live in `styles.css` under
   `.sf-grafted-editor` — don't remove or "clean up" any of it without understanding why
   it's there first; each rule has a comment explaining the specific bug it fixes.

---

## Appendix A: Round 1 — prompt (full text)

> Written by this agent, published as a Claude Artifact, and handed to a separate,
> more thorough research agent by Kenny.

```markdown
# Research task: mount a real Obsidian editor inline, within custom plugin DOM

## Where the code is

`https://github.com/KennyRN/storyForge`, branch `feature/layout-selector-codex-focus`
(pushed, tracks `origin`). Everything described below — the continuous
read-and-write mode, the click-to-caret mapping, the rejected fallback — is
on that branch, not `main`. Relevant commits, newest first:
`c9c1608` (CM-2: click-to-edit, the fallback this task replaces),
`d360d10`, `d635bd3`, `dae1e2f`, `9e1b962` (continuous mode's UI/architecture
corrections), `20b45fa` (CM-1: the virtualised read-through this all sits on
top of). Reading the diffs on those commits in order is probably the fastest
way into the shape of the feature.

## Project

storyForge — an Obsidian plugin (TypeScript, esbuild). Repo root:
`storyForge Git Clone/storyForge`. Obsidian API typings: `obsidian@latest`
(currently resolving to `1.13.1`). CodeMirror 6 packages are **already**
project dependencies: `@codemirror/state@^6.5.0`, `@codemirror/view@^6.38.6`
(see `package.json`). There's existing CM6 extension code for reference at
`src/cyclingGuide.ts` (a `ViewPlugin`/`Decoration` extension registered via
`app.registerEditorExtension`, using `editorInfoField` from `obsidian`) —
that's enhancing Obsidian's *own* editor instances, not creating a new one,
but it shows the toolchain and CM6-import path already work cleanly here.

## The feature this blocks

"Continuous read-and-write mode": a virtualised, scrollable read-through of
every chapter in a book, one long scroll (`src/view/ContinuousReadThrough.ts`,
hosted in `src/view/ContinuousReadView.ts`, a main (editor) pane `ItemView`,
not the sidebar). Chapters are rendered read-only (`cachedRead` +
`MarkdownRenderer.render`) and mount/unmount via `IntersectionObserver` as the
reader scrolls, so DOM cost stays bounded regardless of book length.

**The requirement**: a deliberate click on a chapter's rendered body should
turn *that chapter's rendered block, in place, inline in the scroll* into a
real, live, fully-functional Obsidian markdown editor — the same editing
experience as opening the file normally (auto-save, all of Obsidian's own
editing behaviour) — **without leaving the scroll view**. The reader clicks
into a chapter, edits, then keeps scrolling; scrolling that chapter out of
view (or clicking away, or Escape) commits the edit and reverts that block to
its rendered form. Multiple chapters can be touch-edited this way across one
continuous scroll session — "touch edit here, touch edit there" — without any
navigation event that leaves the continuous view.

This is a deliberate, explicit product requirement (not a nice-to-have): the
whole point of the mode is reading and light editing *in the same scroll*,
never context-switching to a separate tab/pane to make a small edit.

## Why this is unsolved: no public API for it

Confirmed via `obsidian.d.ts`:
- `Editor` is `abstract` with no public constructor.
- `MarkdownView` extends `TextFileView`, constructed only via a
  `WorkspaceLeaf` that belongs to Obsidian's own layout tree.
- `Workspace.createLeafInParent(parent: WorkspaceSplit, index: number)` only
  accepts a `WorkspaceSplit` already in Obsidian's layout tree — not an
  arbitrary `HTMLElement` — so there's no way to graft a real leaf into a
  custom `<div>` inside plugin-owned DOM.

So there is no *documented* way to get a live, auto-saving Obsidian editor
instance attached to arbitrary DOM. The only known way this is done in the
wild is a vendored technique several community plugins carry, usually called
something like **"Embeddable Markdown Editor"** (the original is commonly
attributed to a gist by **Fevol**), used by plugins including **Obsidian
Tasks**, **Full Calendar**, **QuickAdd**, and **Day Planner**. It reaches into
Obsidian's *undocumented* internals to construct a real CodeMirror 6 editor
with Obsidian's own markdown language support/extensions attached, without
going through the `WorkspaceLeaf`/`View` system at all.

I (the previous agent on this thread) do not have reliable, verifiable
knowledge of the exact current shape of that internal API (class names,
constructor signature, which Obsidian-internal module/property exposes it).
Guessing at the specific symbols risked either a silent no-op or a runtime
crash in the user's real vault, so rather than fabricate that, this was
escalated for research instead.

## What's already built and should be reused as-is

- **`src/clickToCaret.ts`** — pure, fully unit-tested (27 tests in
  `src/__tests__/clickToCaret.test.ts`) mapping from a *rendered* text offset
  back to the exact *source* offset, handling bold/italic/strikethrough
  markers, inline code, wikilink display-text-vs-target, markdown links, and
  leading block markers (headings, ordered/unordered list bullets,
  blockquotes). This logic is sound and should not need to change.
- **`src/view/clickToEditDom.ts`** — the DOM-dependent half: aligns a clicked
  rendered DOM element positionally against `clickToCaret.ts`'s source
  blocks, and uses `document.caretRangeFromPoint` + a `TreeWalker` to find the
  exact rendered-offset clicked. **The user reports the resulting caret
  position is currently wrong** — this needs verification/debugging
  independent of the editor-mounting work, since whatever mounting technique
  gets built will still call into this for the initial caret position.
  Worth writing a manual/live test harness for this specifically (it can't be
  unit tested — this project's vitest config runs in a plain Node
  environment, no jsdom, so `document`/`Range`/`caretRangeFromPoint` aren't
  available in tests).
- **`src/view/ContinuousReadThrough.ts`** — the virtualisation engine (two
  `IntersectionObserver`s: one drives mount/unmount of rendered chapters with
  a wide margin, one tracks the "current" chapter for a live position
  indicator). This is where the inline editor needs to slot in: on a
  qualifying click, replace that chapter's `.sf-continuous-body` content with
  the live editor instead of calling the current (rejected) fallback.
- **`src/view/ContinuousReadView.ts`** — hosts the above in a real Obsidian
  `ItemView` in the main editor pane (not the sidebar — the sidebar,
  `src/view/CodexFocusNavigator.ts`, is navigation-only: a live position
  indicator and a scroll-to transport row, talking to this view via two
  custom workspace events in `src/view/continuousEvents.ts`).

## What to replace

Currently (the rejected stopgap), a body click in `ContinuousReadThrough.ts`
calls `options.onEditChapter(file, sourceOffset)`, which
`ContinuousReadView.ts` implements as:

```ts
private async editChapter(file: TFile, sourceOffset: number): Promise<void> {
	await this.leaf.openFile(file, { active: true });
	this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
	const view = this.leaf.view;
	if (view instanceof MarkdownView) {
		view.editor.setCursor(view.editor.offsetToPos(sourceOffset));
		view.editor.focus();
	}
}
```

This **leaves the continuous scroll entirely** — it replaces the whole read
view's leaf with a normal single-file editor tab, which is exactly the
"leaving the view" behaviour the user does not want. It was a deliberate,
disclosed fallback (the user was asked and picked "best effort" originally,
then this stopgap when the inline approach was assessed as too risky to
guess at) — it should be replaced once the inline-mount technique is found
and validated, not built further on top of.

## What's needed from this research

1. Find/confirm the current, version-correct way to construct a real,
   auto-saving Obsidian markdown editor and mount it into an arbitrary
   `HTMLElement` — ideally by finding and adapting the actual source of the
   "Embeddable Markdown Editor" technique as currently used in a real,
   maintained plugin (Tasks / Full Calendar / QuickAdd / Day Planner are all
   open source — check their repos directly for the vendored file, likely
   named something like `embeddable-markdown-editor.ts` or
   `markdownEditor.ts`), verified against Obsidian API `1.13.1` specifically
   since internals can shift between versions.
2. Produce a vendored TypeScript module (e.g.
   `src/view/EmbeddableMarkdownEditor.ts`) exposing roughly:
   - `mount(app, container, file, initialContent, options): EditorHandle`
   - `EditorHandle`: `{ getValue(): string; setCursor(offset: number): void;
     focus(): void; destroy(): void; onCommit(cb: () => void): void }`
     (exact shape flexible — needs to fit `ContinuousReadThrough.ts`'s
     mount/unmount lifecycle, which already tracks per-chapter mounted state
     via an `IntersectionObserver`).
3. Confirm it satisfies:
   - Real, live editing — Obsidian's own machinery does the saving (no
     `vault.modify`/`vault.process` calls from the plugin at all — this is a
     hard rule for this plugin, called the "write-guard tenet": the only
     writes the plugin ever performs are new-file creation and specific
     backstage-frontmatter fields, never a chapter or codex note body).
   - Caret lands at a given character offset on mount (reuses
     `clickToCaret.ts`'s output — just needs `setCursor`/equivalent).
   - Whole-file editable (not scoped to one paragraph).
   - Clean `destroy()`/teardown when scrolled away or committed, with no
     leaked CM6 state or event listeners (this matters — chapters mount and
     unmount constantly as the reader scrolls a long book; there could be
     many mount/destroy cycles per session).
   - Coexists with the existing rendered (`MarkdownRenderer.render`) state
     for chapters that aren't currently being edited — only one editor should
     ever be "live" at a time across the whole continuous view.
4. Flag anywhere the technique is fragile or version-sensitive so it can be
   guarded (e.g. feature-detect and fall back to today's "open in a real tab"
   behaviour with a `Notice` if the internals aren't found, rather than
   crashing).

## Non-goals (already decided, don't revisit)

- A true multi-file continuous *editable* surface (one CM6 doc spanning every
  chapter) was explicitly ruled out earlier in this project — boundary
  problems at chapter seams (Enter at one chapter's end, backspace at the
  next's start, cross-chapter selection) have no honest answer. The design is
  one editor, one chapter, mounted and unmounted per click/scroll — just
  *inline* rather than in a separate pane.
- Only one live editor at a time, app-wide, within this feature.
```

## Appendix B: Round 1 response (full text)

> Received back from the research agent; this is what was actually implemented.

```markdown
# storyForge — continuous-mode inline editor: research, decisions and implementation brief

**Branch** `feature/layout-selector-codex-focus` @ `c9c1608` ("Add CM-2: click-to-edit on the continuous read-through").
**Verified against** `obsidian@1.13.1` (the public typings on the branch) and `@obsidian-typings/obsidian-public-1.13.4@1.3.0` (internal typings, generated against Obsidian desktop 1.13.4).
**Supersedes** all earlier research notes and option briefs on this feature. Where those disagree with this, this is correct.

This answers the research brief escalated from the previous agent session, records the decisions Kenny has taken since, and fences the work. Decisions marked **settled** are not to be reopened without asking.

---

## 0. Work order

1. **§7 — the five transport icons.** Independent of everything else, cause identified and fix measured. Do this first and separately.
2. **§6 — prerequisite lifecycle fixes.** Paint race, entry scroll, min-height collapse, per-section `Component`, selection guard. All are cheaper to fix while only rendered markup is at stake, and the editor sits inside the lifecycle they define.
3. **§6.8 — block resolution by content matching.** This is now load-bearing rather than an improvement: under §3.6 it *is* the caret story, not the first step of it.
4. **§2–§5 — the inline editor**, behind the fallback chain in §3.5.

Commit atomically with a `tsc` and test checkpoint between each, per the house convention. **Read §8 before opening any of the reference repositories.**

---

## 1. The escalated brief's premise was wrong

The brief stated: *"`Workspace.createLeafInParent(parent: WorkspaceSplit, index: number)` only accepts a `WorkspaceSplit` already in Obsidian's layout tree — not an arbitrary `HTMLElement` — so there's no way to graft a real leaf into a custom `<div>`."*

This is false, and the correction is the basis of the design below. A freshly constructed `WorkspaceSplit` whose `getRoot` and `getContainer` are overridden works as a parent, and its `containerEl` can be inserted anywhere. `createLeafInParent` into it produces a **real `WorkspaceLeaf`**; `leaf.openFile(file)` produces a **real `MarkdownView`** with Obsidian's own auto-save, its own editing behaviour, its own mobile toolbar, and every registered editor extension.

This is not speculative. It is the technique used by **Hover Editor** (MIT) for popovers, and by **Daily Notes Editor** — a community-store plugin with `isDesktopOnly: false` — to do storyForge's exact feature: a continuous scroll of multiple, individually editable, auto-saving notes. It has passed Obsidian's own plugin review, which matters given where storyForge is heading.

The brief also asked for the "Embeddable Markdown Editor" that Tasks, Full Calendar, QuickAdd and Day Planner vendor — Fevol's snippet, crediting mgmeyers. **Do not vendor it.** It is not file-backed: it is constructed against `null as unknown as TFile` with an empty string, and its only content accessor is a `value` getter reading the CodeMirror document. Persisting is the caller's job, which for a chapter body means `vault.modify` and a direct breach of the write-guard tenet. Its published form additionally brings a `monkey-around` dependency patching `app.workspace.setActiveLeaf` globally, a class declared at module scope against the **global** `app`, a double `Object.getPrototypeOf` walk, and an unconditional `activeEditor = null` on destroy. It is the right answer to Kanban's question, not to this one.

---

## 2. Settled: Option C, a grafted leaf, editor on demand

Three shapes were considered.

- **C — grafted leaf, editor on demand.** Rendered chapters stay as they are (`cachedRead` + `MarkdownRenderer.render`); a real leaf is grafted only for the one chapter being edited. **Chosen.**
- **A — embed registry, editor on demand.** Same lifecycle, but the editor comes from `app.embedRegistry.embedByExtension.md` with `editable = true` and `showEditor()`. **Retained as the documented fallback** (§3.5).
- **B — an editor for every mounted chapter.** **Rejected, not deferred** (§9).

Note the two axes are independent: A, B and C all concern *how* an editor is built, while on-demand versus every-chapter concerns *how many* exist. C is on-demand. Only one editor ever lives at a time.

### 2.1 Why C over A

**Surface area, and it runs the opposite way to first impressions.** Everything C needs is public, documented API at 1.13.1: `createLeafInParent` (public), `getRoot()` and `getContainer()` on `WorkspaceItem` (public, `@since 0.10.2` and `0.15.4`), `WorkspaceLeaf.setPinned` (public), `leaf.detach()` (public), and `WorkspaceSplit` itself is an **exported public class**. The entire unofficial reach is one call: `new WorkspaceSplit(app.workspace, "vertical")`, where the class is public and only the constructor signature is undeclared. If a future Obsidian changes it, the failure occurs at construction — the most detectable possible failure point.

By contrast, `embedRegistry` appears **zero** times in `obsidian.d.ts`. Every member of the embed path is `@unofficial`. `embedByExtension.md` is declared to return `EmbedMarkdownComponent`, which extends `EmbedComponent` and declares exactly one method, `loadFile()` — everything else lives on the separate `EmbeddedEditorView` interface, so the return has to be cast to a wider type and duck-typed at runtime. And the typings' own remark on that path reads: *"Fun fact, setting this to `true` and calling `showEditor()` for embedded MD views, allows them to be edited. Though the experience is a little buggy."*

**The save contract is documented for C and unofficial for A.** `TextFileView`'s docblock states: *"this view only saves when it's closing. To implement auto-save, your editor should call `this.requestSave()` when the content is changed"* — and `requestSave` is documented as *"Debounced save in 2 seconds from now."* Obsidian's own editor calls it on change; `onUnloadFile` covers close. Both legs of the commit story are public contracts, and §3.4 has a hard number to work against.

**`cyclingGuide.ts` works by construction.** It reads `view.state.field(editorInfoField, false)?.file?.path` and gates on the storylibrary path. A real `MarkdownView` receives storyForge's registered editor extension automatically. A mocked-owner embed may or may not — which risks the cycling guide silently not working inside continuous mode.

**The iframe question disappears.** `EmbeddedEditorView` carries a `useIframe: boolean` and its editor interface is `IFramedMarkdownEditor` with an `iframeEl`. I could not determine from documentation when that is true, and if it is true on iPadOS it breaks `clickToEditDom.ts`'s assumption that `bodyEl.ownerDocument` is the document the click coordinates belong to. A grafted leaf has no iframe anywhere. (The `useIframe` value should still be logged once if the fallback in §3.5 is ever exercised.)

### 2.2 What C costs, honestly

A full `MarkdownView` is heavier per instance than an embed widget. That is acceptable because only one ever exists — see §5.1. The remaining costs are the empirical unknowns in §3.7.

---

## 3. Implementation

### 3.1 The graft

Eight operations, in order: construct a `WorkspaceSplit` against `app.workspace`; override `getRoot` **on that instance** to return `app.workspace.rootSplit` (or the matching entry in `floatingSplit` when the view lives in a pop-out window); override `getContainer` **on that instance** to return the same container; insert the split's `containerEl` into the chapter section's element; `createLeafInParent(split, 0)`; `leaf.openFile(file, …)`; `leaf.setPinned(true)`; place the caret.

Teardown is `leaf.detach()` followed by removing the split's container from the DOM.

**Open in Live Preview**, not source mode — `state: { mode: "source", source: false }`. Live Preview is visually closest to the rendered markup the editor is replacing, which minimises the discontinuity §4 addresses. `source` is an undocumented state key; a wrong value degrades to source mode rather than failing, so it needs no guard.

**`setPinned(true)` is not optional.** Without it, clicking a wikilink inside the inline editor navigates *that leaf* to the target file and the chapter is replaced in place.

**The mount must not move the outer scroll container.** Capture `scrollEl.scrollTop` before mounting and restore it immediately after. Two things will otherwise yank the view out from under the reader: `openFile` restores Obsidian's remembered ephemeral position for that file, and focusing a CodeMirror editor scrolls its caret into view. Because the editor container expands to fit its content — it must, for the continuous scroll to work — there is no internal scrolling to absorb either, so both land on the outer container. This is necessary but not sufficient on its own — §3.6 covers the rest.

### 3.2 What NOT to patch

Daily Notes Editor patches `Workspace.prototype` and `WorkspaceLeaf.prototype`. **storyForge needs none of it in the base case**, and the agent must not add any of it speculatively. Why each patch exists there and why it does not apply here:

| Patch in the precedent | Why it exists there | storyForge |
|---|---|---|
| `WorkspaceLeaf.prototype.getRoot` | Inherited from Hover Editor, which needed it for leaves it did not create | **Assign `getRoot` on the leaf instance instead.** storyForge creates its one leaf and holds the only reference — zero global blast radius. |
| `WorkspaceLeaf.prototype.setPinned` | Forces re-pinning defensively if something unpins | **Call the public `leaf.setPinned(true)` once.** |
| `Workspace.prototype.iterateLeaves` | Walks detached splits | **Dead code on ≥0.15** — the body is gated behind `!requireApiVersion("0.15.0")` and never runs on 1.13. |
| `Workspace.prototype.changeLayout` | Sets a `layoutChanging` flag guarding the above | Not needed once the above is not needed. |
| `openFile` + `recordMostRecentOpenedFile` + Recent Files | Stops a permanent list of open notes flooding the quick switcher | Cosmetic. storyForge opens one file per deliberate edit, not one per visible chapter. Revisit only if it proves annoying in use. |
| `Workspace.prototype.getActiveViewOfType` | Makes commands find the inline editor | The one patch that might be wanted — see §3.7. Not in v1. |

Consequence worth knowing: on ≥0.15 the grafted leaf is **invisible to `getLeavesOfType("markdown")`**. That is good — nothing is polluted — but it means the handle in §3.3 is the only way storyForge will ever find its own editor.

### 3.3 State model

One nullable handle, owned by `ContinuousReadView`, holding: the `TFile` being edited, the section it belongs to, the split, the leaf, and the DOM node whose rendered markup was replaced. Nothing else may hold a second reference.

Mounting a new editor and committing the previous one must be **one operation on that handle**, not two call sites that each have to remember. That is the structural form of the one-live-editor rule and matches the house preference for invariants that hold by construction.

`ContinuousReadThrough.ts` must not own the editor. It exposes a hook the view calls and is told which section is locked. Keeping the virtualisation engine ignorant of the editor keeps it testable.

### 3.4 The commit ordering rule

**This is the rule most likely to lose the writer's work.** It applies on desktop; iPad makes it near-certain (§5.3).

Two observers exist and must be given different jobs:

- The **mount observer** (`rootMargin`) decides what is *rendered*. It must **refuse to unmount the locked section** while an editor is live there — skip it entirely, do not queue it.
- The **position observer** (true viewport, no margin) decides when the reader has genuinely scrolled the edited chapter away, and triggers commit.

The sequence on scroll-away: position observer fires → `leaf.detach()` → await the resulting save → release the lock → the section becomes eligible for unmount. If the commit path can throw, release the lock in a `finally` or a failed save pins a section forever.

The relevant number is **two seconds**: `requestSave` debounces that far out, so a detach within two seconds of the last keystroke is carried by the close-save path (`onUnloadFile`), not the debounce. Both are documented and both fire, but the agent should know which mechanism is doing the work, and must not assume the debounce has already run.

The lock must also survive a rebuild: `ContinuousReadView.render()` disposes and rebuilds the whole read-through, and `setState` can call it more than once. A rebuild while an editor is live must commit first. So must view close.

### 3.5 Feature detection and the fallback chain

Detect **once per session at first use** and cache the result — not per click.

**Primary (C):** `WorkspaceSplit` is constructable; the split accepts the `getRoot`/`getContainer` overrides; `createLeafInParent` returns a leaf; `leaf.view instanceof MarkdownView` after `openFile`. Any failure demotes to the fallback for the rest of the session.

**Fallback (A):** `app.embedRegistry` exists; `embedByExtension.md` is callable; the returned object duck-types to `editable`, `showEditor`, `showPreview`, `destroyEditor`; `editMode` is defined after `showEditor()`. Log `useIframe` once here. A missing `editMode.editor` degrades to mounting without a caret rather than refusing the edit. Under this path, commit is `showPreview(true)` or `destroyEditor(true)`, and Escape is already wired — `IFramedMarkdownEditor.getDynamicExtensions()` carries the remark *"Creates extension for overriding escape keymap to `showPreview`."*

**Final fallback:** today's `openFile` hand-off with a `Notice`.

At every level, a failure must leave the chapter's rendered DOM **intact**. A half-torn-down section is worse than no feature.

Add a line to `AGENTS.md`: this surface is unversioned, so an Obsidian minor is a re-verification trigger, in the same way `obsidianInternals.ts` already is.

### 3.6 Settled: block-level caret ships, character-level is deferred

**Do not ship with no caret at all.** An earlier draft recommended this on the grounds that Daily Notes Editor does not attempt caret placement. That reasoning was wrong and is withdrawn: the precedent mounts a live editor for *every* visible note, so there is no rendered-to-editable transition and a tap lands on a real CodeMirror instance — the caret goes where you tapped, natively. The precedent does not solve this problem; it does not have it. That shape is Option B, rejected in §9.

The caret problem is therefore **the price storyForge pays for choosing on demand**, and on demand was chosen for the iPadOS memory ceiling (§5.1). It is a consequence of a decision already taken, not an optional extra.

Opening at offset 0 is actively harmful, not merely unpolished. Focusing the editor scrolls its caret into view, and because the editor container expands to fit content there is no internal scrolling to absorb that — the outer container jumps to the top of the chapter. A reader taps paragraph twelve and the text slides away underneath them. See the scroll-preservation rule in §3.1, which is necessary but not sufficient on its own.

**The two halves of the problem have very different risk profiles, and `clickToEditDom.ts` already has the seam between them.**

- **Which paragraph — ships.** Take the clicked top-level element, match its `textContent` against the source blocks (§6.8), and set the caret to that block's `start`. `SourceBlock` already carries `{ text, start }`, so this is one field. Pure, deterministic, and fully unit-testable in the existing vitest setup. It yields the right paragraph, the right scroll position, and no jump.
- **Which character within it — deferred.** All the fragility lives here: `buildRenderedMapping`'s marker stripping for bold, italic, strikethrough, inline code, wikilink display text and blockquote prefixes; `renderedOffsetWithinElement`'s `TreeWalker`; and `caretRangeFromPoint` with its two-legged browser story (§5.4). None of it can be exercised outside a live app.

**Refactor required:** split `resolveClickedSourceOffset` into two exported functions — one resolving the clicked element to a `SourceBlock`, one optionally refining to a character offset within that block. Small change to a single function, it makes the robust half independently testable, and it means the fragile half can be switched off on device without unpicking anything.

Placing the caret itself is trivial under C either way: `view.editor.setCursor(view.editor.offsetToPos(offset))` — the exact code already sitting in `editChapter`, against the grafted leaf instead of `this.leaf`.

A writer who taps a paragraph to edit it will usually move the cursor regardless, so the shipped behaviour is honest about what it promises: tap a paragraph, edit that paragraph.

### 3.7 Empirical unknowns

Both concern focus and command routing, and both need device time rather than more reading:

- **`getActiveViewOfType(MarkdownView)` will not see the inline editor** without the precedent's patch, so Obsidian commands invoked while focus is inside it may target nothing. For light editing this is probably acceptable in v1. If commands are wanted, that is the one narrow, additive patch to consider — and it should be a separate decision, not slipped in.
- **`setActiveLeaf` / `activeEditor` routing.** The precedent patches it; whether storyForge needs to is the main thing to find out. Typing itself should work regardless, since focus is a DOM concern.

### 3.8 Scope fence

Do **not**: vendor the Fevol/mgmeyers detached editor; add `monkey-around`; patch any Obsidian prototype (§3.2); reference the global `app`; import from `obsidian-typings/implementations`; call `vault.modify`, `vault.process` or any other write against a chapter or codex body; write typography CSS (§4); change the host API between storyForge and the Forge Family siblings; or copy code from Daily Notes Editor (§8).

Persistence is Obsidian's, entirely. That is why this route was chosen.

---

## 4. Typography and layout

**Typography needs no work, and under C even less than under A.**

Every typography rule storyForge ships is a **paired selector sharing one declaration block** — `.markdown-reading-view p, .cm-line:not(.HyperMD-header)` reading the same `--sf-body-*` variables; `.markdown-reading-view h1, .HyperMD-header-1` reading the same `--sf-h1-*`; likewise `strong`/`.cm-strong`, `em`/`.cm-em`, and all six heading levels for size, weight, family, variation, colour, font-variant and borders. Counted mechanically: **22 paired rules, zero reading-view-only rules**, with `:not(#storyforge-specificity-boost)` raising specificity to beat the theme.

Those CM6 selectors are **globally scoped** — bare `.cm-line`, `.cm-strong`, `.cm-header-N`, no `.markdown-source-view` ancestor — so they match any CodeMirror instance in the document. A grafted `MarkdownView` in Live Preview is an ordinary CodeMirror instance and receives the full manuscript typography with **zero new CSS**. Do not write any.

What genuinely differs is **layout**, because storyForge sets none of it:

- **Measure / line width — the one that will be visible.** `.sf-continuous-body` sets only `min-height: 1.5em`, no width constraint, so rendered chapters run the full width of the scroll container. A `MarkdownView` brings `.cm-sizer` and Obsidian's readable-line-length handling, so the paragraph may **re-wrap at a different measure** on click. Fix with a width rule on the editor container matching the body's effective width — in `styles.css`, under a class the plugin owns, never inline from TypeScript.
- **Line-height and paragraph spacing.** Reading view uses `<p>` margins, source view uses `.cm-line` padding. storyForge sets neither. Check in the same pass.
- **Editor scrollbars.** The only asymmetric rules in the stylesheet are the scrollbar ones, scoped to `.markdown-source-view`. A grafted `MarkdownView` *is* inside a `.markdown-source-view`, so it will receive them — check whether an auto-height editor inside a scroll container should have its own scrollbar at all, and constrain if not.

Not a regression: where formatForge is absent the `--sf-*` variables are unset and both states `revert` to the theme. If a theme styles reading and source differently, that difference already exists whenever the writer switches modes on a normal file.

---

## 5. iPad

The feature must work on iPad. `manifest.json` already declares `isDesktopOnly: false` and there is no `@electron/remote` usage on this branch, so nothing blocks it. But there are **zero** `Platform.*` references in `src/` today — drag reordering happens to use pointer events, which is the right primitive, so this has been survivable by luck rather than design.

### 5.1 Memory

Obsidian on iPadOS runs in a single WKWebView with a hard per-process memory ceiling; exceeding it terminates the process rather than degrading. A full `MarkdownView` is not cheap, which is exactly why only one may exist at a time (§3.3) and why §9 is rejected. One editor is flat in book length and platform-independent.

Reduce `rootMargin` from `150%` to **80%**, on both platforms. The precedent runs *full editors* at 80% and ships on mobile; storyForge runs rendered markup, so 150% is generous for no clear gain. Use a named constant with a comment recording the trade.

### 5.2 Unload hysteresis

Debounce unmount by **1000ms**. The precedent does this explicitly to prevent frequent load/unload cycles, and one mechanism solves three problems at once: fast-scroll thrash, keyboard-resize thrash, and mount/unmount churn. This replaces the `visualViewport`-suppression approach proposed in earlier drafts — take the debounce instead.

### 5.3 The virtual keyboard

When the software keyboard appears the visual viewport shrinks, the `IntersectionObserver` re-evaluates, and the chapter being edited can fall outside the mount window. Today that discards rendered markup; with an editor there it discards the editor. §3.4 and §5.2 together cover this; neither alone is sufficient.

### 5.4 Caret APIs — deferred with the character-level half, but both legs are permanent

**This section does not gate the release.** Point-to-caret resolution is only needed for intra-block refinement, which §3.6 defers. Block resolution uses `element.textContent` matching and touches neither API. So the iPad caret-API question can be settled at leisure rather than on the critical path — which is a large part of why §3.6 splits where it does.

When the character-level half is picked up: WebKit only shipped the standard `caretPositionFromPoint` in **Safari 26.2**, reaching Baseline "newly available" in **December 2025**. Any iPad below that has the WebKit-proprietary `caretRangeFromPoint` and nothing else.

The current single-legged implementation is therefore the **right** leg for iPad; the desktop-durability leg is what is missing. Add `caretPositionFromPoint` as an additional branch, preferred where present. **Do not replace `caretRangeFromPoint`** — both coexist permanently. A `null` return must degrade to the block-level caret, not to a throw and not to refusing the edit; there is a long-standing report of it returning `null` on iOS in some editable contexts. Having block resolution underneath gives that degradation somewhere sensible to land.

### 5.5 Gesture — single tap, settled

WebKit reserves double-tap for zoom and word selection, and long-press for the selection magnifier. Use **single tap/click on both platforms**, with the collapsed-selection guard (§6.5) doing the discrimination rather than a gesture bar.

### 5.6 Platform work

Introduce `Platform` from `obsidian`, used only for: the `rootMargin` value if it should differ further on mobile; and scroll behaviour, since `behavior: "smooth"` inside a custom `overflow-y: auto` container fights iOS momentum scrolling — consider instant scrolling on mobile.

One check rather than code: confirm Obsidian's mobile editing toolbar appears for the grafted leaf. It is a real `MarkdownView`, so it should — that is one of C's advantages over A — but verify.

---

## 6. Prerequisite fixes

**6.1 `paint()` has no generation guard.** It runs `body.empty()` then `void MarkdownRenderer.render(...)`, discarding the promise, and is called from both `mount` and the vault `modify` handler. Two overlapping calls both empty and both append, so the second `empty()` can land mid-flight of the first render and the first render's remaining output arrives into an already-cleared body. Use a per-section monotonically increasing token, checked before `empty()` and again after the render resolves. This matters more once an editor mount is a third writer into the same element.

**6.2 The entry scroll fires before anything has height.** `entrySection?.wrapper.scrollIntoView({ block: "start" })` runs synchronously at the end of construction — before the observer fires, before `cachedRead` resolves, before any chapter is painted. Every wrapper is header-height at that moment, so they are stacked near the top and the scroll cannot land. Likely cause of entry position feeling wrong. Move it into the entry chapter's first-paint continuation.

**6.3 Re-mount collapses the section for a frame.** `unmount` freezes `minHeight` from the measured wrapper height, which is right, but `mount` clears `minHeight` *before* `paint`'s awaits resolve, so the section drops to header height and yanks everything below it up. Clear `minHeight` in the paint continuation. The precedent independently arrived at the same "keep the container height" approach, which is corroboration that it is the right shape.

**6.4 The shared `Component` accumulates children for the whole session.** One `Component` is created, loaded and passed to every `MarkdownRenderer.render` call, and only unloaded in `dispose()`. Renderer children are added on every mount and never released. A **per-section child `Component`, unloaded in `unmount`**, fixes it and gives the editor a natural owner.

**6.5 The click gesture needs a selection guard.** The body click handler bails on links but not on a non-collapsed selection, so selecting a sentence to copy jumps into edit mode and destroys the selection. Guard on `getSelection()?.isCollapsed === false`.

**6.6 The vault `modify` handler runs a linear scan on every vault write.** `options.ordered.find((f) => f.path === file.path)` runs for every `modify` event vault-wide, including every backstage write storyForge itself makes. Use a pre-built `Set<string>` of the book's chapter paths, or an early `startsWith` on the book folder. Note `sections` is keyed on `file.name` captured at render time, so the key goes stale if a chapter is renamed mid-session.

**6.7 The `Component` is not owned by the view.** `new Component(); component.load()` is only released via `dispose()`. Making it a child of `ContinuousReadView` lets Obsidian's lifecycle release it even if `dispose()` is missed.

**6.8 Block resolution by content matching — load-bearing, not an improvement.** Under §3.6 this *is* the shipped caret behaviour, so it carries the whole feature rather than being the first step of a longer chain. Treat it accordingly: it deserves the same test rigour `clickToCaret.ts` already has.

`clickToCaret.ts` and its 27 tests are sound. The bug is in `resolveClickedSourceOffset`, which assumes *"the Nth rendered child of `bodyEl` corresponds to the Nth source block"*, with `splitIntoBlocks` splitting purely on blank lines. Once that desyncs by one, every offset after it is wrong — which matches the reported symptom. Cases, all plausible in prose:

- A heading directly followed by a paragraph with no blank line: **one** source block, **two** rendered children.
- A soft line break inside a paragraph: `buildRenderedMapping` emits the `\n` as a rendered character, but the DOM renders `<br>`, contributing **zero** text characters, and `renderedOffsetWithinElement` counts DOM text. Off by one per break.
- A multi-line blockquote: `LEADING_MARKER_RE` strips the marker only at offset 0, so every subsequent `> ` is emitted as rendered characters the DOM does not show.
- A fenced code block containing a blank line: **two** source blocks, **one** rendered `<pre>`.
- User-added YAML frontmatter: `createChapter` writes chapters empty so the plugin never adds it, but Obsidian's properties UI is one click away.

**Fix:** stop aligning by index and align by content. Build the rendered mapping for every source block, then match the clicked top-level element's `textContent` against the candidates' `renderedText` — exact match first, then unique prefix, falling back to index only when genuinely ambiguous. Self-correcting against every case above.

Note which cases each half is exposed to. Block resolution only cares about *which* element matched, so a soft line break or a stripped blockquote marker costs it nothing — the text still matches its block uniquely. Those cases only corrupt the intra-block character offset, which is the deferred half. That asymmetry is the reason the split in §3.6 is worth making rather than fixing both together.

Test it as a pure function against fixtures covering all five cases above plus the ambiguous one — two identical paragraphs in the same chapter, where the fallback has to choose.

---

## 7. The five transport icons

### 7.1 Cause

`forceIconSize()` and the `.sf-navigator-transport-btn svg` rule both pin the `<svg>` **box** to 25 px, and both work. The mismatch is that the glyphs occupy different fractions of their own `viewBox`. Measured by rasterising each into an identical box and taking the painted bounding box:

| Icon | viewBox | Painted extent | Fraction of box |
|---|---|---|---|
| `sf-transport-to-start` | `0 0 512 512` | 204/250 | **81.6 %** |
| `sf-transport-previous` | `0 0 512 512` | 204/250 | **81.6 %** |
| `sf-transport-next` | `0 0 512 512` | 204/250 | **81.6 %** |
| `sf-transport-to-end` | `0 0 512 512` | 204/250 | **81.6 %** |
| `sf-continuous-mode` | `0 0 26 26` | 250/250 | **100 %** |
| `sf-continuous-mode-exit` | `0 0 26 26` | 250/250 | **100 %** |

The four transport rings are a circle of r=192 with a 32-unit stroke, so their outer edge sits at 208 of 256 — inset by design. The continuous-mode ring is a filled band running to r=13 in a 26-unit box, touching all four edges. At the shared 25 px box the toggle draws at 25 px against the others' 20.3 px: **23 % wider, 52 % more area**, with a proportionally thicker ring.

### 7.2 Fix, verified

Change the two continuous-mode icons' `viewBox` from `0 0 26 26` to `-3 -3 32 32`. **No path data changes.** The 26-unit artwork then occupies 26/32 = 81.25 % of the box, matching the transport set's 208/256 = 81.25 % exactly, and because the artwork's centre (13, 13) is also the centre of a viewBox running −3 – 29 it stays optically centred. Re-measured after the change: **204 × 204 painted, centred at 125, 125 — identical to all four transport icons to the pixel.**

The inert `<path d="M0 0h26v26H0z" fill="none">` spacer should follow the new box (`M-3 -3h32v32H-3z`) or be dropped, for the file's own convention.

### 7.3 Follow-ons

- **Delete `forceIconSize()`.** Dead once the artwork matches, and the review guidelines ask for styling via CSS rather than assigned from JavaScript — so removing it clears a likely plugin-checker finding as well as a workaround. The CSS rule already does the sizing.
- **Two comments currently assert something untrue** and must change: `navigatorControls.ts`'s *"deliberately the same size as the other four (see forceIconSize below)"*, and `styles.css`'s *"so it stays exactly the same size as the other four"*.
- **`ContinuousReadView.getIcon()`** returns `ICON_CONTINUOUS_MODE`, so the tab header carries the oversized glyph too. The fix corrects it, but check against neighbouring tab icons since the tab-header size is not 25 px.
- **Add a standing rule to `iconRegistry.ts`**: new icons must match the established **painted fraction**, not merely the viewBox size. That is the invariant this bug violated, and it is recorded nowhere.

---

## 8. Attribution and licences — read before opening the reference repositories

**Daily Notes Editor (`Quorafind/Obsidian-Daily-Notes-Editor`) has no `LICENSE` file and no `license` field in `package.json`.** No licence means all rights reserved by default. **Do not copy any code from it.** Use it only as evidence that the technique works and passes Obsidian review, and for the design lessons already extracted into this brief — the 1000ms unload debounce, the 80% `rootMargin`, keeping container height on unload. Techniques are not copyrightable; expression is. Write the implementation from the public Obsidian API described in §3.

**Hover Editor (`nothingislost/obsidian-hover-editor`) is MIT**, *Copyright (C) 2018–2021 by NothingIsLost <nothingislost@fastmail.com> and others*. If any code is adapted from it, MIT requires the copyright notice and permission notice be retained in storyForge. Note that storyForge does not need `popover.ts`'s substance — the popover lifecycle, hover handling, pinning, dragging and zoom are all irrelevant here — so adaptation should not be necessary.

**Create `Code Attributions.md` in the repo root**, alongside the existing `Icon Licences.md` and `Theme Licences.md`, recording the technique lineage as courtesy regardless of whether any code is adapted:

- The grafted-`WorkspaceSplit` technique originates with **Hover Editor** by NothingIsLost and contributors (MIT), with acknowledged contributions from pjeby.
- Its application to a continuous multi-note editing surface was demonstrated by **Daily Notes Editor** by Quorafind (Boninall), from which storyForge takes design lessons but no code.
- The embed-registry fallback in §3.5 was documented publicly by **Fevol**, crediting **mgmeyers** of the Kanban plugin for the original prototype-resolution work.
- **`obsidian-typings`** by Fevol and contributors was used to verify internal API shapes.

If the agent finds itself pasting from any reference repository, stop and escalate rather than proceeding — the licence position differs per source and is not the agent's call.

---

## 9. Option B, recorded as rejected

An editor for every mounted chapter. Kept here so it is not silently re-proposed. Its prize was collapsing two rendering paths into one; §4 has since shown that prize to be smaller than it looked, since typography is already unified by construction and the paths differ only in layout. The blocker is memory on iPadOS (§5.1) and it is not a tuning problem.

---

## 10. Verification

**Desktop.** Edit, scroll away, scroll back, text persisted. Edit two chapters in one scroll session without leaving the view. Escape or click-away commits. Clicking a second chapter while the first is live commits the first. A drag-select does not trigger an edit. A wikilink click inside the editor does **not** replace the chapter (§3.1, `setPinned`). Paragraph measure does not change on click (§4). **The cycling guide still renders inside the inline editor.** Word-count history still records after an inline edit. Closing the view while an editor is live commits.

**Caret and scroll, specifically.** Tap paragraph twelve of a long chapter and confirm nothing moves: the tapped paragraph stays under your finger and the outer container does not jump to the chapter's top (§3.1). The caret lands in the tapped paragraph, not the previous or next one — test this against a chapter containing a heading with no blank line after it, a multi-line blockquote, and a fenced code block with a blank line inside, since those are the cases that break index alignment (§6.8). Test a chapter with two identical paragraphs and confirm the ambiguous fallback picks sensibly rather than silently landing in the wrong one.

**iPad, additionally.** Type with the keyboard up and confirm the chapter is not unmounted underneath you. Scroll away with the keyboard up and confirm the commit happens once and the text survives. Scroll a long book end to end and confirm Obsidian does not restart. Confirm the mobile editing toolbar appears. Confirm tap-to-edit does not fight the selection magnifier.

---

## 11. Write-guard status

Clean on this branch: `renderContinuousReadThrough` only ever reads chapter bodies via `cachedRead`, and the header rename routes through `renameChapterTitle` → `modifyBookFrontmatter` → backstage. §2 was chosen specifically to keep it that way — every write in this feature is performed by Obsidian's own `TextFileView` save path, none by the plugin. Any proposal that reintroduces a chapter-body write should be escalated to Kenny rather than implemented.
```

## Appendix C: Round 2 — prompt (full text)

> Written by this agent after Kenny's detailed bug report, published as a Claude Artifact,
> and handed to the same research process by Kenny.

```markdown
# storyForge — inline click-to-edit doesn't integrate with the continuous scroll

**Branch**: `feature/layout-selector-codex-focus`, repo `https://github.com/KennyRN/storyForge`.
**As of commit**: `1a7dec2` ("Give the grafted editor a bounded height instead of fighting
CodeMirror") — everything described below is live on that commit, pushed to `origin`.
**Supersedes**: nothing — this is additive to the earlier inline-editor-mount research (the brief
that established the `WorkspaceSplit` grafting technique; see §1 for a summary of what it already
settled, since that reasoning still holds and shouldn't be revisited). That earlier research is
what unblocked the graft existing at all; this brief is about what's wrong with it now that it
works well enough to reveal the next layer of problems.

This document is intentionally long. The previous round of this exact problem (mounting a real
editor inline) went through three live-tested, wrong guesses before landing on a partial fix, each
one only diagnosable after asking the user to paste a live DOM dump. That was expensive and slow.
The goal here is to front-load enough detail that a research pass can reason about the actual
mechanism — CodeMirror 6's viewport/virtualisation model — rather than repeating that trial-and-error
loop a fourth time.

---

## 1. What's already settled (do not re-litigate)

A prior research pass already answered "how do you get a real, auto-saving Obsidian editor into
arbitrary plugin DOM" and the answer is in production now:

- `Editor`/`MarkdownView` have no public standalone constructor; `Workspace.createLeafInParent`
  only accepts a `WorkspaceSplit` already in Obsidian's layout tree. There is no way around this
  via documented API alone.
- The working technique (`src/view/graftedEditor.ts`, reproduced in full in §3): construct a
  `WorkspaceSplit` directly (`new WorkspaceSplit(app.workspace, "vertical")` — the one unofficial
  line, since the constructor's argument shape isn't in the public typings even though the class
  itself is exported and public), override its `getRoot()`/`getContainer()` **on that one instance**
  (both ordinary, overridable methods) to point at the real workspace root, insert its `containerEl`
  into arbitrary plugin DOM, then call the real, public `createLeafInParent(split, 0)`. Everything
  downstream — `leaf.openFile()`, the editor, saving — is ordinary, unpatched Obsidian.
- This technique is precedented: Hover Editor (MIT) uses it for popovers; Daily Notes Editor uses it
  for a continuous scroll of multiple editable notes, which is the same shape storyForge needs.
  Neither is copied from — storyForge's version is written from the public API surface.
- An alternative technique (constructing a *detached* CodeMirror editor not backed by any real
  file — the "Embeddable Markdown Editor" that Obsidian Tasks/QuickAdd/Full Calendar vendor) was
  considered and **rejected**: it isn't file-backed, so persisting it would mean the plugin calling
  `vault.modify` directly on a chapter body. storyForge has a hard rule (the "write-guard tenet",
  see §5) against exactly that. This is why the `WorkspaceSplit` graft — which produces a *real*
  `MarkdownView`, saved by Obsidian's own machinery — was chosen over the more commonly-vendored
  technique. **Do not suggest reverting to the detached-editor technique**; it's disqualified by a
  hard project constraint, not a preference.
- Mounting one editor **per visible chapter, always on** (rather than on-demand, one at a time) was
  also considered and rejected, for memory reasons on iPad (a full `MarkdownView` per chapter, in a
  book that could be dozens of chapters long, is too heavy to keep alive simultaneously).

**What this means**: the graft itself — getting a real `WorkspaceLeaf`/`MarkdownView` to exist,
attached to the right file, saving correctly — works and should not be redesigned. The problem this
brief is about is entirely downstream of that: **how that editor's DOM behaves once it's there.**

---

## 2. The feature, restated

storyForge's "continuous read-and-write mode" (`src/view/ContinuousReadThrough.ts`, hosted in
`src/view/ContinuousReadView.ts`, a main-editor-pane `ItemView`) renders every chapter in a book as
one long, virtualised scroll — chapters mount/unmount via `IntersectionObserver` as the reader
scrolls, so a very long book doesn't cost proportionally more DOM. Chapters are rendered read-only
(`cachedRead` + `MarkdownRenderer.render`) when not being edited.

Clicking into a chapter's rendered text is meant to make that one chapter, in place, become a real
editable surface — the user's own words for the intended feel: **"touch-edit here, touch-edit
there," without ever leaving the scroll.** Multiple chapters can be edited in sequence within one
continuous scrolling session. Only one chapter is ever live at a time; scrolling the edited chapter
out of view, clicking a different chapter, pressing Escape, or closing the view all commit it back
to rendered markup.

This much works correctly today: click-to-caret block resolution (`src/clickToCaret.ts`,
`src/view/clickToEditDom.ts` — fully unit-tested for the block-matching, not for the DOM parts, see
that file's own doc comments for why), the lock/unlock lifecycle that keeps a section mounted and
un-virtualised while it's being edited (`ContinuousReadThrough.ts`'s `lockSectionForEditing`/
`unlockSection`, §4 below), the one-live-editor-at-a-time invariant, and commit-on-scroll-away/
click-away/Escape/close (`ContinuousReadView.ts`'s `editChapter`/`commitActiveEdit`, §4 below). The
graft itself produces a real, correctly-saving `MarkdownView`. **None of that is in question.**

What's wrong is purely how the grafted editor's DOM looks and behaves once it's sitting inside the
continuous scroll, which is the subject of this brief.

---

## 3. The current implementation, in full

`src/view/graftedEditor.ts` (complete, current):

```ts
import { App, MarkdownView, TFile, WorkspaceLeaf, WorkspaceSplit } from "obsidian";

interface GraftableSplit extends WorkspaceSplit {
	containerEl: HTMLElement;
}

export interface GraftedEditorHandle {
	leaf: WorkspaceLeaf;
	view: MarkdownView;
	destroy: () => void;
}

export async function graftEditor(
	app: App,
	container: HTMLElement,
	file: TFile,
	cursorOffset: number,
): Promise<GraftedEditorHandle | null> {
	let split: GraftableSplit | null = null;
	try {
		const SplitCtor = WorkspaceSplit as unknown as new (workspace: App["workspace"], direction: "vertical" | "horizontal") => GraftableSplit;
		split = new SplitCtor(app.workspace, "vertical");

		const realRoot = app.workspace.rootSplit;
		const realContainer = realRoot.getContainer();
		split.getRoot = () => realRoot;
		split.getContainer = () => realContainer;

		split.containerEl.addClass("sf-grafted-editor");
		container.appendChild(split.containerEl);

		const leaf = app.workspace.createLeafInParent(split, 0);
		await leaf.openFile(file, { active: true, state: { mode: "source", source: false } });
		await leaf.loadIfDeferred();

		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			throw new Error("grafted leaf did not produce a MarkdownView");
		}

		leaf.setPinned(true);
		view.editor.setCursor(view.editor.offsetToPos(cursorOffset));
		view.editor.focus();

		const containerEl = split.containerEl;
		return {
			leaf,
			view,
			destroy: () => {
				leaf.detach();
				containerEl.remove();
			},
		};
	} catch (err) {
		console.error("storyForge: could not graft an inline editor — falling back", err);
		split?.containerEl.remove();
		return null;
	}
}
```

`container` here is a chapter's own rendered-body `<div>` (class `sf-continuous-body`), emptied
first by `ContinuousReadThrough.ts`'s `lockSectionForEditing` (see §4). `{ mode: "source", source:
false }` opens in Live Preview specifically (not raw source mode), on the theory that Live Preview
looks closer to the rendered markup it's replacing.

The current CSS (`styles.css`, the only rule governing the graft's box):

```css
.sf-grafted-editor {
	height: 70vh;
}

.sf-grafted-editor .view-header,
.sf-grafted-editor .workspace-tab-header-container {
	display: none;
}
```

`.sf-grafted-editor` is the class added to `split.containerEl` — the outermost node of the grafted
`WorkspaceSplit`. Giving *it* one real, bounded height is enough for Obsidian's own stock CSS
(`.workspace-leaf`, `.workspace-leaf-content`, `.view-content`, `.markdown-source-view`,
`.cm-editor`, `.cm-scroller`, all built on `height: 100%` chains) to resolve correctly all the way
down, since 100% of a real number is well-defined where 100% of nothing (an ordinary content-flow
`<div>`, which is what `container` is) is not. `.view-header` (Obsidian's per-leaf breadcrumb/title
bar) and `.workspace-tab-header-container` (a single-tab strip) are hidden as redundant chrome — the
chapter's own header (rendered separately, outside the grafted split, by
`ContinuousReadThrough.ts`) already shows the title.

---

## 4. The surrounding lifecycle (for context — this part is not the problem)

`ContinuousReadThrough.ts` tracks one `locked: boolean` per chapter section. `lockSectionForEditing`
empties the section's rendered body and returns the empty container for `graftEditor` to mount into;
the section's mount-observer `unmount()` refuses to touch a locked section at all, so virtualisation
can't rip the live editor out from under the user while they're scrolled near it. `unlockSection`
reverts back to normal rendered virtualisation once the editor commits. `ContinuousReadView.ts` owns
the one live editor as a nullable `activeEdit` field; `editChapter()` commits whatever was
previously live (if anything) before locking and grafting the new one — mounting a new editor and
committing the previous one is one operation, never two independent call sites. Commit triggers:
Escape (a `keydown` listener added directly to the grafted view's `containerEl`), the position
observer reporting the locked chapter has scrolled to zero visibility in the *true* viewport
(distinct from the wider-margin mount observer), clicking a different chapter, or the view itself
closing/rebuilding.

Scroll-position preservation around the mount: `editChapter()` reads `scrollEl.scrollTop` before
calling `graftEditor`, and restores it immediately after the `await` resolves — `scrollEl` here is
`ContinuousReadThrough.ts`'s outer `.sf-continuous-scroll` container (the thing that actually
scrolls for the whole continuous view; the grafted editor's own `.cm-scroller` does **not**
currently scroll independently of it in a way that was intentional — see §6).

None of this — the lock/unlock bookkeeping, the one-editor invariant, the commit triggers, the
scroll-position save/restore around the mount call — is implicated in the bug below. It's included
so a research pass has the full call graph rather than reasoning about `graftEditor` in isolation.

---

## 5. Hard constraints (apply to any proposed fix)

- **Write-guard tenet.** storyForge must never call `vault.modify`/`vault.process` (or any other
  plugin-issued write) on a chapter or Codex note body, anywhere, ever. The only vault writes the
  whole plugin performs are new-file creation and specific backstage-frontmatter fields (chapter
  order, chapter title on rename) — never a chapter's own content. This is why the graft must
  produce a *real* Obsidian-managed `MarkdownView` (saved by its own `TextFileView` machinery) —
  any fix must preserve this. A fix that routes through a non-file-backed editor and has the plugin
  save its content itself is a non-starter regardless of how well it solves the rendering problem.
- **No prototype patching.** No `Workspace.prototype`/`WorkspaceLeaf.prototype` monkey-patches, no
  `monkey-around` dependency, no code that assumes/references a global `app` (the plugin always has
  a real `App` instance passed through). Per-instance overrides (as already done to `getRoot`/
  `getContainer` on the one grafted split) are fine; anything with wider blast radius is not.
- **Minimise additional unofficial API surface.** The graft already reaches one step past the
  public typings (the `WorkspaceSplit` constructor's argument shape). Adding more undocumented
  reliance is acceptable if it's the only way, but should be called out explicitly and isolated (as
  `graftedEditor.ts` already isolates its one unofficial line) rather than spread across the
  codebase. `AGENTS.md` already tracks this file as a "re-verify on an Obsidian minor bump" surface
  alongside `src/obsidianInternals.ts` (DOM selectors for native chrome) — a fix can extend what's
  tracked there, but should keep the risk auditable in one place.
- **Desktop first, but mobile matters eventually.** `manifest.json` declares `isDesktopOnly: false`.
  The immediate problem and this brief are about desktop behaviour; a proposed fix doesn't need to
  solve iPad-specific virtual-keyboard/touch-scroll interactions, but shouldn't foreclose them
  either (e.g. don't propose something that only works with mouse-wheel scroll semantics).
- **`tsc`/vitest must stay green.** Standard project hygiene — no test framework changes, no new
  runtime dependencies without a strong reason (CodeMirror's own packages, `@codemirror/state`
  `^6.5.0` and `@codemirror/view` `^6.38.6`, are already project dependencies and fair game to
  import directly if a fix needs to reason about CM6 types).

---

## 6. The bug, in the user's own words

> "There's an issue when I select text the paragraph I selected that paragraph doesn't remain in
> the same position as when I selected it. Also the formatting changes. The borders are wider, the
> line spacing more, and the entire chapter appears in its own scrolling pane. So if I select near
> the end of Chapter 2 I can scroll up from there and the bottom part which shows Chapter 3 doesn't
> scroll off the screen whilst the chapter 2 pane is scrolling up. It's not until I reach the
> Chapter 1 area does chapter 2 break out of that pane and chapter 3 disappears."

("Select" here means clicking into a chapter to start editing it, not a text-selection drag — this
was confirmed to be describing the click-to-edit transition, not a separate selection-triggered
bug.)

Translated into the mechanism described in §3:

1. **Position jump on entering edit mode.** The instant a chapter becomes the grafted editor, its
   box in the page is a different height and shape than the rendered markup it replaced (bounded to
   `70vh` vs. whatever the natural rendered height was), so the paragraph the user clicked visibly
   moves — sometimes off-screen entirely, since the box's top edge is anchored where the rendered
   content's top edge was, not where the click happened.
2. **Visual/typographic mismatch.** The grafted editor looks like a *different document* from the
   surrounding rendered chapters: wider borders (see §7 — likely Obsidian's own leaf/view chrome,
   now visible as a distinct box, rather than anything storyForge added deliberately) and looser
   line spacing (CM6's `.cm-line` block model doesn't carry the same margin/line-height as the
   rendered `<p>` elements even though both are targeted by storyForge's own paired typography rules
   — see §7).
3. **Nested-scroll UX break.** Because `.sf-grafted-editor` is a bounded `70vh` box with its own
   internal scrollbar, sitting inside the outer `.sf-continuous-scroll` that scrolls the rest of the
   continuous view, the reader experiences **two independent scroll regions stacked on top of each
   other**. Scrolling while the mouse/trackpad focus is over the edited chapter scrolls *that box*
   first; the chapters above and below it (part of the outer scroll, unaffected) stay fixed on
   screen until the inner box's own scroll is exhausted in that direction. This is the "Chapter 3
   doesn't scroll off screen until I reach the Chapter 1 area" observation — the user is scrolling
   *inside* Chapter 2's box the entire time, and the outer page only starts moving once that inner
   scroll bottoms/tops out.

(3) is the one that most breaks the "continuous scroll" premise of the feature — (1) and (2) are
jarring but momentary; (3) actively contradicts "one continuous scroll" for as long as a chapter is
being edited.

---

## 7. Root cause (already diagnosed, twice, the hard way)

**CodeMirror 6 decides which lines are worth having in the DOM by checking what's actually visible
on screen (an intersection/viewport calculation against its own scrolling element), not by
consulting the container's declared CSS height.** This was established empirically across two
earlier failed attempts on this same branch, in order:

**Attempt A — CSS-only, `height: auto` cascaded down the whole chain**
(`.workspace-split`/`.workspace-leaf`/`.view-content`/`.markdown-source-view`/`.cm-editor`/
`.cm-scroller` all forced to `height: auto; overflow: visible;`, on the theory that an
honestly-content-sized container would just show everything). Result: **the editor box collapsed to
zero height and rendered nothing at all.** A `.cm-scroller` that never gets a concrete, non-zero
height to measure gives CodeMirror nothing to compute a viewport from, and it appears to conclude
"nothing needs rendering" rather than defaulting to "render everything."

**Attempt B — force an oversized height, then measure and snap down via `ResizeObserver`**
(`.cm-scroller` set to `20000px` on mount, so CodeMirror would have generous room to render the
whole chapter at least once; a `ResizeObserver` on `.cm-content` then snapped the scroller's height
down to `content.scrollHeight + 24` and kept it in sync as the document changed). Result, captured
via a live DOM dump the user pasted back (reproduced in full below since it's the actual ground
truth this whole diagnosis rests on): `.cm-scroller` had grown to **`height: 27126px`**, with a
**`.cm-gap` element sized `4168.27px`** inside `.cm-content` (CodeMirror's own placeholder for
lines it has deliberately chosen *not* to render, keeping scroll math consistent) and
**`padding-bottom: 13563px`** on `.cm-content` itself. Only four real paragraphs of a much longer
chapter had actual `.cm-line` DOM. The editor had *not* rendered "everything" — it had rendered a
window near wherever it considered the visible viewport to be, and reserved a huge amount of blank
virtualised space for the rest. Inflating the container's height did not change CodeMirror's opinion
of what's visible; it just moved the (still-small) rendered window around inside an increasingly
enormous mostly-empty box, which is indistinguishable from "the chapter went blank" from the user's
side, depending on where the real content happened to land relative to the visible page.

Relevant excerpt of that DOM dump (trimmed to the structurally interesting parts — the full capture
is in this session's transcript if more of it is needed):

```html
<div class="workspace-split mod-vertical sf-grafted-editor">
  <div class="workspace-leaf">
    <div class="workspace-leaf-content" data-type="markdown" data-mode="source">
      <div class="view-header">...</div>
      <div class="view-content">
        <div class="markdown-source-view cm-s-obsidian mod-cm6 ... is-live-preview ...">
          <div class="cm-editor ...">
            <div class="cm-scroller" style="height: 27126px;">
              <div class="cm-sizer">
                <div class="inline-title" ...>esna_chapter-aab</div>
                <div class="metadata-container" ...>...</div>
                <div class="cm-contentContainer">
                  <div class="cm-content cm-lineWrapping" style="padding-bottom: 13563px;" ...>
                    <div class="cm-line">When I came to the vast cavernous bright room...</div>
                    <div class="cm-line"><br></div>
                    <div class="cm-line cm-active">Some fruits from those nightmare branches...</div>
                    <div class="cm-line"><br></div>
                    <div class="cm-line">All the long plank tables...</div>
                    <div class="cm-line"><br></div>
                    <div class="cm-line">There was a vast difference between the room...</div>
                    <div class="cm-gap" style="height: 4168.27px;"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="markdown-reading-view" style="display: none;">...</div>
      </div>
    </div>
  </div>
</div>
```

**Attempt C — the current, live state — bounded height, CodeMirror's own natural scrollbar**
(`.sf-grafted-editor { height: 70vh; }`, everything else reverted to Obsidian's stock CSS). This is
the only one of the three that actually works in the sense that CodeMirror correctly virtualises
against a real, honest viewport (its own `70vh` box) and renders/derenders lines correctly as the
user scrolls *within that box*. It's also the one described in §6 — it works, but produces a
visually and behaviourally separate "pane within the page" rather than feeling like part of one
continuous scroll.

**The throughline across all three attempts**: nothing has yet found a way to have CodeMirror treat
the *outer* continuous-scroll container (`.sf-continuous-scroll`, which does genuinely scroll, and
is the thing the rest of continuous mode's virtualisation is built around) as its own effective
viewport, rather than either (a) its own undersized/non-existent scroller, or (b) an artificially
inflated version of its own scroller that still isn't the actual scrolling context the user is
looking at.

---

## 8. What's actually wanted

A chapter, once clicked into, should become a real, editable, auto-saving CodeMirror surface that:

1. **Shows its entire content**, without its own internal scrollbar or virtualisation boundary —
   scrolling to read/edit any part of it is just scrolling the *same* outer continuous-scroll
   container that governs every other chapter.
2. **Looks like the rendered chapter it replaced** — same effective line spacing, paragraph spacing,
   margins, no visible "box" chrome (border/background distinguishing it from the surrounding
   rendered chapters) — so entering/exiting edit mode is not a jarring visual event.
3. **Doesn't jump the reader's position** — the paragraph they clicked stays under their eye; the
   chapter's height changing (rendered height vs. editable height are rarely identical) should push
   content below it down/up smoothly, not relocate the clicked paragraph off-screen.

(1) is the load-bearing one and the actual subject of this brief; (2) and (3) are largely
consequences of getting (1) right (if the editor is genuinely just "more of the same page" rather
than a bounded pane, the visual seams in (2) become much easier to paper over with CSS, and (3)
stops being a fight against two different scroll contexts).

---

## 9. Specific avenues worth researching

None of these have been tried yet on this branch — they're starting points, not conclusions:

- **Does CodeMirror 6 expose any configuration for what counts as its "visible viewport"?**
  Obsidian constructs the `EditorView` internally (via `MarkdownView`/`leaf.openFile()`) — storyForge
  doesn't get to pass CM6 extensions into that construction directly the way it would if building a
  raw `EditorView` itself. But storyForge *does* already register global editor extensions elsewhere
  in the codebase (`src/cyclingGuide.ts`, via `app.registerEditorExtension` — a `ViewPlugin` reading
  `editorInfoField` to scope itself to specific files). Is there an equivalent CM6-level facet/
  extension — something like an oversized `viewportMargin`, or a custom `EditorView.scrollMargins`/
  measurement strategy — that could be registered the same way, scoped to just the grafted editor's
  file path (or a marker set on it), that convinces CM6 to keep a much larger rendered window than
  its default few-screenfuls margin? (`@codemirror/view`'s own source — already a project dependency
  at `^6.38.6` — is worth reading directly for whatever internal viewport-margin mechanism it uses;
  this is more promising than guessing at Obsidian-specific behaviour, since the virtualisation
  itself is stock CM6, not an Obsidian addition.)
- **Can CodeMirror's viewport be driven by the outer scroll container instead of its own?** Rather
  than trying to defeat virtualisation, redirect it: keep `.cm-scroller` non-scrolling
  (`overflow: visible`, as in Attempt A) but manually bridge the *outer* `.sf-continuous-scroll`'s
  scroll events / `IntersectionObserver` entries into calls that tell CM6 "the effective visible
  window is now at offset X" (`EditorView.requestMeasure()`, or whatever the real API turns out to
  be) — i.e., make CM6 believe it's being scrolled by proxy, rather than trying to convince it
  nothing is virtualised. This is more work but doesn't fight CM6's fundamental design the way
  Attempts A/B did.
- **Is disabling CM6 virtualisation entirely (for just this one editor instance) actually
  supported/safe?** Some CM6 configurations trade viewport virtualisation for always rendering the
  full document (reasonable for short-to-medium documents — a chapter is unlikely to be book-length
  itself). If CM6 has an official "no virtualisation" mode reachable through an `EditorView`
  extension, and Obsidian's own editor construction can be influenced to include it (even if only
  via the `registerEditorExtension` + file-scoping technique above), that would sidestep the whole
  problem rather than trying to manage virtualisation from outside.
- **If none of the above is achievable without materially more undocumented-internals risk than
  the graft already carries**: say so plainly, and instead propose the smallest set of CSS/UX
  changes that make the *current* bounded-`70vh`-box approach (Attempt C) feel as un-jarring as
  possible — e.g., matching typography closely enough that the box is barely visually distinct,
  anchoring the box's scroll position so the clicked paragraph stays under the cursor on entry, and
  accepting the nested-scroll behaviour as a known, documented limitation rather than something
  that's actively fixable. A clear verdict of "this is the ceiling without X risk, here's how to
  make peace with it" is a legitimate and useful outcome of this research — it doesn't have to end
  in a working fix.

---

## 10. What to hand back

Any of the following would be a useful outcome:

1. A concrete technique (ideally with a code sketch against the actual CM6/Obsidian APIs, verified
   against `@codemirror/view@^6.38.6` and the `obsidian` typings already in this repo's
   `node_modules`) for making the grafted editor render its whole document and scroll with the
   outer container, rather than in its own bounded pane.
2. If (1) isn't cleanly achievable: a clear explanation of *why*, specific enough that it doesn't
   need re-litigating later (e.g. "CM6's viewport margin is not part of its public extension API and
   there is no supported way to disable virtualisation" — with a citation/reference — as opposed to
   "this seems hard").
3. Failing both: the smallest, lowest-risk set of changes to make the current bounded-box behaviour
   (Attempt C, live now) feel intentional rather than accidental — closer typography, a smoother
   entry transition, honest framing of the nested-scroll behaviour as a real, permanent limitation
   rather than something still being chased.

Whichever of these it is, please write it back in the same spirit as this document: plain
statements of what's true and what was tried, not hedged possibilities — the previous research
pass's confidence (grounded in reading the actual `obsidian.d.ts` rather than guessing) is what made
the `WorkspaceSplit` graft technique trustworthy enough to ship in the first place.
```

## Appendix D: Round 2 response (full text)

> Received back from the research agent; this is what §6.1–§6.4 above is based on
> implementing.

```markdown
# storyForge — grafted editor: why it scrolls in its own pane, and how to stop it

**Answers** the brief at `1a7dec2` ("inline click-to-edit doesn't integrate with the continuous scroll").
**Verified against** `@codemirror/view@6.38.6` as installed in this repo's `node_modules` (line numbers below are `node_modules/@codemirror/view/dist/index.js`, which is the readable non-minified build), and `obsidian@1.13.1` typings. Nothing here is inferred from behaviour; all of it is read from source.
**Does not revisit** §1 of the brief. The `WorkspaceSplit` graft stands.

---

## 0. Verdict

Avenue 2 in §9 — "manually bridge the outer scroll container's events into CM6 so it believes it's being scrolled by proxy" — **does not need building. CodeMirror 6 already does exactly this, natively, and has since long before 6.38.** It measures its visible range by walking its own ancestor chain and intersecting with any ancestor that is actually scrolling, and it attaches a `scroll` listener to *every* ancestor element up to the document. An editor inside an outer scrolling container is a supported, first-class configuration.

Which makes this a pure CSS problem. The grafted editor scrolls in its own pane because `.cm-scroller` is still a scroll container with a bounded height, so CM6 correctly clamps its viewport to that box. Remove the box honestly and CM6 will re-target the outer `.sf-continuous-scroll` by itself, with no extension, no bridging, and no additional unofficial API surface.

Attempt A was the right idea and failed for two specific, findable CSS reasons, both identified below. It should be retried, not abandoned.

---

## 1. The mechanism

Three functions carry the whole answer.

**`visiblePixelRange(dom, paddingTop)` — line 5837.** This is what decides what CM6 thinks is visible. `dom` here is `view.contentDOM`, i.e. `.cm-content` (passed at line 6085, sourced at line 6044). It starts from the content's `getBoundingClientRect()`, clamps to the window, and then:

```
for (let parent = dom.parentNode; parent && parent != doc.body;) {
    ...
    if ((elt.scrollHeight > elt.clientHeight || elt.scrollWidth > elt.clientWidth) &&
        style.overflow != "visible") {
        let parentRect = elt.getBoundingClientRect();
        top = Math.max(top, parentRect.top);
        bottom = Math.min(..., parentRect.bottom);
    }
    ...
}
```

Two conditions, both required, for an ancestor to constrain the viewport: it must **actually be overflowing** (`scrollHeight > clientHeight`) **and** its computed `overflow` must not be `visible`. Any ancestor meeting both clips CM6's idea of what's on screen. `.sf-continuous-scroll` meets both. So does a 70vh `.cm-scroller`.

Today, `.cm-scroller` is the nearer clipper and it wins. That is the entire bug. CM6 is behaving correctly and always has been.

**`listenForScroll()` — line 6980.** Walks from `this.dom` upward and adds a `scroll` listener to **every** element node in the chain, not only scrolling ones:

```
for (let dom = this.dom; dom;) {
    if (dom.nodeType == 1) { ... changed.push(dom); dom = dom.assignedSlot || dom.parentNode; }
    ...
}
...
for (let dom of this.scrollTargets = changed) dom.addEventListener("scroll", this.onScroll);
```

So `.sf-continuous-scroll` scrolling already fires CM6's `onScroll` (line 6887) → `flush()` → `onScrollChanged` → `requestMeasure` → `visiblePixelRange` recomputes. The bridging work proposed in §9 avenue 2 is already written, in the library, and running.

The chain is re-derived on a timer whenever an `IntersectionObserver` on the content fires (line 6866, `setTimeout(this.listenForScroll, 1000)`), so it survives the graft being moved in the DOM.

**`getViewport(bias, scrollTarget)` — line 6152.** Renders `visibleTop − 1000px` to `visibleBottom + 1000px`, split by scroll direction. `1000` is `VP.Margin`, a compile-time constant inlined by the bundler. There is no facet, option, or extension that changes it.

---

## 2. Why Attempt A failed

Attempt A set `height: auto; overflow: visible` down the whole chain and got a zero-height editor rendering nothing. Two causes, and they compound.

**Cause 1 — `overflow: visible` on `.cm-scroller` does not compute to `visible`.** CodeMirror's own base theme, line 6526:

```
".cm-scroller": {
    display: "flex !important",
    alignItems: "flex-start !important",
    height: "100%",
    overflowX: "auto",
    ...
}
```

`overflow-x: auto` is set by the library. Per CSS Overflow 3, when one axis is `visible` and the other is not, **the `visible` computes to `auto`**. So `overflow-y: visible` on `.cm-scroller` silently becomes `overflow-y: auto`, the element stays a scroll container, and `visiblePixelRange`'s second condition (`style.overflow != "visible"`) still passes. The clipping ancestor was never removed.

The fix is the shorthand `overflow: clip`, which sets both axes and cannot be blockified into a scroller. Note the same spec rule maps `clip` to `hidden` when paired with a scrolling axis — which is why setting both axes matters, and why `height: auto` is the load-bearing half of the pair regardless: an element with `height: auto` has `scrollHeight === clientHeight`, so `visiblePixelRange`'s *first* condition fails and the overflow value stops mattering.

**Cause 2 — the collapse came from Obsidian's leaf chrome, not from CodeMirror.** CM6's own boxes are content-sizeable: `.cm-content` is `min-height: 100%; flex-grow: 2; flex-shrink: 0` (line 6537), which against an indefinite parent resolves to content height, not zero. What zeroes is Obsidian's `.workspace-leaf` / `.workspace-leaf-content` / `.view-content` chain, which is built as flex items with `min-height: 0` inside a definite-height ancestor. Drop the definite height and `min-height: 0` lets them collapse.

Overriding those individually is a guessing game against undocumented app CSS. The precedent's answer is one declaration: **`all: unset` on `.workspace-leaf`**, which discards Obsidian's layout assumptions on the single node that carries them rather than trying to enumerate them. (`all: unset` resets `display` to `inline`, so `display: block` must be restored immediately after.)

---

## 3. Why Attempt B failed, confirmed

Already correctly diagnosed in the brief; the source confirms the mechanism. Inflating `.cm-scroller` to 20000px does not change `visiblePixelRange`'s output at all, because that function never reads a declared height — it reads `getBoundingClientRect()` and clamps to `win.innerHeight` (line 5841) and to clipping ancestors. A taller scroller just means a taller box with the same small real window inside it, which is exactly what the DOM dump shows: a 27126px scroller, four real `.cm-line`s, a 4168px `.cm-gap`, and 13563px of reserved `padding-bottom`.

---

## 4. Answers to §9's three avenues

**Avenue 1 — a registerable viewport-margin facet: no.** `VP.Margin` is a constant inlined at its two use sites (lines 6159 and 6192). `index.d.ts` exports no `viewportMargin`, no viewport facet, and no measurement-strategy hook — verified by grep against the shipped declarations. `EditorView.scrollMargins` (line 2607) is unrelated: it adjusts where `scrollIntoView` lands, not what gets rendered.

**Avenue 2 — bridging the outer container's scroll into CM6: unnecessary.** §1 above. Building it would duplicate `listenForScroll` and fight `visiblePixelRange` for control of the same measurement.

**Avenue 3 — an official "no virtualisation" mode: no.** There is no public option. The only full-document render path is `fullPixelRange` (line 5871), reached solely via `viewState.printing`, which is set from an internal `beforeprint`/`matchMedia("print")` handler (line 6901). It is not exposed and should not be forced.

That resolves §10 item 2 with a citation: **CM6's viewport margin is not configurable and virtualisation cannot be disabled through any public API.** It does not need re-litigating.

---

## 5. One correction to §8

§8 requirement (1) asks for the chapter to render "without its own internal scrollbar **or virtualisation boundary**." Drop the second half. **Virtualisation should stay, and keeping it is what makes this work.**

Once `.cm-scroller` stops clipping, CM6 virtualises against `.sf-continuous-scroll`'s viewport — the same window the reader is actually looking at, plus 1000px of margin either side. Lines materialise ahead of the reader as they scroll the outer container, and `.cm-content`'s reserved padding keeps the document's total height honest so nothing below it shifts. The reader never sees a gap. That is the correct end state, and it is also the only one that stays affordable on iPad: a 40,000-word chapter fully realised in DOM is precisely the memory profile that ruled out one-editor-per-chapter in the first place.

What must go is the *scrollbar* and the *mismatch* between CM6's viewport and the user's — not the virtualisation itself.

---

## 6. The fix

Scoped entirely under `.sf-grafted-editor`. Nothing global, no new dependency, no additional unofficial surface — `all: unset` and `overflow: clip` are ordinary CSS.

**Height chain — every node from the split down to `.cm-content` must be content-sized.** `.workspace-leaf` gets `all: unset` plus `display: block`. `.workspace-leaf-content`, `.view-content`, `.markdown-source-view`, `.cm-editor`, `.cm-scroller` all get `height: auto`, and `.cm-editor` additionally needs `min-height: auto` (Obsidian sets `min-height: 100%` on `.markdown-source-view.mod-cm6 .cm-editor`; the precedent overrides exactly this). Remove `.sf-grafted-editor { height: 70vh }` entirely — it is the current cause, not scaffolding.

**Scrolling — `.cm-scroller { overflow: clip; }`**, shorthand, both axes, for the blockification reason in §2. Side effect worth knowing: long unwrapped lines inside fenced code blocks lose horizontal scrolling. Obsidian wraps prose by default so this affects code blocks only; if it matters, `overflow-x: auto; overflow-y: clip` is available at the cost of re-introducing the blockification hazard on the y axis — which `height: auto` already neutralises.

**Chrome — keep the two `display: none` rules you have** (`.view-header`, `.workspace-tab-header-container`) and add `.inline-title` and, if unwanted, `.metadata-container`. Both appear inside `.cm-sizer` in your DOM dump; the inline title duplicates the chapter header `ContinuousReadThrough` already renders outside the split. Obsidian's `.markdown-source-view.mod-cm6 .cm-sizer` also carries a large `padding-bottom` (the click-here-to-append affordance) which should be zeroed inside the graft.

**Do not copy one rule from the precedent.** Its stylesheet contains:

```
.dn-editor .cm-content { padding-bottom: 0 !important; padding-top: 0 !important; }
```

CM6 writes `.cm-content`'s `padding-bottom` as an **inline style** to reserve space for virtualised lines — visible as `padding-bottom: 13563px` in your own DOM dump. An author `!important` declaration outranks a normal inline style in the cascade, so that rule destroys CM6's scroll math whenever virtualisation is active. It is harmless in the precedent only because its daily notes are short enough to render whole. Chapters are not. If Obsidian's own `.cm-content` padding needs adjusting, target it without `!important`, or scope to `padding-top` alone.

---

## 7. Position anchoring (§6 item 1)

Once the box is content-sized the jump shrinks a lot, because editable height and rendered height are close. It will not be zero — Live Preview reveals markers, and the inline title and metadata container add height above the first line.

The current `scrollTop` save/restore preserves the *chapter's* top edge, which is the wrong anchor. Anchor the *clicked paragraph* instead: record `clickedEl.getBoundingClientRect().top` before `lockSectionForEditing` empties the body; after the graft resolves, get the CodeMirror view and the new screen position of the same position, then adjust `scrollEl.scrollTop` by the delta.

Getting the view needs no Obsidian internals: **`EditorView.findFromDOM(dom)` is a public static** on `@codemirror/view` (`index.d.ts:1377`), and `coordsAtPos(pos)` (`:993`) and `lineBlockAt(pos)` (`:894`) are public instance methods. `@codemirror/view` is already a direct dependency, so this adds nothing to the unofficial-surface budget tracked in `AGENTS.md`.

Order matters: `view.editor.focus()` will scroll the caret into view, and with no internal scroller `scrollRectIntoView` (line 140) walks up and scrolls `.sf-continuous-scroll` instead. Set the cursor, do the delta correction, then focus — or accept that focus's own scroll lands the caret on screen and skip the correction. Do not do both in the current order, or they will fight.

---

## 8. Typography (§6 item 2)

Mostly already solved and worth not over-engineering. storyForge's 22 paired typography rules target bare `.cm-line`, `.cm-strong`, `.cm-header-N` with no `.markdown-source-view` ancestor requirement, so the grafted editor inherits font, size, weight, colour and variant with no new CSS. What differs is block rhythm, which storyForge sets nowhere: rendered `<p>` carries margins, `.cm-line` carries padding, and `.cm-content` has CM6's own `padding: 4px 0` (line 6546). That is the "line spacing more" observation. Match `.cm-line`'s vertical rhythm to the rendered paragraph spacing inside the graft and the seam largely closes.

The "borders are wider" observation is almost certainly `.view-content`'s background plus the leaf's own box now reading as a distinct panel — the precedent sets `.view-content { background: none }` for exactly this. Check `--file-line-width` handling too: the rendered `.sf-continuous-body` has no width constraint, while `.cm-sizer` applies readable line length, so the measure changes on click independently of anything above.

---

## 9. Verification

The failure modes here are all silent, so test the mechanism directly rather than by eye. With the editor grafted and the outer container scrolled to the middle of a long chapter, `EditorView.findFromDOM(...).viewport` should report a range that tracks the outer scroll position, and `.cm-scroller` should report `scrollHeight === clientHeight`. If `scrollHeight` exceeds `clientHeight`, an ancestor is still clipping and `visiblePixelRange` is still finding it — walk the chain checking `getComputedStyle(el).overflow` and `el.scrollHeight > el.clientHeight` for each, since those are the exact two conditions the library tests.

Then: scroll from chapter 1 through the edited chapter to chapter 3 in one continuous gesture with no stall at the boundaries; confirm no `.cm-gap` is ever visible as blank space; confirm the clicked paragraph stays put on entry; and confirm a chapter longer than a few screens still renders correctly when entered near its end, which is the case Attempt B silently broke.
```
