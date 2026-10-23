/**
 * The diagnostic window (Brief 4 §3.8): a plain page for checking the shell end to end against a copy
 * of a vault. It is not the interface; Brief 5 replaces it. Everything it does goes through the app's
 * narrow commands, via the same core the tests run.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppController, type OpenOutcome, type Running } from "../app/appLife";
import { getBookChapters, getBookChapterFiles } from "../core/book";
import { getSeriesBooks } from "../core/series";
import type { ProseSession, SaveResult } from "../core/proseWriter";
import { projectAsText } from "./projectText";
import "./style.css";

const app = new AppController({
	invoke: (cmd, args) => invoke(cmd, args),
	listen: (event, handler) => listen(event, (e) => handler(e.payload)),
});

const root = document.getElementById("app") as HTMLElement;
let log: string[] = [];
let session: ProseSession | null = null;
let status = "";
let recent: string[] = [];
let message = "";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
const stamp = () => new Date().toLocaleTimeString();
function note(line: string): void {
	log = [`${stamp()}  ${line}`, ...log].slice(0, 200);
	renderLog();
}

app.onBatch = (batch, r) => {
	const bits = [`${batch.paths.length} path(s)${batch.rescan ? ", rescan" : ""}`, `echoes ${r.echoes.length}`, `changed ${r.changed.length}`, `vanished ${r.vanished.length}`, `appeared ${r.appeared.length}`];
	if (r.reconciliation) bits.push(`matched ${r.reconciliation.matched.length}, pruned ${r.reconciliation.pruned.length}, added ${r.reconciliation.added.length}, gated ${r.reconciliation.gated.length}`);
	for (const d of r.diskChanges) bits.push(`${d.path}: ${d.result.kind}`);
	for (const e of r.errors) bits.push(`ERROR ${e.path}: ${e.error.message}`);
	note(`batch: ${bits.join("; ")}`);
	render();
};
app.onBackup = (r, trigger) => note(r instanceof Error ? `${trigger} backup FAILED: ${r.message}` : `${trigger} backup: ${r.path} (${r.fileCount} files${r.notIncluded.length ? `, ${r.notIncluded.length} not downloaded` : ""})`);
app.onChange = () => render();

function summarise(r: Running): string {
	const rec = r.opened.reconciliation;
	const lines = [`snapshot: ${rec.snapshot}`, `matched: ${rec.matched.length}`, `pruned: ${rec.pruned.length}`, `ambiguous: ${rec.ambiguous.length}`, `added: ${rec.added.length}`, `gated: ${rec.gated.length}`, `skipped: ${rec.skipped.length}`];
	return lines.join("   ") + "\n\n" + JSON.stringify(rec, null, 2);
}

function settingsText(r: Running): string {
	const s = r.settings;
	const rows = Object.entries(s.values).map(([k, v]) => `${k.padEnd(26)} ${JSON.stringify(v).padEnd(40)} ← ${s.sources[k as keyof typeof s.sources]}`);
	return [`format-version: ${s.formatVersion}${s.readOnly ? "  (READ-ONLY)" : ""}`, ...rows, "", `where you were (this computer): ${JSON.stringify(r.machineState)}`].join("\n");
}

function render(): void {
	const r = app.running;
	root.innerHTML = `
	<aside>
		<h1>storyForge <span class="muted">diagnostic</span></h1>
		<button id="open">Open Project…</button><button id="new">New Project…</button>
		<h2>Recent</h2>
		<ul class="recent">${recent.map((p, i) => `<li><button data-recent="${i}" title="${esc(p)}">${esc(p)}</button></li>`).join("") || '<li class="muted">none yet</li>'}</ul>
		${r ? `<h2>Project</h2><div class="muted" style="word-break:break-all">${esc(r.root)}</div>
		<h2>Timings</h2><pre>${esc(`opened in ${r.timings.totalMs.toFixed(0)} ms\nscan call ${r.timings.scanMs.toFixed(0)} ms\n${r.timings.entries} entries\nscan reply ${(r.timings.scanPayloadChars / 1024).toFixed(0)} KiB`)}</pre>
		<h2>Backups</h2><button id="bk-scope" ${r.readOnlyReason ? "disabled" : ""}>Back up now (normal scope)</button><button id="bk-full" ${r.readOnlyReason ? "disabled" : ""}>Back up now (everything)</button>` : ""}
		<h2>Watcher log</h2><pre id="log"></pre>
	</aside>
	<section class="content">
		${message ? `<div class="banner">${esc(message)}</div>` : ""}
		${r?.readOnlyReason ? `<div class="banner">${esc(r.readOnlyReason)}</div>` : ""}
		${r ? `
		<h2>Reconciliation at open</h2><pre>${esc(summarise(r))}</pre>
		<h2>Settings and where each came from</h2><pre>${esc(settingsText(r))}</pre>
		<h2>The project as text</h2><pre>${esc(safe(() => projectAsText(r.opened.project)))}</pre>
		<h2>Edit one chapter (through the prose writer)</h2>${editor(r)}` : '<p class="muted">Open or create a project. Nothing is opened for you, and an empty folder is never seeded by opening it.</p>'}
	</section>`;
	renderLog();
	wire();
}

function safe(f: () => string): string {
	try {
		return f();
	} catch (e) {
		return `(could not be shown: ${(e as Error).message})`;
	}
}

function chapterChoices(r: Running): { path: string; label: string }[] {
	const out: { path: string; label: string }[] = [];
	try {
		const { ordered, unplaced } = getSeriesBooks(r.opened.project);
		for (const b of [...ordered, ...unplaced]) {
			const { ordered: o, unplaced: u } = getBookChapters(r.opened.project, b.name);
			for (const c of [...o, ...u]) out.push({ path: c.path, label: `${b.name} / ${c.name}` });
		}
		void getBookChapterFiles;
	} catch {
		/* shown as an empty list */
	}
	return out;
}

