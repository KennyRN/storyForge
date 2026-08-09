import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { chapterDisplayTitle, renameChapterTitle } from "../book";
import { pickCurrentChapter } from "../continuousMode";
import { bookFolderNameFromChapterPath } from "../paths";
import { attachInlineRename } from "./inlineRename";
import { isLinkClick, resolveClickedBlock } from "./clickToEditDom";

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
	/** A deliberate click on a chapter's body (hand-off brief §2.6/§2.8) — the caller owns the one
	 * live editor (inline-editor research brief §3.3: this module must not own it), so this just
	 * reports the click; the caller locks the section (see `lockSectionForEditing`) and mounts. */
	/** `clickedTop` is the clicked block's own `getBoundingClientRect().top` at click time, before
	 * anything is torn down for editing — the caller needs it to correct the outer scroll position
	 * once the grafted editor's caret lands somewhere slightly different on screen (research brief
	 * §7). */
	onEditChapter: (file: TFile, sourceOffset: number, clickedTop: number) => void;
	/** The section currently locked for editing (see `lockSectionForEditing`) has scrolled fully out
	 * of the true viewport — the signal to commit the live editor and unlock (inline-editor research
	 * brief §3.4). */
	onEditedSectionScrolledAway: (filename: string) => void;
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
	/** The outer scroll container — callers preserve its `scrollTop` around mounting a live editor,
	 * since the editor's own focus/open behaviour can otherwise scroll it (inline-editor research
	 * brief §3.1). */
	getScrollElement: () => HTMLElement;
	/**
	 * Locks a section against virtualisation unmount, clears its rendered content, and returns the
	 * now-empty container to graft a live editor into. The caller (the one place that may hold a
	 * live editor) is responsible for calling `unlockSection` once that editor commits — this module
	 * never mounts, owns, or tears down an editor itself.
	 */
	lockSectionForEditing: (filename: string) => HTMLElement | null;
	/** Reverts a locked section back to normal virtualised rendering (re-painting it if it's still
	 * within the mount window). Call after the live editor mounted via `lockSectionForEditing` commits. */
	unlockSection: (filename: string) => void;
	/** Disconnects both observers and unloads the render Component tree. Must be called before the
	 * container is torn down, since the observers otherwise keep firing against detached nodes. */
	dispose: () => void;
}

interface ChapterSection {
	file: TFile;
	wrapper: HTMLElement;
	body: HTMLElement;
	mounted: boolean;
	/** True while a live editor occupies `body` in place of rendered markup — the mount observer's
	 * unmount must refuse to touch a locked section outright, not just skip repainting it. */
	locked: boolean;
	/** The last content painted into `body` — click-to-edit maps against this, not a fresh read,
	 * so the clicked DOM and the source text used for mapping are always the same snapshot. */
	content: string | null;
	/** Bumped on every mount/unmount/lock so a `paint()` still in flight from a superseded mount can
	 * tell it's been overtaken and bail out, rather than write into a section that's moved on. */
	paintToken: number;
	/** Owns this mount's `MarkdownRenderer` children — created fresh per mount, unloaded (not just
	 * emptied) on unmount, so renderer children don't quietly accumulate across a long session. */
	renderComponent: Component | null;
}

/**
 * Codex-focus's continuous read-and-write mode read-through (continuous-mode hand-off brief §2.1
 * onwards). Renders the placed spine into one scroll container, one chapter per section, virtualising
 * mount/unmount so the DOM cost tracks what's on screen rather than the whole book (§2.2). Reading
 * itself is strictly read-only — `cachedRead` + `MarkdownRenderer.render`; no chapter body is ever
 * written by this module. A section under a live editor (see `lockSectionForEditing`) is the one
 * exception to virtualisation: it's held mounted regardless of scroll position until unlocked.
 *
 * A single IntersectionObserver pair drives both concerns described in §2.2/§2.3: a wide-margin
 * observer decides what's mounted (with a short unload hysteresis — inline-editor research brief
 * §5.2 — so a fast scroll or an on-screen keyboard resize doesn't thrash mount/unmount), a
 * viewport-true observer feeds `pickCurrentChapter` for the live position indicator, "whichever
 * chapter they scrolled to" on exit, and the locked section's scroll-away commit signal (§3.4).
 *
 * Click-to-edit (§2.6/§2.8): a click on rendered prose maps back to its exact source offset (see
 * clickToCaret.ts/clickToEditDom.ts) and reports it via `onEditChapter` — the caller owns the actual
 * editor (inline-editor research brief §3.3); a click on a rendered link navigates instead
 * (Obsidian's own rendered output already wires that up — this module just steps out of the way); a
 * drag-to-select doesn't trigger an edit either; the chapter header is inert to left-click and
 * renamed only via right-click through the existing rename path (§2.7).
 */
