import { App, TFile } from "obsidian";
import { CODEX_ROOT } from "./paths";
import { createCodexNote } from "./codex";

export const WELCOME_NOTE_FILENAME = "storyForge Welcome.md";

export const WELCOME_NOTE_CONTENT = `# Welcome to storyForge

**Organizing your writing**
- Series → book → chapter hierarchy, with drag-to-reorder for both books and chapters
- "Unplaced" staging area for books/chapters not yet sequenced into the main order
- Archive chapters or books instead of deleting them
- Auto-numbering in titles (# inserts a counted number) plus title/subtitle splitting
- Standalone-book mode — hide the series layer entirely for single-book projects, convertible back to a full series later

**Reference & world-building (Codex)**
- A dedicated Codex for character/location/lore notes, organized into virtual folders
- Archive Codex notes without deleting them

**Tracking progress**
- Live word counts per chapter and book
- Stats panel: daily, weekly, per-chapter, and per-story totals
- Word-count history log over time

**Focus & navigation**
- Side panel showing your series/book/chapter tree at a glance
- Highlights whichever chapter you currently have open
- Custom tab titles for chapters
- Tools panel — tucks Obsidian's ribbon into the sidebar
- Status bar visibility control

**Customization & theming**
- Built-in terminal-style color palettes (Nord, Dracula, Gruvbox, Catppuccin, etc.)
- Per-element color overrides (highlights, headings, Codex, library titles)
- Custom fonts and font weights for headings/body/titles
- Heading dividers, sizing, and small-caps styling
- Custom icon set

**Writing aids**
- Cycling guide — visual gutter markers in the editor

**Data safety**
- Manual and automatic backups (on every open, daily, or weekly)
- Settings import/export

**Interface cleanup**
- Hide native Obsidian chrome you don't need (search, bookmarks, file explorer, etc.)

---

This file can be recreated later from Settings if you delete it.
`;

/**
 * Idempotent: returns the existing note untouched if `Codex/storyForge Welcome.md` already exists,
 * so hand-edited content is never overwritten. Otherwise creates it and registers it into codex.md's
 * virtual folder tree at root, via the same path createCodexNote() uses for user-created notes.
 */
export async function ensureWelcomeNote(app: App): Promise<TFile> {
	const path = `${CODEX_ROOT}/${WELCOME_NOTE_FILENAME}`;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;
	return createCodexNote(app, null, { filename: WELCOME_NOTE_FILENAME, content: WELCOME_NOTE_CONTENT });
}
