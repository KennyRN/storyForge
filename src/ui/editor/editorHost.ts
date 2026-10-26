import type { ProseSession } from "../../core/proseWriter";
import { parseProseFile } from "../../core/proseFile";
import { foldKey } from "../../core/pathRules";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { mountReadOnlyEditor, mountSessionEditor, type MountedEditor, openFind, openFindReplace, redo, undo } from "./editor";
import { noticeForOutsideChange, noticesForSave, readOnlyBanner } from "./saveNotices";

export type Slot = "centre" | "lore";

interface Occupant {
	path: string;
	mounted: MountedEditor;
	session?: ProseSession;
	offs: (() => void)[];
}

/**
 * Owns the two editor slots, centre and lore, each holding at most one occupant (docs/interface.md §1.2).
 * One file, one editor: opening a file that already has an editor focuses it, in whichever slot holds it.
 * Prose reaches the disk only through the `ProseSession` each editor holds.
 */
export class EditorHost {
	private slots: Record<Slot, { host: HTMLElement; occupant: Occupant | null; opening: number; pending: { key: string; done: Promise<void> } | null }>;
	private endingsShown = new Set<string>();
	/** Called when a slot's occupant changes (the shell shows or hides the lore slot). */
	onChange: (() => void) | null = null;

	constructor(
		private readonly model: AppModel,
		hosts: Record<Slot, HTMLElement>,
	) {
		this.slots = { centre: { host: hosts.centre, occupant: null, opening: 0, pending: null }, lore: { host: hosts.lore, occupant: null, opening: 0, pending: null } };
		model.subscribe("project", () => {
			if (!model.running) this.dropAll();
		});
	}

	/** The path held in a slot, as the project spells it, or null. */
	pathIn(slot: Slot): string | null {
		return this.slots[slot].occupant?.path ?? null;
	}

	/** Which slot holds `path`, if any. */
	where(path: string): Slot | null {
		const key = this.keyOf(path);
		for (const slot of ["centre", "lore"] as const) {
			const o = this.slots[slot].occupant;
			if (o && foldKey(o.path) === key) return slot;
		}
		return null;
	}

	/** The session behind a slot's editor (none for a read-only view). */
	sessionIn(slot: Slot): ProseSession | null {
		return this.slots[slot].occupant?.session ?? null;
	}

	/** Focuses the editor in a slot. */
	focus(slot: Slot): void {
		this.slots[slot].occupant?.mounted.view.focus();
	}

	/** The editor (or read-only view) the keyboard is in, for Undo, Redo and Find from the menu. */
	private focused(): MountedEditor | null {
		for (const slot of ["centre", "lore"] as const) {
			const o = this.slots[slot].occupant;
			if (o?.mounted.view.hasFocus) return o.mounted;
		}
		return null;
	}

	undo(): boolean {
		const f = this.focused();
		return f ? undo(f.view) : false;
	}
	redo(): boolean {
		const f = this.focused();
		return f ? redo(f.view) : false;
	}
	find(replace = false): void {
		if (this.model.centreCovered && !this.focused()) return;
		const f = this.focused() ?? this.slots.centre.occupant?.mounted ?? null;
		if (!f) return;
		(replace ? openFindReplace : openFind)(f.view);
	}

	/** Opens `path` in `slot`, or focuses the editor that already has it. */
	async open(slot: Slot, path: string): Promise<void> {
		if (slot === "centre") this.model.setCentreView("chapter");
		const have = this.where(path);
		if (have) {
			this.focus(have);
			return;
		}
		const s = this.slots[slot];
		// The same file asked for twice while it is still opening (a click during start-up): one open, not two fighting over one session.
		for (const other of ["centre", "lore"] as const) {
			const p = this.slots[other].pending;
			if (p && p.key === this.keyOf(path)) {
				await p.done;
				const now = this.where(path);
				if (now) this.focus(now);
				return;
			}
		}
		let finish!: () => void;
		s.pending = { key: this.keyOf(path), done: new Promise<void>((resolve) => (finish = resolve)) };
		try {
			await this.openIn(slot, path);
		} finally {
			s.pending = null;
			finish();
		}
	}

