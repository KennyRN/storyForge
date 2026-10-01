import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import type { TFile } from "obsidian";
import { assembleManuscript, bodyOffsetToFileOffset, parseChapterFile, type ChapterRange, type ChapterShape } from "../../manuscript/manuscriptModel";
import { chapterIndexAt, chapterIndexNear } from "../../manuscript/manuscriptBoundaries";
import { chapterRangesField, manuscriptStateExtensions, structuralSpec } from "../../manuscript/manuscriptState";
import { manuscriptHeaders, setChapterTitles, type HeaderHooks } from "./manuscriptHeaders";

/**
 * The manuscript editor (continuous-mode manuscript brief §3): one storyForge-owned CodeMirror 6
 * editor holding every placed chapter of a book as protected sections of a single document. It is
 * built from the CodeMirror packages esbuild leaves external, so it runs on Obsidian's own copy —
 * no WorkspaceLeaf, no MarkdownView, nothing unofficial. The editor fills its host and scrolls
 * internally, exactly as Obsidian's own editor does; CodeMirror's viewport rendering is what keeps a
 * book-length document cheap.
 *
 * Chapters are keyed by an opaque id mapped to the TFile, never by filename: a rename mutates the
 * TFile in place, so the id still finds it.
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
	/** The body as it stands on disk, as far as this editor knows. */
	diskBody: string;
}

export interface ManuscriptSurfaceOptions {
	chapters: ManuscriptChapterSource[];
	/** Where to land: this chapter's header goes to the top of the screen. */
	entryFile: TFile;
	/** False opens the surface read-only (mobile, and the editing-off stage of the build). */
	editable: boolean;
	/** True also stops the on-screen keyboard (mobile): the content can't take focus for typing. */
	lockInput: boolean;
	/** Fires when the chapter at the top of the screen changes. */
	onTopChapterChange: (file: TFile) => void;
	/** Binds the header's right-click menu (rename, and later 'New chapter after this'). */
	decorateHeader: (row: HTMLElement, label: HTMLElement, file: TFile) => void;
}

export class ManuscriptSurface {
	readonly view: EditorView;
	private readonly records = new Map<string, ChapterRecord>();
	private readonly editability = new Compartment();
	private nextId = 0;
	private topId: string | null = null;
	private scrollFrame: number | null = null;
	private readonly onScroll = (): void => this.scheduleTopCheck();

	constructor(
		parent: HTMLElement,
		private readonly options: ManuscriptSurfaceOptions,
	) {
		const loaded = options.chapters.map((source) => this.register(source.file, source.raw));
		const { text, ranges } = assembleManuscript(loaded.map(({ record, body }) => ({ id: record.id, body })));
		const titles = new Map(loaded.map(({ record }, i) => [record.id, options.chapters[i].title]));
		const hooks: HeaderHooks = {
			decorate: (row, label, chapterId) => {
				const record = this.records.get(chapterId);
				if (record) options.decorateHeader(row, label, record.file);
			},
		};

		const entry = ranges.find((r) => this.records.get(r.id)?.file === options.entryFile) ?? ranges[0];
		const state = EditorState.create({
			doc: text,
			selection: EditorSelection.cursor(entry?.from ?? 0),
			extensions: [
				manuscriptStateExtensions(ranges),
				manuscriptHeaders(hooks, titles),
				this.editability.of(this.editabilityExtension(options.editable)),
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

	/** The chapter at the top of the screen, or null before the first measure. */
	topFile(): TFile | null {
		return this.topId ? (this.records.get(this.topId)?.file ?? null) : null;
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

	/** Redraws the headers with new numbered titles, keyed by file. Does not touch the document. */
	setTitles(titleFor: (file: TFile) => string): void {
		const titles = new Map<string, string>();
		for (const record of this.records.values()) titles.set(record.id, titleFor(record.file));
		this.view.dispatch({ effects: setChapterTitles.of(titles) });
	}

	/**
	 * A chapter of this book changed on disk (brief §3.6): replace its range from disk as a
	 * structural transaction, caret and scroll preserved by mapping. Returns false when the file
	 * isn't on this manuscript. Disk text equal to what's already here (our own write echoing
	 * back, or a metadata-only touch) changes nothing.
	 */
	reloadFromDisk(file: TFile, raw: string): boolean {
		const record = this.recordFor(file);
		if (!record) return false;
		const { shape, body } = parseChapterFile(raw);
		record.shape = shape;
		const range = this.rangeFor(record.id);
		if (!range) return false;
		const current = this.view.state.doc.sliceString(range.from, range.to);
		record.diskBody = body;
		if (current === body) return true;
		this.view.dispatch(structuralSpec({ from: range.from, to: range.to, insert: body }));
		return true;
	}

	private register(file: TFile, raw: string): { record: ChapterRecord; body: string } {
		const { shape, body } = parseChapterFile(raw);
		const record: ChapterRecord = { id: `c${this.nextId++}`, file, shape, diskBody: body };
		this.records.set(record.id, record);
		return { record, body };
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
		const view = this.view;
		const height = view.scrollDOM.getBoundingClientRect().top - view.documentTop + 1;
		const block = view.lineBlockAtHeight(Math.max(0, height));
		const ranges = this.ranges();
		const i = chapterIndexNear(ranges, block.from);
		if (i === -1) return;
		const id = ranges[i].id;
		if (id === this.topId) return;
		this.topId = id;
		const record = this.records.get(id);
		if (record) this.options.onTopChapterChange(record.file);
	}
}
