import type { ProseSession } from "../../core/proseWriter";
import { parseProseFile } from "../../core/proseFile";
import { foldKey } from "../../core/pathRules";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { arriveWriting, setWritingFallback, trackWriting } from "./lastWriting";
import { mountReadOnlyEditor, mountSessionEditor, type MountedEditor, type TextUpdate, openFind, openFindReplace, redo, undo } from "./editor";
import { noticeForOutsideChange, noticesForSave, readOnlyBanner, type Banner } from "./saveNotices";
import { noticeIcon } from "../kit/noticeIcons";

/**
 * The editor slots: the chapter's (centre: the storytelling side's workspace) and the context panel's (lore), and one for each library
 * tab that shows an entry in the workspace (codex, archive). The library ones sit in a layer over the workspace; the chapter's editor
 * stays open underneath, inert (decision 28, 36), and nothing is closed or reopened by flipping between the sides.
 */
export type Slot = "centre" | "lore" | "codex" | "archive";
export const SLOTS: readonly Slot[] = ["centre", "lore", "codex", "archive"];

/** A box the author types in: a text field, a name box, an editor. */
const isTypingPlace = (e: Element | null): boolean => e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || (e instanceof HTMLElement && e.isContentEditable);

interface Occupant {
	path: string;
	mounted: MountedEditor;
	session?: ProseSession;
	offs: (() => void)[];
}

/**
 * Owns the editor slots (centre, lore, codex, archive), each holding at most one occupant (docs/interface.md §1.2).
 * One file, one editor: opening a file that already has an editor focuses it, in whichever slot holds it.
 * Prose reaches the disk only through the `ProseSession` each editor holds.
 */
export class EditorHost {
	private slots: Record<Slot, { host: HTMLElement; occupant: Occupant | null; opening: number; pending: { key: string; done: Promise<void> } | null }>;
	private endingsShown = new Set<string>();
	/** Called when a slot's occupant changes (the shell shows or hides the lore slot). */
	onChange: (() => void) | null = null;
	/** Watchers of a file's text (the context panel's read-only chapter): told every change to the document of whichever editor holds it. */
	private textWatchers = new Map<string, Set<{ update: TextUpdate; reset: (text: string) => void }>>();
	/** Called each time an occupant of any slot changes, for the watchers above to find the editor that now holds their file. */
	private occupantListeners = new Set<() => void>();

	constructor(
		private readonly model: AppModel,
		hosts: Record<Slot, HTMLElement>,
	) {
		this.slots = Object.fromEntries(SLOTS.map((s) => [s, { host: hosts[s], occupant: null, opening: 0, pending: null }])) as EditorHost["slots"];
		setWritingFallback(() => this.slots.centre.occupant?.mounted.view ?? null);
		model.subscribe("project", () => {
			if (!model.running) this.dropAll();
		});
	}

	/**
	 * Watches the text of `path`, as the editor holding it has it now (the open session's current text, not the file on disk, so words
	 * typed but not yet saved are there). `reset` gives the whole text (when the watch starts, when the editor holding the file changes
	 * or is closed) and `update` each change after it. This only reads: it never reaches the session, the writer or the tracker.
	 * Returns the function that stops the watch.
	 */
	watchText(path: string, watcher: { update: TextUpdate; reset: (text: string | null) => void }): () => void {
		const key = this.keyOf(path);
		let set = this.textWatchers.get(key);
		if (!set) this.textWatchers.set(key, (set = new Set()));
		const entry = { update: watcher.update, reset: (t: string) => watcher.reset(t) };
		set.add(entry);
		const sync = (): void => watcher.reset(this.liveText(path));
		sync();
		this.occupantListeners.add(sync);
		return () => {
			set!.delete(entry);
			this.occupantListeners.delete(sync);
		};
	}

	/** The text now in the editor that holds `path`, or null when none does. */
	liveText(path: string): string | null {
		const slot = this.where(path);
		return slot ? this.slots[slot].occupant!.mounted.view.state.doc.toString() : null;
	}

	private emitText(path: string, changes: Parameters<TextUpdate>[0], lengthBefore: number): void {
		for (const w of this.textWatchers.get(this.keyOf(path)) ?? []) w.update(changes, lengthBefore);
	}

	private occupantChanged(): void {
		for (const fn of [...this.occupantListeners]) fn();
	}

	/** The path held in a slot, as the project spells it, or null. */
	pathIn(slot: Slot): string | null {
		return this.slots[slot].occupant?.path ?? null;
	}

