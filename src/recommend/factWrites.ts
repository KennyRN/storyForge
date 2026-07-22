import { App, TFile } from "obsidian";
import {
	acknowledgeFactChange,
	parseFactsFromNote,
	setFactValue,
	writeFactsIntoNote,
} from "./facts";

export async function updateCodexFact(
	app: App,
	path: string,
	heading: string,
	key: string,
	newValue: string,
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return;
	const raw = await app.vault.read(file);
	const facts = setFactValue(parseFactsFromNote(raw, heading), key, newValue, true);
	await app.vault.modify(file, writeFactsIntoNote(raw, facts));
}

export async function acknowledgeCodexFactChange(
	app: App,
	path: string,
	heading: string,
	key: string,
	chapterValue: string,
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return;
	const raw = await app.vault.read(file);
	const facts = acknowledgeFactChange(parseFactsFromNote(raw, heading), key, chapterValue);
	await app.vault.modify(file, writeFactsIntoNote(raw, facts));
}
