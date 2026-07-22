# storyForge text label reference

Generated 2026-07-13. Use the ID column when requesting wording changes — e.g. "change settings.topActions.hideSeriesPane.desc to '...'"

Notes on conventions used below:
- Rows marked **(template)** contain a fixed literal portion plus a runtime-interpolated value (e.g. an error message, a count, or a path). Only the fixed portion is meant to be edited; the "Current text" column shows the literal source exactly, with the interpolation left as `${...}`.
- Rows marked **(shared)** originate from one function that renders the same literal string into more than one place in the UI (e.g. a helper reused for both the Unplaced pane and the Codex pane). The single file:line given is the one and only place to edit; editing it changes all the places it's rendered.
- Line numbers are exact as of the HEAD commit at generation time (`1501e37`). Re-verify with `grep -n` if the file has changed since.

## src/view/StoryForgeView.ts

| ID | Current text | Line |
|---|---|---|
| view.storyForgeView.displayText | storyForge | 44 |
| notice.createCodexFolder.error | storyForge: could not create folder — ${...} (template) | 244 |
| notice.createCodexFile.error | storyForge: could not create file — ${...} (template) | 253 |

## src/view/TopPanel.ts

| ID | Current text | Line |
|---|---|---|
| topPanel.seriesLine.settingsBtn.ariaLabel | Series settings | 50 |
| topPanel.bookLine.synopsisBtn.ariaLabel | Synopsis and plot | 73 |
| topPanel.noBookSelected.emptyText | Open a chapter to get started. | 95 |
| topPanel.unplacedHeader.newBtn.ariaLabel | New (shared) — used by both the "Unplaced Novels" and "Unplaced Chapters" headers | 149 |
| topPanel.unplacedHeader.archiveBtn.ariaLabel | Archived chapters (shared label; only wired up for the "Unplaced Chapters" header) | 161 |
| notice.createChapter.error | storyForge: could not create chapter — ${...} (template) | 175 |
| notice.createBook.error | storyForge: could not create book — ${...} (template) | 183 |
| topPanel.seriesList.emptyOrdered.text | Drag a book here to sequence it. | 213 |
| topPanel.seriesList.unplacedHeader.label | Unplaced Novels | 220 |
| topPanel.bookList.orderedRow.archiveMenuItem | Archive | 270 |
| topPanel.bookList.emptyOrdered.text | Drag a chapter here to sequence it. | 286 |
| topPanel.bookList.unplacedHeader.label | Unplaced Chapters | 293 |
| topPanel.bookList.unplacedRow.archiveMenuItem | Archive | 315 |

## src/view/BottomPanel.ts

| ID | Current text | Line |
|---|---|---|
| bottomPanel.codex.header.label | Codex | 41 |
| bottomPanel.codex.header.hiddenLabel | codex hidden | 41 |
| bottomPanel.codex.newFileBtn.ariaLabel | New file | 46 |
| bottomPanel.codex.newFolderBtn.ariaLabel | New folder | 54 |
| bottomPanel.codex.archiveBtn.ariaLabel | Codex archive | 62 |
| bottomPanel.codex.emptyText | Nothing here yet. | 76 |

## src/view/RecommendationView.ts

| ID | Current text | Line |
|---|---|---|
| recommendView.displayText | Story Context | — |
| recommendView.tab.chapter | Chapter | — |
| recommendView.tab.continuity | Continuity | — |
| recommendView.refresh.ariaLabel | Refresh story context | — |
| recommendView.empty.noChapter | Open a chapter to see story context. | — |
| recommendView.section.synopsis | Synopsis | — |
| recommendView.sendPlot | Send to chapter plot | — |
| recommendView.section.characters | Characters in chapter | — |
| recommendView.section.unknown | Named but not in Codex | — |
| recommendView.stubBtn | Create in Codex | — |
| recommendView.section.other | Other Codex references | — |
| recommendView.section.descriptions | Descriptions | — |
| recommendView.section.facts | Fact warnings | — |
| recommendView.section.continuity | Book continuity | — |
| recommendView.building | Building… | — |
| notice.recommend.synopsisSent | storyForge: synopsis sent to chapter plot | — |
| notice.recommend.factUpdated | storyForge: Codex fact updated | — |
| notice.recommend.factAck | storyForge: fact change acknowledged | — |

## src/view/StoryForgeSettingsTab.ts (recommendations)

