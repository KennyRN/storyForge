/**
 * The diagnostic view (a developer's page, View ▸ Developer ▸ Diagnostics). It exists only in development
 * builds: the menu item is compiled out of a release by Rust, and this module is only ever imported behind
 * `import.meta.env.DEV`, so a release bundle does not contain it (test/releaseBuild.test.ts). It is a full-window
 * layer over the interface, on the same controller: it shows how the project opened and what the watcher saw.
 */
import type { Batch } from "../app/applyBatch";
import type { Running } from "../app/appLife";
import type { AppModel } from "../ui/model";
import { projectAsText } from "./projectText";
import "./diagnostics.css";

const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

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

const safe = (f: () => string): string => {
	try {
		return f();
	} catch (e) {
		return `(could not be shown: ${(e as Error).message})`;
	}
};

/** Shows the diagnostics over the interface; returns a function that removes them. */
export function mountDiagnostics(model: AppModel): () => void {
	const controller = model.controller;
	const running = controller.running;
	const root = document.createElement("div");
	root.className = "sf-diagnostics";
	root.setAttribute("role", "dialog");
	root.setAttribute("aria-label", "Diagnostics");
	let log: string[] = [];
	const stamp = (): string => new Date().toLocaleTimeString();
	const note = (line: string): void => {
		log = [`${stamp()}  ${line}`, ...log].slice(0, 200);
		const el = root.querySelector("#diag-log");
		if (el) el.textContent = log.join("\n");
	};

	const previousBatch = controller.onBatch;
	const previousBackup = controller.onBackup;
	controller.onBatch = (batch: Batch, r) => {
		const bits = [`${batch.paths.length} path(s)${batch.rescan ? ", rescan" : ""}`, `echoes ${r.echoes.length}`, `changed ${r.changed.length}`, `vanished ${r.vanished.length}`, `appeared ${r.appeared.length}`];
		if (r.reconciliation) bits.push(`matched ${r.reconciliation.matched.length}, pruned ${r.reconciliation.pruned.length}, added ${r.reconciliation.added.length}, gated ${r.reconciliation.gated.length}`);
		for (const d of r.diskChanges) bits.push(`${d.path}: ${d.result.kind}`);
		for (const e of r.errors) bits.push(`ERROR ${e.path}: ${e.error.message}`);
		note(`batch: ${bits.join("; ")}`);
		previousBatch?.(batch, r);
	};
	controller.onBackup = (r, trigger) => {
		note(r instanceof Error ? `${trigger} backup FAILED: ${r.message}` : `${trigger} backup: ${r.path} (${r.fileCount} files)`);
		previousBackup?.(r, trigger);
	};

	const close = (): void => {
		controller.onBatch = previousBatch;
		controller.onBackup = previousBackup;
		document.removeEventListener("keydown", onKey, true);
		root.remove();
	};
	const onKey = (e: KeyboardEvent): void => {
		if (e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	};
	document.addEventListener("keydown", onKey, true);

	root.innerHTML = `
		<header><h1>storyForge diagnostic</h1><button id="diag-close" type="button">Close</button></header>
		<div class="sf-diag-body sf-scroll">
		${
			running
				? `<h2>Project</h2><div class="muted">${esc(running.root)}${running.readOnlyReason ? " (read-only)" : ""}</div>
		<h2>Timings</h2><pre>${esc(`opened in ${running.timings.totalMs.toFixed(0)} ms\nscan call ${running.timings.scanMs.toFixed(0)} ms\n${running.timings.entries} entries\nscan reply ${(running.timings.scanPayloadChars / 1024).toFixed(0)} KiB`)}</pre>
		<h2>Reconciliation at open</h2><pre>${esc(summarise(running))}</pre>
		<h2>Settings and where each came from</h2><pre>${esc(settingsText(running))}</pre>
		<h2>Backups</h2><p><button id="diag-bk-scope" type="button">Back up now (normal scope)</button> <button id="diag-bk-full" type="button">Back up now (everything)</button></p>
		<h2>Watcher log</h2><pre id="diag-log">(no changes seen yet)</pre>
		<h2>The project as text</h2><pre>${esc(safe(() => projectAsText(running.opened.project)))}</pre>`
				: `<p class="muted">No project is open.</p>`
		}
		</div>`;
	document.body.append(root);
	root.querySelector("#diag-close")?.addEventListener("click", close);
	root.querySelector("#diag-bk-scope")?.addEventListener("click", () => void controller.manualBackup("scope").catch((e) => note(`backup failed: ${(e as Error).message}`)));
	root.querySelector("#diag-bk-full")?.addEventListener("click", () => void controller.manualBackup("full").catch((e) => note(`backup failed: ${(e as Error).message}`)));
	(root.querySelector("#diag-close") as HTMLElement | null)?.focus();
	return close;
}
