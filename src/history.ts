import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import { wordCountFilePath } from "./paths";
import { writeBackstageFile } from "./writeGuard";
import { todayISOInEngland, wordsThisWeek, wordsToday } from "./historyMath";

export { todayISOInEngland, wordsThisWeek, wordsToday };

export interface History {
	totals: Record<string, number>;
}

/** { [bookFolderName]: { [dateISO]: total } }, all books sharing one file. */
type WordCountFile = Record<string, Record<string, number>>;

async function readWordCountFile(app: App): Promise<WordCountFile> {
	const file = app.vault.getAbstractFileByPath(wordCountFilePath());
	if (!(file instanceof TFile)) {
		return {};
	}
	const raw = await app.vault.read(file);
	const parsed = parseYaml(raw) as WordCountFile | null;
	return parsed ?? {};
}

export async function readHistory(app: App, bookFolderName: string): Promise<History> {
	const data = await readWordCountFile(app);
	return { totals: data[bookFolderName] ?? {} };
}

// Single serialisation point for all wordcount.md writes: without this, two
// concurrent upsertTodayTotal calls (e.g. one per book, triggered by rapid
// edits across books within the same debounce window) would both read the
// same pre-write snapshot, and the second write would silently clobber the
// first book's just-written total.
let writeQueue: Promise<void> = Promise.resolve();

export async function upsertTodayTotal(
	app: App,
	bookFolderName: string,
	total: number,
	now: Date = new Date(),
): Promise<void> {
	const run = writeQueue.then(async () => {
		const data = await readWordCountFile(app);
		const totals = data[bookFolderName] ?? {};
		totals[todayISOInEngland(now)] = total;
		data[bookFolderName] = totals;
		await writeBackstageFile(app.vault, wordCountFilePath(), stringifyYaml(data));
	});
	// Keep the queue alive even if this write rejects, so later queued callers
	// still run; the caller of this call still observes their own rejection
	// via the returned `run` promise.
	writeQueue = run.catch(() => undefined);
	return run;
}