| ID | Current text | Line |
|---|---|---|
| settings.recommendations.unknownNames.name | Unknown name suggestions | — |
| settings.recommendations.unknownNames.desc | List proper names found in the chapter that are not in the Codex. | — |
| settings.recommendations.factsHeading.name | ${label} facts heading (template) | — |
| settings.recommendations.factsHeading.desc | H2 section title in ${label} Codex notes (e.g. Facts). (template) | — |
| bottomPanel.codex.folderRow.archiveFolderMenuItem | Archive Entire Folder | 142 |
| bottomPanel.codex.folderRow.removeFolderMenuItem | Remove Folder and Keep Items | 143 |
| bottomPanel.codex.fileRow.archiveMenuItem | Archive | 191 |

## src/view/StatsPanel.ts

| ID | Current text | Line |
|---|---|---|
| statsPanel.modeLabels.daily | daily wordcount | 10 |
| statsPanel.modeLabels.weekly | weekly wordcount | 11 |
| statsPanel.modeLabels.chapter | chapter wordcount | 12 |
| statsPanel.modeLabels.story | story wordcount | 13 |
| statsPanel.header.title | Stats | 31 |
| statsPanel.exchangeBtn.ariaLabel | switch wordcount | 42 |
| statsPanel.calendarBtn.ariaLabel | wordcount history | 50 |

## src/view/WordCountModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.wordcount.title | Wordcount History | — |
| modal.wordcount.rollupLabel | All novels | — |
| modal.wordcount.daysTitle | Days | — |
| modal.wordcount.weeksTitle | Weeks | — |
| modal.wordcount.emptyDay | No chapter activity this day. | — |

## src/view/SeriesModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.series.titleInput.placeholder | Series Name | 34 |
| modal.series.booksHeader | Books | 43 |
| modal.series.hint | # inserts a counted number\n// breaks title into title and subtitle | 48 |
| modal.series.addBookBtn.ariaLabel | New book | 50 |
| modal.series.emptyBooks.text | No books yet. | 62 |
| notice.seriesModal.createBook.error | storyForge: could not create book — ${...} (template) | 110 |

## src/view/BookSynopsisModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.bookSynopsis.title | Synopsis | 17 |

## src/view/ArchiveModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.archive.title | Archived Chapters | 73 |
| modal.archive.emptyText | No archived chapters. | 76 |
| modal.archive.unarchiveBtn.ariaLabel | Unarchive | 91 |

## src/view/CodexArchiveModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.codexArchive.title | Archived Codex Items | 55 |
| modal.codexArchive.emptyText | No archived codex items. | 58 |
| modal.codexArchive.folderRow.label | ${entry.name} (folder with ${entry.childCount ?? 0} children) (template — fixed suffix is " (folder with {n} children)") | 66 |
| modal.codexArchive.unarchiveBtn.ariaLabel | Unarchive | 71 |

## src/view/SeriesOnboardingModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.seriesOnboarding.title | Welcome to storyForge | 24 |
| modal.seriesOnboarding.hint | Are you writing a series, or a single standalone book? | 25 |
| modal.seriesOnboarding.titleInput.placeholder | Series name | 31 |
| modal.seriesOnboarding.startSeriesBtn | Start my series | 42 |
| modal.seriesOnboarding.standaloneBtn | Just one book (no series) | 45 |

## src/view/ConvertToSeriesModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.convertToSeries.title | Convert to a series | 23 |
| modal.convertToSeries.hint | Name your series — you can rename it later. | 24 |
| modal.convertToSeries.titleInput.placeholder | Series name | 30 |
| modal.convertToSeries.submitBtn | Convert to series | 41 |

## src/view/StoryForgeSettingsTab.ts

### Module-level constants

| ID | Current text | Line |
|---|---|---|
| settings.fontWeightOptions.light | Light (shared dropdown option — every "font weight" / "*weight" dropdown in this file uses this list via `bindFontWeightDropdown`) | 14 |
| settings.fontWeightOptions.normal | Normal (shared, see above) | 15 |
| settings.fontWeightOptions.medium | Medium (shared, see above) | 16 |
| settings.fontWeightOptions.semiBold | Semi Bold (shared, see above) | 17 |
| settings.fontWeightOptions.bold | Bold (shared, see above) | 18 |
| settings.fontWeightOptions.extraBold | Extra Bold (shared, see above) | 19 |
| settings.fontWeightOptions.black | Black (shared, see above) | 20 |

### Shared helpers (`bindColorSwatchButton`, `renderHeaderStyleGroup`, `renderFontCard`, `renderDividerCard`)

