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

export async function upsertTodayTotal(
	app: App,
	bookFolderName: string,
	total: number,
	now: Date = new Date(),
): Promise<void> {
	const data = await readWordCountFile(app);
	const totals = data[bookFolderName] ?? {};
	totals[todayISOInEngland(now)] = total;
	data[bookFolderName] = totals;
	await writeBackstageFile(app.vault, wordCountFilePath(), stringifyYaml(data));
}
