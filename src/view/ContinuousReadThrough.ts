import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { pickCurrentChapter } from "../continuousMode";

export interface ContinuousReadThroughOptions {
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
}

/**
 * Codex-focus's continuous read-and-write mode read-through (continuous-mode hand-off brief §2.1
 * onwards). Renders the placed spine into one scroll container, one chapter per section, virtualising
 * mount/unmount so the DOM cost tracks what's on screen rather than the whole book (§2.2). Reading
 * is strictly read-only here — `cachedRead` + `MarkdownRenderer.render` — click-to-edit is CM-2.
 *
 * A single IntersectionObserver pair drives both concerns described in §2.2/§2.3: a wide-margin
 * observer decides what's mounted, a viewport-true observer feeds `pickCurrentChapter` for the live
 * position indicator and for "whichever chapter they scrolled to" on exit.
 */
export function renderContinuousReadThrough(
	app: App,
	container: HTMLElement,
	options: ContinuousReadThroughOptions,
): ContinuousReadThroughHandle {
	const scrollEl = container.createDiv({ cls: "sf-continuous-scroll" });
	const component = new Component();
	component.load();

	const sections = new Map<string, ChapterSection>();
	const visibility = new Map<string, number>();
	let currentFilename: string | null = options.entryFilename;

	for (const file of options.ordered) {
		const wrapper = scrollEl.createDiv({ cls: "sf-continuous-chapter" });
		wrapper.dataset.filename = file.name;
		wrapper.createDiv({ cls: "sf-continuous-header", text: options.titleFor(file) });
		// markdown-rendered picks up Obsidian's own reading-view styling (headings, lists, etc.).
		const body = wrapper.createDiv({ cls: "sf-continuous-body markdown-rendered" });
		sections.set(file.name, { file, wrapper, body, mounted: false });
	}

	const paint = (section: ChapterSection): void => {
		void app.vault.cachedRead(section.file).then((content) => {
			if (!section.mounted) return; // scrolled away again (or refreshed away) before this resolved
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