| ID | Current text | Line |
|---|---|---|
| settings.colorSwatchButton.ariaLabel | Choose colour (shared aria-label on every colour-swatch button in this file, ~20 call sites) | 72 |
| settings.headerStyleGroup.headerSize.name | Header size (shared) — renders in both Unplaced pane (call at line 1112) and Codex pane (call at line 1207) | 148 |
| settings.headerStyleGroup.headerSize.desc | size of header label and icon (shared, see above) | 149 |
| settings.headerStyleGroup.headerWeight.name | Header weight (shared, see above) | 161 |
| settings.headerStyleGroup.headerColour.name | Header colour (shared, see above) | 169 |
| settings.headerStyleGroup.useHeaderColourForAll.name | Use header colour for all colour options (shared, see above) | 179 |
| settings.headerStyleGroup.useHeaderColourForAll.desc | Use the header colour everywhere below instead of picking separate colours. (shared, see above) | 180 |
| settings.headerStyleGroup.muted.name | Muted (shared, see above) | 188 |
| settings.headerStyleGroup.muted.desc | override header colour with muted colour (shared, see above) | 189 |
| settings.headerStyleGroup.smallCaps.name | Small caps (shared, see above) | 199 |
| settings.fontCard.overrideToggle.name | Override theme's default font (shared) — renders once per Body text + Heading 1-6 sub-section (7 call sites: lines 751, 789, 811, 833, 873, 888, 903) | 569 |
| settings.fontCard.pickFont.name | Pick font (shared, see above) | 580 |
| settings.fontCard.fontWeight.name | Font weight (shared, see above) | 607 |
| settings.fontCard.smallCaps.name | Small caps (shared, see above; only rendered when a smallCapsKey is passed, i.e. Heading 1-6, not Body text) | 618 |
| settings.dividerCard.above.name | Divider line above header (shared) — renders once per Heading 1-6 sub-section (6 call sites: lines 790, 812, 834, 874, 889, 904) | 676 |
| settings.dividerCard.above.thickness.name | Thickness (shared, see above) | 684 |
| settings.dividerCard.above.thickness.option.thin | Thin (shared, see above) | 686 |
| settings.dividerCard.above.thickness.option.medium | Medium (shared, see above) | 687 |
| settings.dividerCard.above.thickness.option.thick | Thick (shared, see above) | 688 |
| settings.dividerCard.below.name | Divider line below header (shared, see above) | 700 |
| settings.dividerCard.below.thickness.name | Thickness (shared, see above) | 708 |
| settings.dividerCard.below.thickness.option.thin | Thin (shared, see above) | 710 |
| settings.dividerCard.below.thickness.option.medium | Medium (shared, see above) | 711 |
| settings.dividerCard.below.thickness.option.thick | Thick (shared, see above) | 712 |

### `renderTopActions`

| ID | Current text | Line |
|---|---|---|
| settings.topActions.reopenPanel.name | Reopen storyForge panel | 213 |
| settings.topActions.reopenPanel.desc | If you've closed the storyForge panel, click this button to bring it back. | 214 |
| settings.topActions.reopenPanel.buttonText | Reopen panel | 217 |
| settings.topActions.recreateWelcomeNote.name | Recreate welcome note | 223 |
| settings.topActions.recreateWelcomeNote.desc | Restores storyForge Welcome.md in your Codex if you've deleted it. If it still exists, this just opens it. | 224 |
| settings.topActions.recreateWelcomeNote.buttonText | Recreate welcome note | 226 |
| notice.recreateWelcomeNote.error | storyForge: could not recreate welcome note — ${...} (template) | 231 |
| settings.topActions.iconUsage.name | Icon usage | 237 |
| settings.topActions.iconUsage.desc | See every icon storyForge uses, custom and stock, and where each one is wired up. | 238 |
| settings.topActions.iconUsage.buttonText | View icons | 240 |
| settings.topActions.useToolsPanel.name | Use tools panel | 244 |
| settings.topActions.useToolsPanel.desc | ribbon is hidden and the ribbon icons can be found within the tools panel | 245 |
| settings.topActions.useToolsPanel.buttonText | Reopen Tools Panel | 259 |
| settings.topActions.hideSeriesPane.name | Hide series pane | 265 |
| settings.topActions.hideSeriesPane.desc | Hides the series header and locks storyForge to book view — for standalone/non-series projects. Your series data isn't deleted; toggle this off anytime to bring it back. | 266 |
| settings.topActions.convertToSeries.name | Convert to series (only rendered while "Hide series pane" is on) | 276 |
| settings.topActions.convertToSeries.desc | Turn this standalone book into the first book of a series — lets you add more books to it later. | 277 |
| settings.topActions.convertToSeries.buttonText | Convert to series | 280 |