	private async openIn(slot: Slot, path: string): Promise<void> {
		const s = this.slots[slot];
		const token = ++s.opening;
		const running = this.model.running;
		if (!running) return;
		const container = el("div", { class: "sf-editor-pane" });
		let occupant: Occupant | null = null;
		const project = running.opened.project;
		if (project.isPlaceholder(path)) {
			this.show(s.host, container, "Downloading from iCloud…");
		}
		try {
			let session: ProseSession | undefined;
			let banner: string | undefined;
			let readOnlyText: string | undefined;
			try {
				session = await this.model.controller.openFile(path);
			} catch (e) {
				// The writer says why it won't edit a file (ProseRefused); a read-only project says so in its own words.
				const refusedReason = (e as Error)?.name === "ProseRefused" ? (e as unknown as { reason: string }).reason : undefined;
				if (refusedReason === undefined && !/read-only/i.test((e as Error)?.message ?? "")) throw e;
				banner = readOnlyBanner(refusedReason ?? (e as Error).message);
				readOnlyText = parseProseFile(await project.readText(project.entry(path)?.path ?? path)).body;
			}
			if (token !== s.opening) {
				// A newer open for this slot started while this one was loading: let this one go.
				if (session) void session.close();
				return;
			}
			const editorHost = el("div", { class: "sf-editor" });
			const mounted = session ? mountSessionEditor(editorHost, session, { covered: () => slot === "centre" && this.model.centreCovered }) : mountReadOnlyEditor(editorHost, readOnlyText ?? "");
			occupant = { path: session?.path ?? project.entry(path)?.path ?? path, mounted, session, offs: [] };
			if (session) this.watch(occupant, session);
			const previous = s.occupant;
			s.occupant = occupant;
			this.show(s.host, container, banner, editorHost);
			if (previous) await this.release(previous);
			this.onChange?.();
			mounted.view.focus();
		} catch (e) {
			if (token === s.opening) fill(s.host);
			this.model.notices.notify({ text: `Could not open ${path.slice(path.lastIndexOf("/") + 1)}: ${(e as Error)?.message ?? String(e)}` });
		}
	}

	/** Closes a slot's editor, saving what is in it first. */
	async close(slot: Slot): Promise<void> {
		const s = this.slots[slot];
		s.opening++;
		const o = s.occupant;
		s.occupant = null;
		fill(s.host);
		if (o) await this.release(o);
		this.onChange?.();
	}

	private show(host: HTMLElement, pane: HTMLElement, banner: string | undefined, editor?: HTMLElement): void {
		fill(pane, banner ? el("div", { class: "sf-editor-banner", attrs: { role: "note" }, text: banner }) : null, editor);
		fill(host, pane);
	}

	private watch(o: Occupant, session: ProseSession): void {
		const ctx = { reveal: (p: string) => void this.model.reveal(p) };
		o.offs.push(
			session.onSaveResult((result) => {
				const { show, clear } = noticesForSave(result, ctx);
				for (const key of clear) this.model.notices.dismissKey(key);
				for (const n of show) {
					if (n.key?.startsWith("endings:")) {
						if (this.endingsShown.has(n.key)) continue;
						this.endingsShown.add(n.key);
					}
					this.model.notices.notify(n);
				}
			}),
			session.onReload((e) => {
				// A conflict already reached the save observer, with the same recovery path.
				if (e.cause === "outside-change" && e.recoveryPath) this.model.notices.notify(noticeForOutsideChange(session.path, e.recoveryPath, ctx));
			}),
		);
	}

	private async release(o: Occupant): Promise<void> {
		for (const off of o.offs) off();
		o.mounted.destroy();
		if (o.session) await o.session.close();
	}

	private dropAll(): void {
		for (const slot of ["centre", "lore"] as const) {
			const s = this.slots[slot];
			s.opening++;
			const o = s.occupant;
			s.occupant = null;
			fill(s.host);
			if (o) {
				for (const off of o.offs) off();
				o.mounted.destroy();
			}
		}
		this.onChange?.();
	}

	private keyOf(path: string): string {
		const project = this.model.running?.opened.project;
		return foldKey(project?.entry(path)?.path ?? path);
	}
}