function editor(r: Running): string {
	const choices = chapterChoices(r);
	return `<p><select id="chapter"><option value="">Choose a chapter…</option>${choices.map((c) => `<option value="${esc(c.path)}" ${session?.path === c.path ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>
	<button id="save" ${session ? "" : "disabled"}>Save now</button></p>
	<textarea id="body" ${session ? "" : "disabled"} spellcheck="true">${session ? esc(session.body) : ""}</textarea>
	<div id="status" class="muted">${esc(status)}</div>`;
}

function describe(res: SaveResult): string {
	switch (res.kind) {
		case "saved":
			return `saved${res.backup && !res.backup.ok ? ` (the session backup FAILED: ${res.backup.error.message})` : res.backup?.ok ? ` (session backup ${res.backup.path})` : ""}${res.normalizedLineEndings ? "; mixed line endings were normalised" : ""}`;
		case "unchanged":
			return "nothing to save";
		case "conflict":
			return `CONFLICT: the file changed elsewhere. The disk won; your text is at ${res.recoveryPath}`;
		case "refused":
			return `REFUSED (${res.reason}); your text is at ${res.recoveryPath}`;
		case "error":
			return `could not save (${res.error.message})${res.recoveryPath ? `; your text is at ${res.recoveryPath}` : "; it will try again"}`;
		case "recovery-failed":
			return `COULD NOT SAVE OR RECOVER: ${res.error.message}. The text is still in the box.`;
	}
}

function renderLog(): void {
	const el = document.getElementById("log");
	if (el) el.textContent = log.join("\n") || "(no changes seen yet)";
}

async function afterOpen(outcome: OpenOutcome): Promise<void> {
	message = "";
	session = null;
	status = "";
	if (outcome.kind === "not-a-project") message = outcome.message;
	if (outcome.kind === "opened") note(`opened ${outcome.running.root}${outcome.running.readOnlyReason ? " (read-only)" : ""}`);
	recent = await app.recent();
	render();
}

function wire(): void {
	const $ = (id: string) => document.getElementById(id);
	$("open")?.addEventListener("click", () => void app.openDialog("open").then(afterOpen).catch(fail));
	$("new")?.addEventListener("click", () => {
		const title = window.prompt("Series title for the new project?", "My Series");
		if (title) void app.openDialog("create", { seriesTitle: title }).then(afterOpen).catch(fail);
	});
	for (const b of document.querySelectorAll<HTMLButtonElement>("[data-recent]")) b.addEventListener("click", () => void app.openRecent(Number(b.dataset.recent)).then(afterOpen).catch(fail));
	$("bk-scope")?.addEventListener("click", () => void app.manualBackup("scope").catch(fail));
	$("bk-full")?.addEventListener("click", () => void app.manualBackup("full").catch(fail));
	const select = $("chapter") as HTMLSelectElement | null;
	select?.addEventListener("change", () => {
		const path = select.value;
		void (async () => {
			if (session) await session.close();
			session = null;
			status = "";
			if (path) {
				try {
					session = await app.openFile(path);
					session.onReload((e) => {
						status = `reloaded from disk (${e.cause})${e.recoveryPath ? `; your unsaved text is at ${e.recoveryPath}` : ""}`;
						render();
					});
				} catch (e) {
					status = (e as Error).message;
				}
			}
			render();
		})();
	});
	const body = $("body") as HTMLTextAreaElement | null;
	body?.addEventListener("input", () => session?.setBody(body.value));
	$("save")?.addEventListener("click", () => {
		void session?.save().then((res) => {
			status = describe(res);
			const el = $("status");
			if (el) el.textContent = status;
		});
	});
}

function fail(e: unknown): void {
	message = (e as Error)?.message ?? String(e);
	render();
}

void (async () => {
	await app.start();
	recent = await app.recent().catch(() => []);
	render();
})();