### `renderPaletteSection`

| ID | Current text | Line |
|---|---|---|
| settings.palette.colourPalette.name | Colour palette | 291 |
| settings.palette.colourPalette.desc | Palette used when picking colours for storyForge's UI elements below. | 292 |
| settings.palette.paletteMode.name | Palette mode (only rendered when palette isn't "Custom") | 304 |
| settings.palette.paletteMode.desc | Light or dark variant of the selected palette. | 305 |
| settings.palette.paletteMode.option.light | Light | 308 |
| settings.palette.paletteMode.option.dark | Dark | 309 |
| settings.palette.customColour.name | Custom colour ${i + 1} (template, one row per custom colour, i = 0..4 today → "Custom colour 1" .. "Custom colour 5") | 323 |
| settings.palette.customColour.nameInput.placeholder | Name | 325 |

### `renderTextStyleSection` (headings and section labels)

| ID | Current text | Line |
|---|---|---|
| settings.textStyle.sectionHeader | Text style | 724 |
| settings.textStyle.bodyText.sectionHeader | Body text | 726 |
| settings.textStyle.bodyText.overrideSize.name | Override theme's default font size | 730 |
| settings.textStyle.bodyText.overrideSize.sliderLabel | Font size | 731 |
| settings.textStyle.bodyText.overrideColour.emphasisLabel.overridden | Override body text's standard italic/bold colour (shown once body text's own font colour is already overridden) | 740 |
| settings.textStyle.bodyText.overrideColour.emphasisLabel.default | Override theme's default italic/bold colour (shown otherwise) | 740 |
| settings.textStyle.bodyText.overrideColour.name | Override theme's default font colour | 744 |
| settings.textStyle.bodyText.overrideColour.swatchLabel | Font colour | 745 |
| settings.textStyle.bodyText.emphasis.boldColour.name | Bold colour | 497 |
| settings.textStyle.bodyText.emphasis.italicColour.name | Italic colour | 508 |
| settings.textStyle.heading1.sectionHeader | Heading 1 | 754 |
| settings.textStyle.heading1.overrideSize.name | Override theme's default header size | 758 |
| settings.textStyle.heading1.overrideSize.sliderLabel | Header size | 759 |
| settings.textStyle.heading1.hideLinks.name | Hide Heading 1 Links | 768 |
| settings.textStyle.heading1.hideLinks.desc | When on, links inside a note's H1 heading render as plain text — no link colour or underline — so the title looks like a normal heading. | 769 |
| settings.textStyle.heading1.overrideColour.name | Override theme's default header colour | 783 |
| settings.textStyle.heading1.overrideColour.swatchLabel | Header colour | 784 |
| settings.textStyle.heading2.sectionHeader | Heading 2 | 800 |
| settings.textStyle.heading2.overrideSize.name | Override theme's default header size | 801 |
| settings.textStyle.heading2.overrideSize.sliderLabel | Header size | 801 |
| settings.textStyle.heading2.overrideColour.name | Override theme's default header colour | 805 |
| settings.textStyle.heading2.overrideColour.swatchLabel | Header colour | 806 |
| settings.textStyle.heading3.sectionHeader | Heading 3 | 822 |
| settings.textStyle.heading3.overrideSize.name | Override theme's default header size | 823 |
| settings.textStyle.heading3.overrideSize.sliderLabel | Header size | 823 |
| settings.textStyle.heading3.overrideColour.name | Override theme's default header colour | 827 |
| settings.textStyle.heading3.overrideColour.swatchLabel | Header colour | 828 |
| settings.textStyle.otherHeadings.sectionHeader | Headings 4 thru 6 | 844 |
| settings.textStyle.otherHeadings.chooseLevel.name | Choose heading level | 854 |
| settings.textStyle.otherHeadings.chooseLevel.option.4 | Heading 4 | 856 |
| settings.textStyle.otherHeadings.chooseLevel.option.5 | Heading 5 | 857 |
| settings.textStyle.otherHeadings.chooseLevel.option.6 | Heading 6 | 858 |
| settings.textStyle.heading4.overrideSize.name | Override theme's default header size | 871 |
| settings.textStyle.heading4.overrideSize.sliderLabel | Header size | 871 |
| settings.textStyle.heading4.overrideColour.name | Override theme's default header colour | 872 |
| settings.textStyle.heading4.overrideColour.swatchLabel | Header colour | 872 |
| settings.textStyle.heading5.overrideSize.name | Override theme's default header size | 886 |
| settings.textStyle.heading5.overrideSize.sliderLabel | Header size | 886 |
| settings.textStyle.heading5.overrideColour.name | Override theme's default header colour | 887 |
| settings.textStyle.heading5.overrideColour.swatchLabel | Header colour | 887 |
| settings.textStyle.heading6.overrideSize.name | Override theme's default header size | 901 |
| settings.textStyle.heading6.overrideSize.sliderLabel | Header size | 901 |
| settings.textStyle.heading6.overrideColour.name | Override theme's default header colour | 902 |
| settings.textStyle.heading6.overrideColour.swatchLabel | Header colour | 902 |

