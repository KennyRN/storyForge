import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import { historyFilePath } from "./paths";
import { writeBackstageFile } from "./writeGuard";
import { todayISOInEngland, wordsToday } from "./historyMath";

export { todayISOInEngland, wordsToday };

export interface History {
	totals: Record<string, number>;
}

export async function readHistory(app: App, bookFolderName: string): Promise<History> {
	const path = historyFilePath(bookFolderName);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		return { totals: {} };
	}
	const raw = await app.vault.read(file);
	const parsed = parseYaml(raw) as { totals?: Record<string, number> } | null;
	return { totals: parsed?.totals ?? {} };
}

export async function upsertTodayTotal(
	app: App,
	bookFolderName: string,
	total: number,
	now: Date = new Date(),
): Promise<void> {
	const history = await readHistory(app, bookFolderName);
	history.totals[todayISOInEngland(now)] = total;
	const yaml = stringifyYaml({ totals: history.totals });
	await writeBackstageFile(app.vault, historyFilePath(bookFolderName), yaml);
}
