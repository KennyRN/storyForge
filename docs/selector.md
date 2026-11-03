# The chapter selector (Fix 7, decision 97; ships 1.6.2)

Styling only; no survey (decision 105). What was built, in `faces/faces.css` and `faces/navigator.ts`:

- **Contrast checked first:** the accent (green `#a7c080`) on `bg1` (`#3a464c`, `--purpose-raised-bg`) is 4.86:1, so above 4.5:1; on the panel's `bg_dim` it is 6.61:1.
- **No chevron.** The icon is gone from the selector button.
- **No fill at rest.** A `bg1` fill on hover and while the list is open, with 10 px corners (the cards').
- **Edges as the Codex card's.** The selector's box (and so the fill and the list) runs from the card's left edge (the strip's width plus 8 px: `--space-4 + 30px`) to its right (`max(12px, 10%)` of the panel's width). To make that exact the navigator has no side padding of its own; the series and novel lines carry the same margins as before. The selector's title sits 10 px inside the fill, so it no longer lines up with the novel's name above it (the lines start at 16 px, the title at 56 px): a result of decision 97 as written, for Kenny's look.
- **One raised piece when open.** The button is rounded at the top corners only and the list at the bottom corners only (square where they join), both `bg1` and on the same edges.
- **Focus:** the green ring (`--purpose-accent`) and no fill from focus alone.
- **No transition** is set, so reduced motion has nothing to switch off; a test reads `transition-duration`.
- **Screen readers:** unchanged: a button with `aria-haspopup` and `aria-expanded`, its name "Chapters".
- The old test that expected the list to be the panel's full width now expects the card's edges. Pictures: `docs/selector-shots/` (rest, hover, focus, open).