### `renderHighlightGroup` (rendered inside "storyForge interface")

| ID | Current text | Line |
|---|---|---|
| settings.uiFormatting.highlightActiveChapter.name | Highlight active chapter/item | 924 |
| settings.uiFormatting.highlightActiveChapter.desc | highlights the currently selected chapter, or item, in the storyForge panel | 926 |
| settings.uiFormatting.cyclingGuide.name | Cycling guide | 939 |
| settings.uiFormatting.cyclingGuide.desc | Draws a floating divider line in the editor after every 500 words, without shifting your text. | 940 |
| settings.uiFormatting.cyclingGuide.thickness.name | Thickness | 950 |
| settings.uiFormatting.cyclingGuide.thickness.option.thin | Thin | 952 |
| settings.uiFormatting.cyclingGuide.thickness.option.medium | Medium | 953 |
| settings.uiFormatting.cyclingGuide.thickness.option.thick | Thick | 954 |
| settings.uiFormatting.cyclingGuide.thickness.option.extraThick | Extra thick | 955 |
| settings.uiFormatting.cyclingGuide.flagSize.name | Flag size | 965 |
| settings.uiFormatting.cyclingGuide.flagSize.option.small | Small | 967 |
| settings.uiFormatting.cyclingGuide.flagSize.option.medium | Medium | 968 |
| settings.uiFormatting.cyclingGuide.flagSize.option.large | Large | 969 |
| settings.uiFormatting.cyclingGuide.roundedLines.name | Rounded lines | 975 |
| settings.uiFormatting.cyclingGuide.roundedLines.desc | Rounds the corners of the divider line, except the bottom-right where the flag sits. | 976 |
| settings.uiFormatting.cyclingGuide.cycleLength.name | Cycle length | 985 |
| settings.uiFormatting.cyclingGuide.cycleLength.option.short | Short | 987 |
| settings.uiFormatting.cyclingGuide.cycleLength.option.medium | Medium | 988 |
| settings.uiFormatting.cyclingGuide.cycleLength.option.long | Long | 989 |
| settings.uiFormatting.cyclingGuide.lineColour.name | Line colour | 1000 |

### `renderLibraryHighlightRows`

| ID | Current text | Line |
|---|---|---|
| settings.uiFormatting.libraryPane.highlightColour.name | Highlight colour for library items | 992 |
| settings.uiFormatting.libraryPane.highlightColour.desc | The colour used for the active chapter/item highlight. | 993 |
| settings.uiFormatting.libraryPane.highlightTextColour.name | Highlight text colour for library items | 1003 |
| settings.uiFormatting.libraryPane.highlightTextColour.desc | colour used for the active chapter/item highlight text | 1004 |

### `renderTitleStyleGroup` (shared template, called for Series title and Book title)

| ID | Current text | Line |
|---|---|---|
| settings.uiFormatting.libraryPane.titleStyleGroup.size.name | ${labelPrefix} size (template) — renders "Series title size" (call at line 1397) and "Book title size" (call at line 1404) | 1030 |
| settings.uiFormatting.libraryPane.titleStyleGroup.size.desc | Text size, from 0.5em to 2em. (shared, both calls) | 1031 |
| settings.uiFormatting.libraryPane.titleStyleGroup.weight.name | ${labelPrefix} weight (template) — "Series title weight" / "Book title weight" | 1043 |
| settings.uiFormatting.libraryPane.titleStyleGroup.colour.name | ${labelPrefix} colour (template) — "Series title colour" / "Book title colour" | 1051 |
| settings.uiFormatting.libraryPane.titleStyleGroup.smallCaps.name | ${labelPrefix} small caps (template) — "Series title small caps" / "Book title small caps" | 1061 |
| settings.uiFormatting.libraryPane.seriesTitle.labelPrefix | Series title (call-site literal feeding the template above) | 1397 |
| settings.uiFormatting.libraryPane.bookTitle.labelPrefix | Book title (call-site literal feeding the template above) | 1404 |

