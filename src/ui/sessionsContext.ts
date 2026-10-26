import { readBookFrontmatter, chapterDisplayTitle, getBookChapters } from "../core/book";
import { readSessions, type SessionRead } from "../core/sessionFiles";
import { bookOfChapter, type SessionSettings } from "../core/sessionFigures";
import type { SessionChapter, SessionRecord } from "../core/sessions";
import { applyHashNumbering } from "../core/titleNumbering";
import type { Project } from "../core/project";
import type { NumberingStyle } from "../core/numberingStyle";
import type { AppModel } from "./model";

/** The sessions on disk and the settings that decide how they are shown. Reads the index, never the disk. */
export function sessionContext(model: AppModel): { read: SessionRead; settings: SessionSettings } | null {
	const running = model.running;
	if (!running) return null;
	const v = running.settings.values;
	return { read: readSessions(running.opened.project), settings: { minShownMinutes: v.sessionMinShownMinutes, editingWpm: v.sessionEditingWpm } };
}

/** The sessions that touched a book's chapters. */
export const sessionsInBook = (records: readonly SessionRecord[], book: string): SessionRecord[] => records.filter((r) => r.chapters.some((c) => bookOfChapter(c.path) === book));

/**
 * A chapter of a session as the author knows it now: by its id if it has one (so a renamed chapter shows its current
 * name), else by the name stored. `gone` is set when no such chapter exists any more.
 */
export function chapterNamer(project: Project, style: NumberingStyle): (c: SessionChapter) => { text: string; gone: boolean } {
	const titles = new Map<string, Map<string, string>>();
	const forBook = (book: string): Map<string, string> => {
		let m = titles.get(book);
		if (!m) {
			m = new Map();
			try {
				const chapters = getBookChapters(project, book);
				const files = [...chapters.ordered, ...chapters.unplaced].map((c) => c.name);
				const numbered = applyHashNumbering(files.map((f) => chapterDisplayTitle(project, book, f)), style);
				files.forEach((f, i) => m!.set(f, numbered[i]));
			} catch {
				/* an unreadable book shows names */
			}
			titles.set(book, m);
		}
		return m;
	};
	return (c) => {
		const book = bookOfChapter(c.path);
		const file = c.path.slice(book.length + 1);
		let current = file;
		if (c.id) {
			const entry = Object.entries(readBookFrontmatter(project, book)?.chapters ?? {}).find(([, e]) => e.chapterId === c.id);
			if (entry) current = entry[0];
		}
		const title = forBook(book).get(current);
		return title ? { text: title, gone: false } : { text: file, gone: true };
	};
}
