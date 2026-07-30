import { App, TFile } from "obsidian";
import { isCodexNotePath } from "../paths";
import {
	acknowledgeFactChange,
	parseFactsFromNote,
	setFactValue,
	writeFactsIntoNote,
} from "./facts";

/**
 * Intentional exception to writeGuard: Story Context may update the Facts
 * section of an existing Codex note. Paths are restricted to flat Codex notes
 * (`Codex/<name>.md`) — never library manuscripts or arbitrary vault files.
 */

export class ForbiddenCodexWriteError extends Error {
	constructor(path: string) {
		super(`storyForge refused to modify "${path}": not a Codex note`);
		this.name = "ForbiddenCodexWriteError";
	}
}

function assertCodexNotePath(path: string): void {
	if (!isCodexNotePath(path)) {
		throw new ForbiddenCodexWriteError(path);
	}
}

export async function updateCodexFact(
	app: App,
	path: string,
	heading: string,
	key: string,
	newValue: string,
): Promise<void> {
	assertCodexNotePath(path);
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
	assertCodexNotePath(path);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return;
	const raw = await app.vault.read(file);
	const facts = acknowledgeFactChange(parseFactsFromNote(raw, heading), key, chapterValue);
	await app.vault.modify(file, writeFactsIntoNote(raw, facts));
}
