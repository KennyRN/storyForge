import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { chapterDisplayTitle, renameChapterTitle } from "../book";
import { pickCurrentChapter } from "../continuousMode";
import { attachInlineRename } from "./inlineRename";
import { isLinkClick, resolveClickedSourceOffset } from "./clickToEditDom";

export interface ContinuousReadThroughOptions {
	bookFolderName: string;
	/** The placed spine only (book.ts's getBookChapters()'s `ordered`) — idea/unplaced chapters
	 * never appear in the read-through. */
	ordered: TFile[];
	/** Numbered display title (chapterDisplayTitle + hash-numbering), matching the tree and the
	 * rest of the app. */
	titleFor: (file: TFile) => string;
	/** Which chapter to land on the instant the read-through mounts — the reader's current chapter
	 * on first entry, or wherever they last scrolled to on an incidental re-render (hand-off brief
	 * §2.4). Must be one of `ordered`'s filenames. */
	entryFilename: string;
	/** Fires whenever the live-tracked "current" chapter changes as the reader scrolls. */
	onPositionChange: (filename: string) => void;
	/** A deliberate click on a chapter's body (hand-off brief §2.6/§2.8) — since there's no public
	 * way to mount a real editor inline (Editor/MarkdownView have no public standalone constructor),
	 * this commits to editing by handing off to a real single-chapter editor elsewhere, with the
	 * caret landing at `sourceOffset`, same accuracy bar as the brief asks for. */
	onEditChapter: (file: TFile, sourceOffset: number) => void;
	/** A chapter's title changed via the header's right-click rename — numbering and the tree may
	 * both need to catch up, so the caller re-renders fully rather than this patching itself in place. */
	onChapterRenamed: () => void;
}

export interface ContinuousReadThroughHandle {
	/** Scrolls the read-through to the given chapter's header — backs the reframed transport row
	 * and the live-position indicator's tiles. */
	scrollTo: (filename: string) => void;
	/** Whichever chapter is currently tracked as "centred" — used to hand off to the editor on exit. */
	getCurrentFilename: () => string | null;
	/** Disconnects both observers and unregisters the vault listener. Must be called before the
	 * container is torn down, since the observers otherwise keep firing against detached nodes. */
	dispose: () => void;
}

interface ChapterSection {
	file: TFile;
	wrapper: HTMLElement;
	body: HTMLElement;
	mounted: boolean;
	/** The last content painted into `body` — click-to-edit maps against this, not a fresh read,
	 * so the clicked DOM and the source text used for mapping are always the same snapshot. */
	content: string | null;
}

/**
 * Codex-focus's continuous read-and-write mode read-through (continuous-mode hand-off brief §2.1
 * onwards). Renders the placed spine into one scroll container, one chapter per section, virtualising
 * mount/unmount so the DOM cost tracks what's on screen rather than the whole book (§2.2). Reading
 * itself is strictly read-only — `cachedRead` + `MarkdownRenderer.render`; no chapter body is ever
 * written by this module.
 *
 * A single IntersectionObserver pair drives both concerns described in §2.2/§2.3: a wide-margin
 * observer decides what's mounted, a viewport-true observer feeds `pickCurrentChapter` for the live
 * position indicator and for "whichever chapter they scrolled to" on exit.
 *
 * Click-to-edit (§2.6/§2.8): a click on rendered prose maps back to its exact source offset (see
 * clickToCaret.ts/clickToEditDom.ts) and hands off to a real editor there; a click on a rendered
 * link navigates instead (Obsidian's own rendered output already wires that up — this module just
 * steps out of the way); the chapter header is inert to left-click and renamed only via right-click
 * through the existing rename path (§2.7).
 */
