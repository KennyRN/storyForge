# Tweaks 1 (1.12.1): the 37 tests updated mid-way

The full `test:ui` run after part 2's first build showed 37 failures. Each is listed with the change that caused it, and whether the test or the code was corrected. None was weakened: the ones marked "test" now state the new rule.

**Caused by §6.1 (the storytelling side now has two selectors, so `.sf-select-current*` matched two elements): the test was scoped to `.sf-select--chapters`.**
1. appearance.ui `four parts…` (test); 2. appearance.ui `a font changes only its own part…` (test); 3. defaultRules.ui `one shadow for every floating surface` (test); 4. menus.ui `a change writes project.md` (test); 5. menus.ui `padded numbering` (test); 6. navigator.ui `the selector has no chevron…` (test); 7. navigator.ui `the chapter dropdown: choosing a chapter` (test); 8. navigator.ui `an open chapter that isn't in the list` (test); 9. navmenu.ui `where you are is a highlighted row` (test); 10. navmenu.ui `clicking the chevron, the selector…` (test); 11. navmenu.ui `the chapter list's and the closed selector's text start at the Codex card's left edge` (test); 12. storytelling.ui `opens with the navigator…` (test); 13. storytelling.ui `the chapter selector expands…` (test); 14. storytelling.ui `where you were comes back` (test); 15. storyforge.ui `one control flips between the faces` (test); 16. chapterContext.ui `choosing a chapter in the overview…` (test); 17. tweaks1.ui `the storytelling side: the chapter selector's text is the Codex card's left edge` (test).

**Caused by §6.1, which made the novel name a selector instead of a button: the code keeps `sf-nav-novel` on the name's text, so these needed no test change (checked by re-running).**
18. appearance.ui `size is a slider…`; 19. diagnostics.ui `Diagnostics shows the diagnostic page`; 20. menus.ui `File ▸ Open Recent opens that project`; 21. menus.ui `View: Flip Side and Show or Hide Context`; 22. navigator.ui `shows the series name, the novel's name and the chapter selector`; 23. spacing.ui `the series name and the novel's name sit 4px apart`; 24. titles.ui `the series name and the novel's title are green text`.

**Caused by §6.1, which removed the novel name as a route to the novel tab: the test now calls the model's route (`openLibraryTab`) or checks the selector.**
25. navigator.ui `the series and novel names are buttons…`; 26. navigator.ui `keyboard focus alone gives the selector the green ring` (the novel selector is first in the tab order); 27. routes.ui `the storytelling side's novel name lands on the novel tab`; 28. routes.ui `going from the novel tab to the series tab…`; 29. chapterContext.ui `clicking the novel name on the storytelling side…`.

**Caused by Tweaks 1 §1.4 (the novel selector lists placed novels only): the test's expectation was stale from part 1.**
30. routes.ui `opens from the novel's name, lists the placed novels…`.

**Caused by §3.2 (PoV and Location are buttons, no `.sf-ref` links, no opening of notes) and §2: expectations rewritten.**
31. chapterContext.ui `a chapter with no PoV of its own shows the default`; 32. chapterContext.ui `the PoV picker sets a chapter's PoV` (now several, same bytes); 33. chapterContext.ui `a reference to a note that is gone`; 34. chapterContext.ui `a name in the PoV row opens that note` (now: opens nothing); 35. gfm.ui `a link in a field…` (now inert).

**Caused by §3.5 (the + box rests in the tabs' colour): the expected colour is `--purpose-codex-rest`.**
36. round5.ui `the unplaced novels have no chevron…` (the second + assertion, on chapters, in the same file was adjusted too).

**Caused by §3.2's taller rows (the PoV and Location pair rose above the 48px line): the code was corrected (the buttons' vertical padding is 0); the test is unchanged.**
37. tweaks1.ui `the chapter information box's top is level with the synopsis box's…`.

Also changed later, not in the 37: `novelContext.ui` `the progress bar and every chapter bar keep their height…` now polls for the panel to settle before checking the last bar.
