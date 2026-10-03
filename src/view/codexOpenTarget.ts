/** Where a storyTelling Codex lore click should open the note. Focus Mode keeps the
 * chapter in the center pane and shows the lore in the right-rail `.sf-codex-page`. */
export function storytellingCodexOpenTarget(focusMode: boolean): "codex-page" | "center" {
	return focusMode ? "codex-page" : "center";
}

/** What a storyTelling Codex lore click does to Focus Mode's `.sf-codex-page`: re-clicking the
 * lore already shown there (its row is the highlighted one) closes the page; any other lore opens. */
export function storytellingCodexClickAction(showingPath: string | null, clickedPath: string): "open" | "close" {
	return showingPath === clickedPath ? "close" : "open";
}