### `renderSubtitleStyleGroup`

| ID | Current text | Line |
|---|---|---|
| settings.uiFormatting.libraryPane.subtitle.size.name | Subtitle size | 1078 |
| settings.uiFormatting.libraryPane.subtitle.size.desc | Text size, from 0.5em to 2em. | 1079 |
| settings.uiFormatting.libraryPane.subtitle.weight.name | Subtitle weight | 1091 |
| settings.uiFormatting.libraryPane.subtitle.smallCaps.name | Subtitle small caps | 1099 |

### `renderUiFormattingSection` (own literals — divider + section/foldable headers)

| ID | Current text | Line |
|---|---|---|
| settings.uiFormatting.sectionHeader | storyForge interface | 1393 |
| settings.uiFormatting.libraryPane.sectionHeader | Library pane | 1395 |
| settings.uiFormatting.libraryPane.dividerBelowTitle.name | Divider below title | 1414 |
| settings.uiFormatting.libraryPane.dividerBelowTitle.desc | Adds a border below the series/book title, matching the border between storyForge's panes. | 1415 |

### `renderUnplacedPanel`

| ID | Current text | Line |
|---|---|---|
| settings.unplacedPanel.sectionHeader | Unplaced pane | 1111 |
| settings.unplacedPanel.itemsSize.name | Unplaced items | 1127 |
| settings.unplacedPanel.itemsSize.desc | Text size of the items in the Unplaced pane, from 0.5em to 1.5em. | 1128 |
| settings.unplacedPanel.itemsColour.name | Unplaced items colour | 1142 |
| settings.unplacedPanel.itemsColour.desc | colour of unplaced items | 1143 |
| settings.unplacedPanel.itemsMuted.name | Muted | 1153 |
| settings.unplacedPanel.itemsMuted.desc | override colour with muted colour | 1154 |
| settings.unplacedPanel.highlightColour.name | Highlight colour | 1169 |
| settings.unplacedPanel.highlightColour.desc | highlights the currently selected chapter in the storyForge panel, only active if per panel highlighting is selected | 1171 |
| settings.unplacedPanel.highlightTextColour.name | Highlight text colour | 1182 |

### `renderCodexPanel`

| ID | Current text | Line |
|---|---|---|
| settings.codexPanel.sectionHeader | Codex pane | 1206 |
| settings.codexPanel.folderSize.name | Folder size | 1222 |
| settings.codexPanel.folderSize.desc | Font size of the codex folder names and chevrons, from 0.5em to 1.5em. | 1223 |
| settings.codexPanel.folderWeight.name | Folder weight | 1235 |
| settings.codexPanel.folderWeight.desc | Font weight of the codex folder names. | 1235 |
| settings.codexPanel.folderColour.name | Folder colour | 1244 |
| settings.codexPanel.folderColour.desc | Colour of the codex folder names and chevrons. | 1245 |
| settings.codexPanel.folderIndicator.name | Folder indicator line | 1255 |
| settings.codexPanel.folderIndicator.desc | Vertical guide line showing what's nested inside a folder, coloured to match the folder colour. | 1256 |
| settings.codexPanel.folderIndicator.option.none | None | 1259 |
| settings.codexPanel.folderIndicator.option.thin | Thin | 1260 |
| settings.codexPanel.folderIndicator.option.medium | Medium | 1261 |
| settings.codexPanel.folderIndicator.option.thick | Thick | 1262 |
| settings.codexPanel.noteLabelSize.name | Codex note label size | 1281 |
| settings.codexPanel.noteLabelSize.desc | Font size of the codex note (file) labels, from 0.5em to 1.5em. | 1282 |
| settings.codexPanel.noteLabelWeight.name | Codex note label weight | 1294 |
| settings.codexPanel.noteLabelWeight.desc | Font weight of the codex note (file) labels. | 1294 |
| settings.codexPanel.noteLabelColour.name | Codex note label colour | 1303 |
| settings.codexPanel.noteLabelColour.desc | Colour of the codex note (file) labels. | 1304 |
| settings.codexPanel.useDefaultColour.name | Use default colour for Codex note label | 1315 |
| settings.codexPanel.useDefaultColour.desc | overrides the note colour and sets it the same as the body text | 1316 |
| settings.codexPanel.useFolderColour.name | Use folder colour for Codex notes | 1325 |
| settings.codexPanel.useFolderColour.desc | overrides the note colour and sets it the same as the codex folder colour | 1326 |
| settings.codexPanel.highlightColour.name | Highlight colour | 1351 |
| settings.codexPanel.highlightColour.desc | highlights the currently selected note in the codex panel, only active if per panel highlighting is selected | 1353 |
| settings.codexPanel.highlightTextColour.name | Highlight text colour | 1364 |

