import { Compartment, EditorSelection, EditorState, type Extension, type Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import type { TFile } from "obsidian";
import {
	assembleManuscript,
	bodyOffsetToFileOffset,
	parseChapterFile,
	type ChapterRange,
	type ChapterShape,
} from "../../manuscript/manuscriptModel";
import { chapterIndexAt, chapterIndexNear, chaptersTouched } from "../../manuscript/manuscriptBoundaries";
import { chapterRangesField, editRefused, manuscriptStateExtensions, structuralAnnotation, structuralSpec } from "../../manuscript/manuscriptState";
import { minimalReplacement } from "../../manuscript/manuscriptSync";
import { manuscriptHeaders, setChapterTitles, type HeaderHooks } from "./manuscriptHeaders";
import { manuscriptCyclingGuide, manuscriptDepthGuide } from "./manuscriptGuides";

/**
 * The manuscript editor (continuous-mode manuscript brief §3): one storyForge-owned CodeMirror 6
 * editor holding every placed chapter of a book as protected sections of a single document. It is
 * built from the CodeMirror packages esbuild leaves external, so it runs on Obsidian's own copy —
 * no WorkspaceLeaf, no MarkdownView, nothing unofficial. The editor fills its host and scrolls
 * internally, exactly as Obsidian's own editor does; CodeMirror's viewport rendering is what keeps a
 * book-length document cheap.
 *
 * Chapters are keyed by an opaque id mapped to the TFile, never by filename: a rename mutates the
 * TFile in place, so the id still finds it. This class knows what each chapter's file held when
 * last read or written; it never writes anything itself — manuscriptWriter.ts does.
 */

export interface ManuscriptChapterSource {
	file: TFile;
	/** The file's full text as read from disk. */
	raw: string;
	/** Numbered display title, as the chapter tree shows it. */
	title: string;
}

interface ChapterRecord {
	id: string;
	file: TFile;
	shape: ChapterShape;
	/** The file's full text on disk, as far as this editor knows: the base for the next save. */
	diskRaw: string;
	/** `diskRaw`'s editable body: the chapter is unsaved when the editor's text differs from it. */
	diskBody: string;
}

/** The guides as the settings have them: each a word count, or null when that guide is off. */
export interface ManuscriptGuideSettings {
	depthWords: number | null;
	cyclingWords: number | null;
}

export interface ManuscriptSurfaceOptions {
	chapters: ManuscriptChapterSource[];
	guides: ManuscriptGuideSettings;
	/** Where to land: this chapter's header goes to the top of the screen. */
	entryFile: TFile;
	/** False opens the surface read-only (mobile). */
	editable: boolean;
	/** True also stops the on-screen keyboard (mobile): the content can't take focus for typing. */
	lockInput: boolean;
	/** Fires when the chapter at the top of the screen changes. */
	onTopChapterChange: (file: TFile) => void;
	/** Binds the header's right-click menu (rename, and later 'New chapter after this'). */
	decorateHeader: (row: HTMLElement, label: HTMLElement, file: TFile) => void;
	/** The author edited these chapters (never fires for structural transactions). */
	onChaptersEdited: (files: TFile[]) => void;
	/** An edit crossing a chapter break was refused. */
	onEditRefused: () => void;
	/** The control after the last chapter: appends one. Null hides it (no chapter creation). */
	onAppendChapter: (() => void) | null;
}

/** A position held across a rebuild by chapter and offset, since raw positions don't survive one. */
interface ChapterAnchor {
	id: string;
	offset: number;
}

export class ManuscriptSurface {
	readonly view: EditorView;
	private readonly records = new Map<string, ChapterRecord>();
	private readonly editability = new Compartment();
	private readonly depthGuide = new Compartment();
	private readonly cyclingGuide = new Compartment();
	private nextId = 0;
	private topId: string | null = null;
	private scrollFrame: number | null = null;
	private readonly onScroll = (): void => this.scheduleTopCheck();

	constructor(
		parent: HTMLElement,
		private readonly options: ManuscriptSurfaceOptions,
	) {
		const loaded = options.chapters.map((source) => this.register(source.file, source.raw));
		const { text, ranges } = assembleManuscript(loaded.map((record) => ({ id: record.id, body: record.diskBody })));
		const titles = new Map(loaded.map((record, i) => [record.id, options.chapters[i].title]));
		const hooks: HeaderHooks = {
			decorate: (row, label, chapterId) => {
				const record = this.records.get(chapterId);
				if (record) options.decorateHeader(row, label, record.file);
			},
			onAppend: options.onAppendChapter,
		};

		const entry = ranges.find((r) => this.records.get(r.id)?.file === options.entryFile) ?? ranges[0];
		const state = EditorState.create({
			doc: text,
			selection: EditorSelection.cursor(entry?.from ?? 0),
			extensions: [
				manuscriptStateExtensions(ranges),
				manuscriptHeaders(hooks, titles),
				this.editability.of(this.editabilityExtension(options.editable)),
				this.depthGuide.of(depthGuideExtension(options.guides)),
				this.cyclingGuide.of(cyclingGuideExtension(options.guides)),
				history(),
				search({ top: true }),
				highlightSelectionMatches(),
				keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
				EditorView.lineWrapping,
				EditorView.contentAttributes.of({ spellcheck: "true" }),
				// cm-s-obsidian: the class Obsidian's own editor carries, which themes key prose styling on.
				EditorView.editorAttributes.of({ class: "cm-s-obsidian sf-manuscript-editor" }),
				EditorView.updateListener.of((update) => {
					if (update.geometryChanged || update.viewportChanged) this.scheduleTopCheck();
					for (const tr of update.transactions) this.noteTransaction(tr);
				}),
			],
		});

		this.view = new EditorView({ state, parent });
		this.view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
		if (entry) this.scrollToChapterId(entry.id);
	}

	destroy(): void {
		this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
		if (this.scrollFrame !== null) window.cancelAnimationFrame(this.scrollFrame);
		this.view.destroy();
	}

	/** Every chapter file on the manuscript, in spine order. */
	files(): TFile[] {
		return this.ranges().map((r) => this.records.get(r.id)!.file);
	}

	has(file: TFile): boolean {
		return this.recordFor(file) !== undefined;
	}

	/** The chapter at the top of the screen, or null before the first measure. */
	topFile(): TFile | null {
		return this.topId ? (this.records.get(this.topId)?.file ?? null) : null;
	}

	/** The chapter holding the caret, or null when the caret sits on a separator. */
	caretFile(): TFile | null {
		const ranges = this.ranges();
		const i = chapterIndexAt(ranges, this.view.state.selection.main.head);
		return i === -1 ? null : (this.records.get(ranges[i].id)?.file ?? null);
	}

	/** Puts the caret at the end of the chapter (where a new, empty one is ready to type into),
	 * brings its header to the top of the screen, and focuses the editor. */
	focusChapter(file: TFile): void {
		const record = this.recordFor(file);
		const range = record && this.rangeFor(record.id);
		if (!record || !range) return;
		this.view.dispatch({ selection: EditorSelection.cursor(range.to) });
		this.scrollToChapterId(record.id);
		this.view.focus();
	}

	/** Scrolls the chapter's header to the top of the screen. */
	scrollToChapter(file: TFile): void {
		const record = this.recordFor(file);
		if (record) this.scrollToChapterId(record.id);
	}

	/**
	 * Where exit should land (brief §3.7): the caret's chapter, at the caret's offset in the file,
	 * when the caret is on screen; otherwise the chapter at the top of the screen, with no offset.
	 */
	exitTarget(): { file: TFile; offset: number | null } | null {
		const head = this.view.state.selection.main.head;
		const onScreen = this.view.visibleRanges.some((r) => head >= r.from && head <= r.to);
		const ranges = this.ranges();
		const i = chapterIndexAt(ranges, head);
		if (onScreen && i !== -1) {
			const record = this.records.get(ranges[i].id)!;
			const body = this.view.state.doc.sliceString(ranges[i].from, ranges[i].to);
			return { file: record.file, offset: bodyOffsetToFileOffset(record.shape, body, head - ranges[i].from) };
		}
		const top = this.topFile() ?? this.files()[0];
		return top ? { file: top, offset: null } : null;
	}

	/** Switches editing on or off without rebuilding anything. */
	setEditable(editable: boolean): void {
		this.view.dispatch({ effects: this.editability.reconfigure(this.editabilityExtension(editable)) });
	}

	/** Applies changed guide settings live, as rebuildDepthGuideExtension and
	 * rebuildCyclingGuideExtension do for normal editors. */
	setGuides(guides: ManuscriptGuideSettings): void {
		this.view.dispatch({
			effects: [this.depthGuide.reconfigure(depthGuideExtension(guides)), this.cyclingGuide.reconfigure(cyclingGuideExtension(guides))],
		});
	}

	/** Redraws the headers with new numbered titles, keyed by file. Does not touch the document. */
	setTitles(titleFor: (file: TFile) => string): void {
		const titles = new Map<string, string>();
		for (const record of this.records.values()) titles.set(record.id, titleFor(record.file));
		this.view.dispatch({ effects: setChapterTitles.of(titles) });
	}

	/** The chapter's text as it stands in the editor now, or null if it isn't on the manuscript. */
	currentBody(file: TFile): string | null {
		const record = this.recordFor(file);
		const range = record && this.rangeFor(record.id);
		return range ? this.view.state.doc.sliceString(range.from, range.to) : null;
	}

	/** What the chapter's file held when last read or written, and its shape. */
	diskState(file: TFile): { raw: string; body: string; shape: ChapterShape } | null {
		const record = this.recordFor(file);
		return record ? { raw: record.diskRaw, body: record.diskBody, shape: record.shape } : null;
	}

	/** The editor's text differs from what the file is known to hold. */
	isDirty(file: TFile): boolean {
		const body = this.currentBody(file);
		const record = this.recordFor(file);
		return body !== null && record !== undefined && body !== record.diskBody;
	}

	/** A save of `body` landed on disk as `raw`. */
	markWritten(file: TFile, raw: string, body: string): void {
		const record = this.recordFor(file);
		if (!record) return;
		record.diskRaw = raw;
		record.diskBody = body;
	}

	/**
	 * Replaces a chapter's range with what's on disk, as a structural transaction (not undoable, no
	 * boundary filter), caret and scroll preserved by mapping. The caller has already decided this
	 * is right (manuscriptSync.ts's decideDiskChange).
	 */
	reloadFromDisk(file: TFile, raw: string): void {
		const record = this.recordFor(file);
		const range = record && this.rangeFor(record.id);
		if (!record || !range) return;
		const { shape, body } = parseChapterFile(raw);
		record.shape = shape;
		record.diskRaw = raw;
		record.diskBody = body;
		if (this.view.state.doc.sliceString(range.from, range.to) === body) return;
		this.view.dispatch(structuralSpec({ from: range.from, to: range.to, insert: body }));
	}

	/**
	 * Rebuilds the document for a new spine (brief §3.6): chapters still on it keep the text they
	 * have in the editor (so nothing typed is lost); new ones come from `raw`. Applied as one minimal
	 * structural replacement, so undo history and positions outside the changed stretch survive; the
	 * caret's chapter and offset, and the chapter and pixel offset at the top of the screen, are
	 * carried across explicitly in case they sat inside it.
	 */
	rebuild(chapters: { file: TFile; raw: string | null; title: string }[]): void {
		const caret = this.anchorAt(this.view.state.selection.main.head);
		const top = this.captureTop();
		const bodies: { id: string; body: string }[] = [];
		const titles = new Map<string, string>();
		const keep = new Set<string>();
		for (const chapter of chapters) {
			const existing = this.recordFor(chapter.file);
			let id: string;
			let body: string;
			if (existing) {
				id = existing.id;
				body = this.currentBody(chapter.file) ?? existing.diskBody;
			} else {
				const record = this.register(chapter.file, chapter.raw ?? "");
				id = record.id;
				body = record.diskBody;
			}
			keep.add(id);
			bodies.push({ id, body });
			titles.set(id, chapter.title);
		}
		for (const id of Array.from(this.records.keys())) if (!keep.has(id)) this.records.delete(id);

		const { text, ranges } = assembleManuscript(bodies);
		const change = minimalReplacement(this.view.state.doc.toString(), text) ?? undefined;
		const caretRange = caret && ranges.find((r) => r.id === caret.id);
		const head = caretRange ? Math.min(caretRange.from + caret.offset, caretRange.to) : (ranges[0]?.from ?? 0);
		this.view.dispatch(
			structuralSpec(change, ranges, {
				selection: EditorSelection.cursor(Math.min(head, text.length)),
				effects: setChapterTitles.of(titles),
			}),
		);
		if (top) this.restoreTop(top);
	}

	private register(file: TFile, raw: string): ChapterRecord {
		const { shape, body } = parseChapterFile(raw);
		const record: ChapterRecord = { id: `c${this.nextId++}`, file, shape, diskRaw: raw, diskBody: body };
		this.records.set(record.id, record);
		return record;
	}

	/** Reports the author's edits by chapter, and refused cross-chapter edits. */
	private noteTransaction(tr: Transaction): void {
		if (tr.effects.some((e) => e.is(editRefused))) this.options.onEditRefused();
		if (!tr.docChanged || tr.annotation(structuralAnnotation)) return;
		const spans: { from: number; to: number }[] = [];
		tr.changes.iterChangedRanges((fromA, toA) => spans.push({ from: fromA, to: toA }));
		const files = chaptersTouched(tr.startState.field(chapterRangesField), spans)
			.map((id) => this.records.get(id)?.file)
			.filter((file): file is TFile => !!file);
		if (files.length > 0) this.options.onChaptersEdited(files);
	}

	private editabilityExtension(editable: boolean): Extension {
		if (editable) return [];
		return this.options.lockInput ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : EditorState.readOnly.of(true);
	}

	private ranges(): readonly ChapterRange[] {
		return this.view.state.field(chapterRangesField);
	}

	private rangeFor(id: string): ChapterRange | undefined {
		return this.ranges().find((r) => r.id === id);
	}

	private recordFor(file: TFile): ChapterRecord | undefined {
		for (const record of this.records.values()) if (record.file === file) return record;
		return undefined;
	}

	private anchorAt(pos: number): ChapterAnchor | null {
		const ranges = this.ranges();
		const i = chapterIndexNear(ranges, pos);
		if (i === -1) return null;
		return { id: ranges[i].id, offset: Math.max(0, pos - ranges[i].from) };
	}

	/** The chapter and offset of the line at the top of the screen, and how far that line sits
	 * from the scroller's top edge. */
	private captureTop(): (ChapterAnchor & { pixel: number }) | null {
		const view = this.view;
		const scrollerTop = view.scrollDOM.getBoundingClientRect().top;
		const block = view.lineBlockAtHeight(Math.max(0, scrollerTop - view.documentTop + 1));
		const anchor = this.anchorAt(block.from);
		return anchor ? { ...anchor, pixel: view.documentTop + block.top - scrollerTop } : null;
	}

	private restoreTop(top: ChapterAnchor & { pixel: number }): void {
		this.view.requestMeasure({
			key: "sf-manuscript-restore-top",
			read: (view) => {
				const range = this.rangeFor(top.id);
				if (!range) return null;
				const block = view.lineBlockAt(Math.min(range.from + top.offset, range.to));
				return view.documentTop + block.top - view.scrollDOM.getBoundingClientRect().top - top.pixel;
			},
			write: (delta, view) => {
				if (delta !== null && Math.abs(delta) >= 1) view.scrollDOM.scrollTop += delta;
			},
		});
	}

	/**
	 * Puts a chapter's header (the block widget above its first line, which `lineBlockAt` includes)
	 * at the top of the scroller. Off-screen heights are CodeMirror's estimates until rendered, so
	 * this re-measures and corrects for a few frames until it lands.
	 */
	private scrollToChapterId(id: string, attempts = 4): void {
		this.view.requestMeasure({
			key: "sf-manuscript-scroll-to",
			read: (view) => {
				const range = this.rangeFor(id);
				if (!range) return null;
				const block = view.lineBlockAt(range.from);
				return view.documentTop + block.top - view.scrollDOM.getBoundingClientRect().top;
			},
			write: (delta, view) => {
				if (delta === null || Math.abs(delta) < 1) return;
				view.scrollDOM.scrollTop += delta;
				if (attempts > 1) window.requestAnimationFrame(() => this.scrollToChapterId(id, attempts - 1));
			},
		});
	}

	private scheduleTopCheck(): void {
		if (this.scrollFrame !== null) return;
		this.scrollFrame = window.requestAnimationFrame(() => {
			this.scrollFrame = null;
			this.checkTopChapter();
		});
	}

	/** Emits the chapter at the top of the viewport (brief §3.7), from the chapter ranges and
	 * `lineBlockAtHeight`, at most once per animation frame. */
	private checkTopChapter(): void {
		const anchor = this.captureTop();
		if (!anchor || anchor.id === this.topId) return;
		this.topId = anchor.id;
		const record = this.records.get(anchor.id);
		if (record) this.options.onTopChapterChange(record.file);
	}
}

function depthGuideExtension(guides: ManuscriptGuideSettings): Extension {
	return guides.depthWords === null ? [] : manuscriptDepthGuide(guides.depthWords);
}

function cyclingGuideExtension(guides: ManuscriptGuideSettings): Extension {
	return guides.cyclingWords === null ? [] : manuscriptCyclingGuide(guides.cyclingWords);
}