	/** Which slot holds `path`, if any. */
	where(path: string): Slot | null {
		const key = this.keyOf(path);
		for (const slot of SLOTS) {
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
		for (const slot of SLOTS) {
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

	/**
	 * Opens `path` in `slot`, or focuses the editor that already has it. `reveal: false` (the library side choosing a chapter, Brief 14 §1.7)
	 * switches the slot's file by the same route (the open one saved, the new one opened) without showing the chapter view or taking the focus.
	 */
	async open(slot: Slot, path: string, options: { reveal?: boolean } = {}): Promise<void> {
		const reveal = options.reveal !== false;
		if (slot === "centre" && reveal) this.model.setCentreView("chapter");
		else if (slot === "codex" || slot === "archive") this.model.showLibraryEntry(slot);
		const have = this.where(path);
		if (have === slot) {
			if (reveal) this.focus(have);
			return;
		}
		// One file, one editor: the chapter's stays where it is and is focused, and so does a note already held by the centre or the
		// context panel; but a note that a library tab's workspace holds, or that one is asked to show, moves: it is saved and closed
		// in the other slot first, then opens here (a hidden editor can't be the one focused).
		const library = (s: Slot | null): boolean => s === "codex" || s === "archive";
		if (have && (library(have) || library(slot)) && have !== "centre") await this.close(have);
		else if (have) {
			if (reveal) this.focus(have);
			return;
		}
		const s = this.slots[slot];
		// The same file asked for twice while it is still opening (a click during start-up): one open, not two fighting over one session.
		for (const other of SLOTS) {
			const p = this.slots[other].pending;
			if (p && p.key === this.keyOf(path)) {
				await p.done;
				const now = this.where(path);
				if (now && reveal) this.focus(now);
				return;
			}
		}
		let finish!: () => void;
		s.pending = { key: this.keyOf(path), done: new Promise<void>((resolve) => (finish = resolve)) };
		try {
			await this.openIn(slot, path, reveal);
		} finally {
			s.pending = null;
			finish();
		}
	}

	private async openIn(slot: Slot, path: string, reveal: boolean): Promise<void> {
		const s = this.slots[slot];
		const token = ++s.opening;
		// Where the author was typing when this note was asked for: if it is somewhere else by the time the note is open (a name box
		// opened meanwhile, say), the note opens without taking the focus from there.
		const typingAtRequest = document.activeElement;
		const running = this.model.running;
		if (!running) return;
		const container = el("div", { class: "sf-editor-pane" });
		let occupant: Occupant | null = null;
		const project = running.opened.project;
		if (project.isPlaceholder(path)) {
			this.show(s.host, container, readOnlyBanner("iCloud"));
		}
		try {
			let session: ProseSession | undefined;
			let banner: Banner | undefined;
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
			const mounted = session ? mountSessionEditor(editorHost, session, { covered: () => (slot === "centre" ? this.model.centreCovered : slot === "codex" || slot === "archive" ? !(this.model.nav.face === "storyforge" && this.model.nav.forgeTab === slot) : false), typing: () => this.model.typingOptions(), links: this.model.codexLinksFor(project.entry(path)?.path ?? path), onUpdate: (c, n) => this.emitText(path, c, n) }) : mountReadOnlyEditor(editorHost, readOnlyText ?? "", { onUpdate: (c, n) => this.emitText(path, c, n) });
			occupant = { path: session?.path ?? project.entry(path)?.path ?? path, mounted, session, offs: [] };
			trackWriting(mounted.view);
			if (session) this.watch(occupant, session);
			const previous = s.occupant;
			s.occupant = occupant;
			this.show(s.host, container, banner, editorHost);
			if (previous) await this.release(previous);
			this.onChange?.();
			this.occupantChanged();
			const focusMoved = isTypingPlace(document.activeElement) && document.activeElement !== typingAtRequest && !mounted.view.dom.contains(document.activeElement);
			if (!focusMoved && reveal) {
				mounted.view.focus();
				arriveWriting(mounted.view);
			}
		} catch (e) {
			if (token === s.opening) fill(s.host);
			this.model.notices.notify({ kind: "error", text: `Could not open ${path.slice(path.lastIndexOf("/") + 1)}: ${(e as Error)?.message ?? String(e)}` });
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
		this.occupantChanged();
	}

	private show(host: HTMLElement, pane: HTMLElement, banner: Banner | undefined, editor?: HTMLElement): void {
		fill(pane, banner ? el("div", { class: `sf-editor-banner sf-editor-banner--${banner.kind}`, attrs: { role: "note" } }, noticeIcon(banner.kind, 16), el("span", { class: "sf-editor-banner-text", text: banner.text })) : null, editor);
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
		for (const slot of SLOTS) {
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
		this.occupantChanged();
	}

	private keyOf(path: string): string {
		const project = this.model.running?.opened.project;
		return foldKey(project?.entry(path)?.path ?? path);
	}
}