### `renderHideUiSection`

| ID | Current text | Line |
|---|---|---|
| settings.hideUi.sectionHeader | Hide Obsidian interface elements | 1430 |
| settings.hideUi.hideHelp.name | Hide help button | 1432 |
| settings.hideUi.hideHelp.desc | Hides the help (?) button next to the vault picker. | 1434 |
| settings.hideUi.hideSearch.name | Hide search panel | 1447 |
| settings.hideUi.hideSearch.desc | Hides the Search button at the top of the left sidebar. | 1448 |
| settings.hideUi.hideBookmarks.name | Hide bookmarks panel | 1458 |
| settings.hideUi.hideBookmarks.desc | Hides the Bookmarks button at the top of the left sidebar. | 1459 |
| settings.hideUi.hideFiles.name | Hide files panel | 1469 |
| settings.hideUi.hideFiles.desc | Hides the Files button at the top of the left sidebar. | 1470 |
| settings.hideUi.hideBacklinks.name | Hide backlinks panel | — |
| settings.hideUi.hideBacklinks.desc | Hides Obsidian's Backlinks tab in the right sidebar. | — |
| settings.hideUi.hideOutgoingLinks.name | Hide outgoing links panel | — |
| settings.hideUi.hideOutgoingLinks.desc | Hides Obsidian's Outgoing links tab in the right sidebar. | — |
| settings.hideUi.hideTags.name | Hide tags panel | — |
| settings.hideUi.hideTags.desc | Hides Obsidian's Tags tab in the right sidebar. | — |
| settings.hideUi.hideOutline.name | Hide outline panel | — |
| settings.hideUi.hideOutline.desc | Hides Obsidian's Outline tab in the right sidebar. | — |
| settings.hideUi.hideAllProperties.name | Hide all properties panel | — |
| settings.hideUi.hideAllProperties.desc | Hides Obsidian's All properties tab in the right sidebar. | — |
| settings.hideUi.hideLeftPanel.name | Hide left panel button | 1483 |
| settings.hideUi.hideLeftPanel.desc | Hides the left sidebar collapse/expand button. | 1484 |
| settings.hideUi.hideRightPanel.name | Hide right panel button | 1494 |
| settings.hideUi.hideRightPanel.desc | Hides the right sidebar collapse/expand button. Story Context still opens from the Codex button or command. | — |
| settings.hideUi.hideFileNameBar.name | Hide file name bar | 1508 |
| settings.hideUi.hideFileNameBar.desc | Hides the large file name displayed at the top of the note content. | 1509 |
| settings.hideUi.hideNavRow.name | Hide navigation row | 1519 |
| settings.hideUi.hideNavRow.desc | Hides the bar beneath the tab that shows the navigation buttons, three-dot menu, and reader/edit view toggle. | 1520 |
| settings.hideUi.statusBarView.name | Status bar view | 1530 |
| settings.hideUi.statusBarView.desc | Controls what's shown in Obsidian's bottom status bar. | 1531 |
| settings.hideUi.statusBarView.option.hidden | Hide status bar | 1534 |
| settings.hideUi.statusBarView.option.syncOnly | Show only the Obsidian Sync icon | 1535 |
| settings.hideUi.statusBarView.option.all | Show all of the status bar | 1536 |

### `renderImportExportSection`

