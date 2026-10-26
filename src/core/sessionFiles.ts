/**
 * Session files (docs/sessions.md §6): `_backstage/storyforge/sessions/<YYYY-MM>-<computer>.md`, one per month per
 * computer, so two Macs syncing one folder never write the same file. Written only when a session ends, through the
 * Project handle's guarded frontmatter edit (compare-then-write). A file that can't be read safely is never rewritten:
 * the session goes to a fresh sibling.
 */
import { UnreadableFrontmatterError } from "./frontmatter";
import { BACKSTAGE_ROOT } from "./paths";
import type { Project } from "./project";
import { parseInstant, type SessionChapter, type SessionRecord } from "./sessions";

export const SESSIONS_FOLDER = `${BACKSTAGE_ROOT}/sessions`;
export const SESSIONS_FORMAT = 1;

const FILE_NOTE = "Writing sessions recorded by storyForge on one computer for one month. Safe to read; storyForge rewrites this file when a session ends.";

export function sessionFilePath(computer: string, day: string, sibling = 1): string {
	return `${SESSIONS_FOLDER}/${day.slice(0, 7)}-${computer}${sibling > 1 ? `-${sibling}` : ""}.md`;
}

const defaultContent = (computer: string): string => `---\nsessions-format: ${SESSIONS_FORMAT}\ncomputer: ${computer}\nsessions: []\n---\n${FILE_NOTE}\n`;

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

const KNOWN = new Set(["id", "start", "end", "day", "net", "chapters", "unreliable", "recovered"]);

/** A record as the file holds it (kebab-case keys, unknown keys carried). */
export function toStored(r: SessionRecord): Plain {
	const chapters = r.chapters.map((c) => ({ path: c.path, ...(c.id ? { id: c.id } : {}), net: c.net, ...(c.byDay ? { "by-day": c.byDay } : {}) }));
	return { id: r.id, start: r.start, end: r.end, day: r.day, net: r.net, chapters, unreliable: r.unreliable, recovered: r.recovered, ...(r.extra ?? {}) };
}

/** One stored entry back to a record, or null when it isn't a usable session (the rest of the file still reads). */
export function fromStored(v: unknown): SessionRecord | null {
	if (!isPlain(v)) return null;
	const { id, start, end, day, net, chapters } = v;
	if (typeof id !== "string" || typeof start !== "string" || typeof end !== "string" || typeof day !== "string" || typeof net !== "number") return null;
	if (!Number.isFinite(parseInstant(start)) || !Number.isFinite(parseInstant(end)) || !/^\d{4}-\d\d-\d\d$/.test(day) || !Array.isArray(chapters)) return null;
	const parsed: SessionChapter[] = [];
	for (const c of chapters) {
		if (!isPlain(c) || typeof c.path !== "string" || typeof c.net !== "number") continue;
		const byDay = isPlain(c["by-day"]) ? Object.fromEntries(Object.entries(c["by-day"]).filter(([, n]) => typeof n === "number") as [string, number][]) : undefined;
		parsed.push({ path: c.path, ...(typeof c.id === "string" ? { id: c.id } : {}), net: c.net, ...(byDay ? { byDay } : {}) });
	}
	const extra = Object.fromEntries(Object.entries(v).filter(([k]) => !KNOWN.has(k)));
	return { id, start, end, day, net, chapters: parsed, unreliable: v.unreliable === true, recovered: v.recovered === true, ...(Object.keys(extra).length ? { extra } : {}) };
}

export interface WrittenSession {
	path: string;
	/** True when an earlier file couldn't be read, so this went to a sibling. */
	sibling: boolean;
}

/**
 * Adds a finished session to its month's file for this computer. Idempotent: a session already in the file (a retried
 * write) is left. A file that can't be read is left byte-identical and the session goes to the next sibling.
 */
export async function appendSession(project: Project, record: SessionRecord, computer: string): Promise<WrittenSession> {
	if (!project.exists(SESSIONS_FOLDER)) await project.createFolder(SESSIONS_FOLDER);
	for (let n = 1; n <= 20; n++) {
		const path = sessionFilePath(computer, record.day, n);
		try {
			await project.modifyFrontmatter(path, defaultContent(computer), (fm) => {
				if (fm["sessions-format"] === undefined) fm["sessions-format"] = SESSIONS_FORMAT;
				if (fm.computer === undefined) fm.computer = computer;
				const list = Array.isArray(fm.sessions) ? [...(fm.sessions as unknown[])] : [];
				if (list.some((s) => isPlain(s) && s.id === record.id)) return;
				list.push(toStored(record));
				fm.sessions = list;
			});
			return { path, sibling: n > 1 };
		} catch (err) {
			if (err instanceof UnreadableFrontmatterError) continue;
			throw err;
		}
	}
	throw new Error("too many unreadable session files to write a new one");
}

export interface SessionRead {
	/** Every readable session from every computer, in order of start, without duplicates. */
	sessions: SessionRecord[];
	/** Session files that couldn't be read (never rewritten). */
	unreadable: string[];
	/** Entries in readable files that weren't usable sessions. */
	skipped: number;
}

/** Reads every session file in the folder, from every computer, from the index (no disk access). */
export function readSessions(project: Project): SessionRead {
	const out: SessionRead = { sessions: [], unreadable: [], skipped: 0 };
	const seen = new Set<string>();
	for (const entry of project.list(SESSIONS_FOLDER)) {
		if (entry.kind !== "file" || !entry.path.toLowerCase().endsWith(".md")) continue;
		let fm;
		try {
			fm = project.frontmatter(entry.path);
		} catch {
			out.unreadable.push(entry.path);
			continue;
		}
		const list = fm && Array.isArray(fm.sessions) ? (fm.sessions as unknown[]) : [];
		const computer = typeof fm?.computer === "string" ? fm.computer : entry.path;
		for (const raw of list) {
			const r = fromStored(raw);
			if (!r) {
				out.skipped += 1;
				continue;
			}
			const key = `${computer}:${r.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.sessions.push(r);
		}
	}
	out.sessions.sort((a, b) => parseInstant(a.start) - parseInstant(b.start));
	return out;
}