export function renderContinuousReadThrough(
	app: App,
	container: HTMLElement,
	parentComponent: Component,
	options: ContinuousReadThroughOptions,
): ContinuousReadThroughHandle {
	// markdown-reading-view: storyForge's own chapter typography (headings, dialogue, emphasis —
	// see styles.css) is scoped under that class, the same as Obsidian's real reading view, so it
	// has to be present here too or chapters render in generic, unstyled type.
	const scrollEl = container.createDiv({ cls: "sf-continuous-scroll markdown-reading-view" });
	// A child of the caller's own Component (ContinuousReadView), not a free-standing instance —
	// Obsidian's own lifecycle then releases every render child under it even if dispose() is
	// somehow missed.
	const component = parentComponent.addChild(new Component());

	const sections = new Map<string, ChapterSection>();
	const visibility = new Map<string, number>();
	const unmountTimers = new Map<string, number>();
	let currentFilename: string | null = options.entryFilename;
	let lockedFilename: string | null = null;
	let hasScrolledToEntry = false;

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
		const section: ChapterSection = {
			file,
			wrapper,
			body,
			mounted: false,
			locked: false,
			content: null,
			paintToken: 0,
			renderComponent: null,
		};
		// Click-to-edit is DISABLED as of 2026-08-09 — continuous mode is read-through only for now.
		// The grafted inline editor (src/view/graftedEditor.ts) worked in isolation, but never
		// reliably rendered/scrolled as part of this continuous scroll: the chapter would go blank on
		// click in live testing, across four separate confirmed-and-fixed bugs in a row (a 0-height
		// collapse, a CSS overflow-blockification bug, an `all: unset`-caused width collapse, and
		// Obsidian's own `contain: strict` on `.workspace-leaf` defeating all content-based sizing) —
		// and it was *still* broken after all four fixes, with at least one more uncaught factor never
		// isolated. Rather than keep debugging live indefinitely, Kenny asked for this to be parked.
		//
		// Full audit trail — both research hand-off prompts and both responses in full, plus this
		// session's live debugging blow-by-blow and exactly what's confirmed vs. still open — is in
		// `docs/continuous-mode-inline-editor-postmortem.md`. Read that before touching this again.
		//
		// FLAG FOR FUTURE CODE AUDITS: this is a known, deliberately-parked gap, not an oversight —
		// but it's still an unfinished feature sitting dormant in the codebase and deserves a look
		// next time this area of the code is reviewed. Don't let it go silently stale.
		//
		// Nothing below this comment was deleted — `graftEditor`, `ContinuousReadView.editChapter`/
		// `commitActiveEdit`, and `resolveClickedBlock` are all intact and functional. Re-enabling is
		// restoring the two lines below (see the postmortem's §9 for the recommended first step before
		// doing so — re-run the live diagnostic that was never finished).
		//
		// body.addEventListener("click", (e) => {
		// 	if (!section.mounted || section.locked || section.content === null) return;
		// 	// A drag-to-select still fires a click when the mouse comes up — without this guard,
		// 	// selecting a sentence to copy it destroys the selection by jumping into edit mode instead.
		// 	const selection = body.ownerDocument.getSelection();
		// 	if (selection && !selection.isCollapsed) return;
		// 	if (isLinkClick(e.target)) return; // let Obsidian's own link navigation handle it
		// 	const result = resolveClickedBlock(body, section.content, e.clientX, e.clientY);
		// 	if (result) options.onEditChapter(file, result.scopeStart, result.scopeEl.getBoundingClientRect().top);
		// });
		sections.set(file.name, section);
	}

	/** Reads, renders, and — only once content is actually about to replace the held placeholder —
	 * clears the section's `minHeight`. Returns the render promise so the entry scroll can wait on
	 * it rather than firing before anything has real height. */
	const paint = (section: ChapterSection): Promise<void> => {
		const token = section.paintToken;
		return app.vault.cachedRead(section.file).then((content) => {
			// Superseded by an unmount, a lock, or a newer mount while the read was in flight — bail
			// out rather than write stale content into a section that's since moved on.
			if (!section.mounted || section.locked || section.paintToken !== token || !section.renderComponent) return;
			section.content = content;
			section.wrapper.style.minHeight = "";
			section.body.empty();
			return MarkdownRenderer.render(app, content, section.body, section.file.path, section.renderComponent);
		});
	};

	const mount = (filename: string): void => {
		const section = sections.get(filename);
		if (!section || section.mounted) return;
		section.mounted = true;
		section.paintToken++;
		section.renderComponent = component.addChild(new Component());
		void paint(section);
	};

	const unmount = (filename: string): void => {
		const section = sections.get(filename);
		// A locked section is under a live editor — virtualisation must leave it alone entirely
		// until it's unlocked (inline-editor research brief §3.4).
		if (!section || !section.mounted || section.locked) return;
		section.mounted = false;
		section.paintToken++;
		section.content = null;
		if (section.renderComponent) {
			component.removeChild(section.renderComponent); // unloads it, releasing renderer children
			section.renderComponent = null;
		}
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
				const pendingUnmount = unmountTimers.get(filename);
				if (entry.isIntersecting) {
					if (pendingUnmount !== undefined) {
						window.clearTimeout(pendingUnmount);
						unmountTimers.delete(filename);
					}
					mount(filename);
				} else if (pendingUnmount === undefined) {
					// A short unload hysteresis (inline-editor research brief §5.2) so a fast scroll
					// past a chapter, or a virtual keyboard briefly resizing the viewport, doesn't
					// thrash mount/unmount — the section only actually unmounts if it's still out of
					// range a second later.
					unmountTimers.set(
						filename,
						window.setTimeout(() => {
							unmountTimers.delete(filename);
							unmount(filename);
						}, 1000),
					);
				}
			}
		},
		// A generous margin either side of the visible area so scrolling stays smooth — content is
		// already mounted by the time it comes on screen, rather than popping in. Kept tighter than a
		// "just render everything nearby" instinct would suggest: this project runs rendered markup
		// here, not full editors, so there's less to gain from a wider margin than there would be if
		// every mounted section were as heavy as the one under a live editor.
		{ root: scrollEl, rootMargin: "80% 0px 80% 0px", threshold: 0 },
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
			// The locked section (if any) has genuinely scrolled out of the true viewport — this is
			// the commit signal, distinct from the mount observer's much wider margin (§3.4).
			if (lockedFilename && (visibility.get(lockedFilename) ?? 0) === 0) {
				options.onEditedSectionScrolledAway(lockedFilename);
			}
		},
		// No expanded margin here — this one tracks what's actually on screen, not what's mounted.
		{ root: scrollEl, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
	);

	for (const section of sections.values()) {
		mountObserver.observe(section.wrapper);
		positionObserver.observe(section.wrapper);
	}

	// Force-paint the entry chapter and land on it only once it actually has height. Scrolling
	// before anything is painted has nothing to land on — every wrapper is still just its header's
	// height at that point, since the observers haven't fired yet against the unscrolled viewport.
	const entrySection = sections.get(options.entryFilename);
	if (entrySection) {
		entrySection.mounted = true;
		entrySection.paintToken++;
		entrySection.renderComponent = component.addChild(new Component());
		void paint(entrySection).then(() => {
			if (hasScrolledToEntry) return;
			hasScrolledToEntry = true;
			entrySection.wrapper.scrollIntoView({ block: "start" });
		});
	}

	// Freshness (§2.5): a chapter edited elsewhere while mounted here must not silently drift.
	// bookFolderNameFromChapterPath rejects the vast majority of vault-wide writes (codex notes,
	// other books, backstage frontmatter) in O(1) before touching `sections` at all.
	component.registerEvent(
		app.vault.on("modify", (file) => {
			if (!(file instanceof TFile)) return;
			if (bookFolderNameFromChapterPath(file.path) !== options.bookFolderName) return;
			// `sections`'s keys are file.name captured once at construction — if this chapter was
			// renamed since, that key is stale, so fall back to matching the live TFile reference
			// itself (Obsidian mutates a TFile's path/name in place on rename rather than replacing it).
			const section = sections.get(file.name) ?? Array.from(sections.values()).find((s) => s.file === file);
			if (section?.mounted && !section.locked) void paint(section);
		}),
	);

	return {
		scrollTo: (filename) => {
			sections.get(filename)?.wrapper.scrollIntoView({ block: "start", behavior: "smooth" });
		},
		getCurrentFilename: () => currentFilename,
		getScrollElement: () => scrollEl,
		lockSectionForEditing: (filename) => {
			const section = sections.get(filename);
			if (!section) return null;
			section.locked = true;
			lockedFilename = filename;
			section.paintToken++;
			section.content = null;
			if (section.renderComponent) {
				component.removeChild(section.renderComponent);
				section.renderComponent = null;
			}
			section.wrapper.style.minHeight = ""; // let the editor determine its own height
			section.body.empty();
			return section.body;
		},
		unlockSection: (filename) => {
			const section = sections.get(filename);
			if (!section) return;
			section.locked = false;
			if (lockedFilename === filename) lockedFilename = null;
			if (section.mounted) {
				section.paintToken++;
				section.renderComponent = component.addChild(new Component());
				void paint(section);
			}
		},
		dispose: () => {
			mountObserver.disconnect();
			positionObserver.disconnect();
			for (const timer of unmountTimers.values()) window.clearTimeout(timer);
			unmountTimers.clear();
			parentComponent.removeChild(component); // cascades to every section's renderComponent
		},
	};
}