export function renderContinuousReadThrough(
	app: App,
	container: HTMLElement,
	options: ContinuousReadThroughOptions,
): ContinuousReadThroughHandle {
	// markdown-reading-view: storyForge's own chapter typography (headings, dialogue, emphasis —
	// see styles.css) is scoped under that class, the same as Obsidian's real reading view, so it
	// has to be present here too or chapters render in generic, unstyled type.
	const scrollEl = container.createDiv({ cls: "sf-continuous-scroll markdown-reading-view" });
	const component = new Component();
	component.load();

	const sections = new Map<string, ChapterSection>();
	const visibility = new Map<string, number>();
	let currentFilename: string | null = options.entryFilename;

	for (const file of options.ordered) {
		const wrapper = scrollEl.createDiv({ cls: "sf-continuous-chapter" });
		wrapper.dataset.filename = file.name;

		const header = wrapper.createDiv({ cls: "sf-continuous-header" });
		const headerLabel = header.createSpan({ text: options.titleFor(file) });
		// Header is inert to left-click by construction — no click listener here at all — and
		// renamed only via this right-click menu, through the same path the chapter tree uses.
		attachInlineRename({
			row: header,
			label: headerLabel,
			getCurrentTitle: () => chapterDisplayTitle(app, options.bookFolderName, file.name),
			onCommit: async (newTitle) => {
				await renameChapterTitle(app, options.bookFolderName, file.name, newTitle);
				options.onChapterRenamed();
			},
		});

		// markdown-rendered picks up Obsidian's own reading-view styling (headings, lists, etc.).
		const body = wrapper.createDiv({ cls: "sf-continuous-body markdown-rendered" });
		const section: ChapterSection = { file, wrapper, body, mounted: false, content: null };
		body.addEventListener("click", (e) => {
			if (!section.mounted || section.content === null) return;
			if (isLinkClick(e.target)) return; // let Obsidian's own link navigation handle it
			const offset = resolveClickedSourceOffset(body, section.content, e.clientX, e.clientY);
			if (offset !== null) options.onEditChapter(file, offset);
		});
		sections.set(file.name, section);
	}

	const paint = (section: ChapterSection): void => {
		void app.vault.cachedRead(section.file).then((content) => {
			if (!section.mounted) return; // scrolled away again (or refreshed away) before this resolved
			section.content = content;
			section.body.empty();
			void MarkdownRenderer.render(app, content, section.body, section.file.path, component);
		});
	};

	const mount = (filename: string): void => {
		const section = sections.get(filename);
		if (!section || section.mounted) return;
		section.mounted = true;
		section.wrapper.style.minHeight = "";
		paint(section);
	};

	const unmount = (filename: string): void => {
		const section = sections.get(filename);
		if (!section || !section.mounted) return;
		section.mounted = false;
		section.content = null;
		// Hold the section's last measured height so unmounting its content doesn't shrink the
		// scroll container and yank chapters below it up underneath the reader.
		const height = section.wrapper.getBoundingClientRect().height;
		section.body.empty();
		section.wrapper.style.minHeight = `${height}px`;
	};

	const mountObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const filename = (entry.target as HTMLElement).dataset.filename;
				if (!filename) continue;
				if (entry.isIntersecting) mount(filename);
				else unmount(filename);
			}
		},
		// A generous margin either side of the visible area so scrolling stays smooth — content is
		// already mounted by the time it comes on screen, rather than popping in.
		{ root: scrollEl, rootMargin: "150% 0px 150% 0px", threshold: 0 },
	);

	const positionObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const filename = (entry.target as HTMLElement).dataset.filename;
				if (!filename) continue;
				visibility.set(filename, entry.isIntersecting ? entry.intersectionRatio : 0);
			}
			const next = pickCurrentChapter(Array.from(visibility, ([filename, ratio]) => ({ filename, ratio })));
			if (next && next !== currentFilename) {
				currentFilename = next;
				options.onPositionChange(next);
			}
		},
		// No expanded margin here — this one tracks what's actually on screen, not what's mounted.
		{ root: scrollEl, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
	);

	for (const section of sections.values()) {
		mountObserver.observe(section.wrapper);
		positionObserver.observe(section.wrapper);
	}

	// Freshness (§2.5): a chapter edited elsewhere while mounted here must not silently drift.
	// Matched by path, not filename — filenames are only unique within one book's folder.
	component.registerEvent(
		app.vault.on("modify", (file) => {
			if (!(file instanceof TFile)) return;
			const section = options.ordered.find((f) => f.path === file.path) && sections.get(file.name);
			if (section?.mounted) paint(section);
		}),
	);

	const entrySection = sections.get(options.entryFilename);
	entrySection?.wrapper.scrollIntoView({ block: "start" });

	return {
		scrollTo: (filename) => {
			sections.get(filename)?.wrapper.scrollIntoView({ block: "start", behavior: "smooth" });
		},
		getCurrentFilename: () => currentFilename,
		dispose: () => {
			mountObserver.disconnect();
			positionObserver.disconnect();
			component.unload();
		},
	};
}