| ID | Current text | Line |
|---|---|---|
| settings.importExport.sectionHeader | Import & export storyForge settings | 1548 |
| settings.importExport.exportSettings.name | Export settings | 1550 |
| settings.importExport.exportSettings.desc | Saves all storyForge settings to a JSON file. | 1551 |
| settings.importExport.exportSettings.buttonText | Export | 1553 |
| settings.importExport.importSettings.name | Import settings | 1566 |
| settings.importExport.importSettings.desc | Restores storyForge settings from a previously exported JSON file. This overwrites your current settings. | 1567 |
| settings.importExport.importSettings.buttonText | Import | 1569 |
| notice.importSettings.error | storyForge: could not import settings — ${...} (template) | 1583 |

### `renderAutomaticBackupSection`

| ID | Current text | Line |
|---|---|---|
| settings.automaticBackup.sectionHeader | Automatic backup | 1594 |
| settings.automaticBackup.desktopOnly.name | Automatic backup (mobile fallback row, shown only when `Platform.isDesktopApp` is false) | 1596 |
| settings.automaticBackup.desktopOnly.desc | Automatic backup is only available on desktop. | 1596 |
| settings.automaticBackup.enabled.name | Automatic backup | 1606 |
| settings.automaticBackup.enabled.desc | Automatically zip your vault's notes and attachments on a schedule. | 1607 |
| settings.automaticBackup.folder.name | Backup folder | 1618 |
| settings.automaticBackup.folder.desc | Absolute folder path on this computer where backup zip files are saved. Required for both automatic and manual backups. | 1619 |
| settings.automaticBackup.folder.placeholder | /Users/you/Backups/storyForge | 1622 |
| settings.automaticBackup.frequency.name | Backup frequency | 1632 |
| settings.automaticBackup.frequency.option.everyOpen | Every time vault is opened | 1634 |
| settings.automaticBackup.frequency.option.daily | Once daily | 1635 |
| settings.automaticBackup.frequency.option.weekly | Once weekly | 1636 |
| settings.automaticBackup.backupNow.name | Back up now | 1647 |
| settings.automaticBackup.backupNow.desc | Creates a full backup zip immediately, including your .obsidian settings folder — saved to the backup folder above. | 1648 |
| settings.automaticBackup.backupNow.buttonText | Back up now | 1650 |
| notice.backupNow.missingFolder | storyForge: set a backup folder before backing up. | 1652 |
| notice.backupNow.success | storyForge: backup saved to ${path} (template) | 1658 |
| notice.backupNow.error | storyForge: backup failed — ${...} (template) | 1660 |

## src/view/ToolsPanel.ts

| ID | Current text | Line |
|---|---|---|
| toolsPanel.displayText | Tools | 22 |

## src/view/PalettePickerModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.palettePicker.title.custom | Custom (shown when `paletteName === "Custom"`) | 34 |
| modal.palettePicker.title.template | ${paletteName} — ${mode === "light" ? "Light" : "Dark"} (template) — the literal "Light"/"Dark" words live here | 35 |

## src/view/IconAuditModal.ts

| ID | Current text | Line |
|---|---|---|
| modal.iconAudit.title | Icon usage | 23 |
| modal.iconAudit.summary.allInUse | ${ICON_REGISTRY.length} icons, all in use. (template, shown when unusedCount === 0) | 30 |
| modal.iconAudit.summary.someUnused | ${ICON_REGISTRY.length} icons, ${unusedCount} with no known usage. (template, shown otherwise) | 31 |
| modal.iconAudit.unusedBadge | No known usage | 55 |

## src/main.ts

| ID | Current text | Line |
|---|---|---|
| command.openStoryforgeView | Open storyForge panel | 399 |
| command.openToolsView | Open Tools panel | 405 |
| notice.automaticBackup.error | storyForge: automatic backup failed — ${...} (template) | 499 |

## Summary

| File | Rows |
|---|---|
| src/view/StoryForgeView.ts | 3 |
| src/view/TopPanel.ts | 13 |
| src/view/BottomPanel.ts | 9 |
| src/view/StatsPanel.ts | 7 |
| src/view/WordCountModal.ts | 5 |
| src/view/SeriesModal.ts | 6 |
| src/view/BookSynopsisModal.ts | 1 |
| src/view/ArchiveModal.ts | 3 |
| src/view/CodexArchiveModal.ts | 4 |
| src/view/SeriesOnboardingModal.ts | 5 |
| src/view/ConvertToSeriesModal.ts | 4 |
| src/view/StoryForgeSettingsTab.ts | 213 |
| src/view/ToolsPanel.ts | 1 |
| src/view/PalettePickerModal.ts | 2 |
| src/view/IconAuditModal.ts | 4 |
| src/main.ts | 3 |
| **Total** | **283** |
