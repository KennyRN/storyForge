/** Where a storyTelling Codex lore click should open the note. Focus Mode keeps the
 * chapter in the center pane and shows the lore in the right-rail `.sf-codex-page`. */
export function storytellingCodexOpenTarget(focusMode: boolean): "codex-page" | "center" {
	return focusMode ? "codex-page" : "center";
}
