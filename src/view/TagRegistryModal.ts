import { App, Modal, Notice, setIcon, setTooltip } from "obsidian";
import {
	addTagDefinition,
	deleteTagDefinition,
	PROTECTED_CODEX_TYPE_IDS,
	readTagRegistry,
	renameTagDefinition,
	reorderTagDefinitions,
	resolveIconAlias,
	setTagDefinitionIcon,
	type TagDefinition,
	type TagListKind,
} from "../tagRegistry";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { renderTabbedBody } from "./styleModalHelpers";
import {
	ICON_ARCHIVE_FILLED,
	ICON_CODEX,
	ICON_MINUS_SQUARE,
	ICON_NOTEBOOK_DUOTONE,
	ICON_PLUS_SQUARE,
	ICON_TAG,
} from "../icons";
import { confirmDelete } from "./confirmDeleteModal";

export type TypesTabId = "codexTypes" | "ideaTypes" | "archiveTypes";
export type TagRegistryScope = TypesTabId | "tags";

const TAG_TABS: { id: TagListKind; label: string; addPlaceholder: string }[] = [
	{ id: "chapterTags", label: "Chapter tags", addPlaceholder: 'New chapter tag (e.g. "2nd pass")' },
	{ id: "novelTags", label: "Novel tags", addPlaceholder: 'New novel tag (e.g. "Needs cover")' },
];

const TYPES_TABS: { id: TypesTabId; icon: string; label: string; addPlaceholder: string }[] = [
	{ id: "codexTypes", icon: ICON_CODEX, label: "Codex", addPlaceholder: 'New type name (e.g. "Faction")' },
	{ id: "ideaTypes", icon: ICON_NOTEBOOK_DUOTONE, label: "Notebook", addPlaceholder: 'New notebook type (e.g. "Plot")' },
	{ id: "archiveTypes", icon: ICON_ARCHIVE_FILLED, label: "Archive", addPlaceholder: 'New archive type (e.g. "Reference")' },
];

function isTypesScope(scope: TagRegistryScope): scope is TypesTabId {
	return scope !== "tags";
}

/** Manage Codex / Notebook / Archive types, or chapter/novel tags, as two separate dialogs: add,
 * rename, re-icon, reorder, delete. Types share one icon-tabbed window (Codex globe, Notebook,
 * Archive in that order). Codex types additionally nest — see renderCodexTypesList. */
export class TagRegistryModal extends Modal {
	private typesTab: TypesTabId;

	constructor(
		app: App,
		private onChange: () => void,
		private registryScope: TagRegistryScope,
	) {
		super(app);
		this.typesTab = isTypesScope(registryScope) ? registryScope : "codexTypes";
	}

	onOpen(): void {
		if (isTypesScope(this.registryScope)) {
			this.modalEl.addClass("sf-codex-types-modal");
		}
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * `fresh`, when passed, is the just-written result of a mutation this modal itself just made —
	 * used in place of a readTagRegistry() re-read for whichever list it names. Necessary because
	 * `app.metadataCache` doesn't update synchronously with `processFrontMatter` in real Obsidian
	 * (see tagRegistry.ts's mutateTagList doc comment): re-reading immediately after an add/set-icon/
	 * delete can still see the pre-mutation frontmatter, which is exactly what made newly-added Codex
	 * types (and their icon/delete edits) silently fail to show up until the modal was reopened.
	 */
	private render(fresh?: { list: TagListKind; entries: TagDefinition[] }): void {
		// No isDragInProgress() guard here (unlike StoryForgeView, a long-lived panel that gets
		// re-rendered by unrelated external vault events mid-drag): nothing outside this modal ever
		// calls render() on it, and every internal caller (onOpen, and each action handler below)
		// only runs after its own gesture/write has already completed. Guarding it anyway just means
		// a lock leaked from somewhere else in the app can turn a fresh modal open into a permanently
		// blank, unstyled dialog with no way to recover short of the lock's own stale-timeout.
		this.modalEl.addClass("sf-tag-registry-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-tag-registry-modal");

		if (isTypesScope(this.registryScope)) {
			this.renderTypesTabs(contentEl);
			const scroll = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });
			const body = scroll.createDiv({ cls: "sf-text-style-tab-body" });
			if (this.typesTab === "codexTypes") {
				this.renderCodexTypesList(body, fresh?.list === "codexTypes" ? fresh.entries : undefined);
			} else {
				const tab = TYPES_TABS.find((entry) => entry.id === this.typesTab) ?? TYPES_TABS[1];
				this.renderList(
					body,
					this.typesTab,
					tab.addPlaceholder,
					fresh?.list === this.typesTab ? fresh.entries : undefined,
				);
			}
			return;
		}

		renderTabbedBody(
			contentEl,
			TAG_TABS.map((tab) => ({
				id: tab.id,
				label: tab.label,
				render: (body: HTMLElement) =>
					this.renderList(body, tab.id, tab.addPlaceholder, fresh?.list === tab.id ? fresh.entries : undefined),
			})),
		);
	}

	/** Codex / Notebook / Archive — same icon size and colour-only active treatment as the
	 * storyForge panel's layout tabs (`.sf-layout-tab`). */
	private renderTypesTabs(parent: HTMLElement): void {
		const tabs = parent.createDiv({ cls: "sf-layout-tabs sf-types-modal-tabs", attr: { role: "tablist" } });
		for (const tab of TYPES_TABS) {
			const btn = tabs.createSpan({
				cls: `sf-layout-tab${this.typesTab === tab.id ? " is-active" : ""}`,
				attr: {
					role: "tab",
					tabindex: "0",
					"aria-label": tab.label,
					"aria-selected": String(this.typesTab === tab.id),
				},
			});
			setIcon(btn.createSpan({ cls: "sf-layout-tab-icon" }), tab.icon);
			setTooltip(btn, tab.label);
			const select = () => {
				if (this.typesTab === tab.id) return;
				this.typesTab = tab.id;
				this.render();
			};
			btn.addEventListener("click", select);
			makeAccessibleActivatable(btn, select);
		}
	}

	/** Flat renderer — Notebook/Archive types and chapterTags/novelTags, which never nest.
	 * `freshEntries` overrides the readTagRegistry() lookup — see render()'s doc comment. */
	private renderList(body: HTMLElement, list: TagListKind, addPlaceholder: string, freshEntries?: TagDefinition[]): void {
		const entries = freshEntries ?? readTagRegistry(this.app)[list];

		const rowsEl = body.createDiv({ cls: "sf-modal-book-list sf-tag-registry-list" });
		if (entries.length === 0) {
			rowsEl.createDiv({ cls: "sf-empty sf-empty-inline", text: "Nothing here yet — add one below." });
		}
		for (const entry of entries) {
			this.renderRow(rowsEl, list, entry);
		}

		const zones: DragZone[] = [{ key: "order", container: rowsEl }];
		makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
			void this.handleReorder(list, (zoneRowKeys.order ?? []).filter(Boolean));
		});

		this.renderAddRow(body, list, addPlaceholder);
	}

	/**
	 * Codex types nest, but only one level deep and only under the built-in "person"/"place"
	 * types (TagDefinition.parentId) — heroes/villains under Person, star systems/cities under
	 * Place, say. Each top-level type is its own draggable unit (`.sf-tag-registry-top-row`,
	 * dragged as a whole via makeReorderable below) that physically *contains* its children block,
	 * so dragging it carries its nested types along for free — no special-cased drag logic needed,
	 * just DOM nesting. Person/Place always get a (possibly empty) indented children block ending
	 * in their own blank "add nested type" row, even before they have any children yet.
	 */
	private renderCodexTypesList(body: HTMLElement, freshEntries?: TagDefinition[]): void {
		const entries = freshEntries ?? readTagRegistry(this.app).codexTypes;
		const topLevel = entries.filter((e) => !e.parentId);
		const childrenByParent = new Map<string, TagDefinition[]>();
		for (const e of entries) {
			if (!e.parentId) continue;
			const siblings = childrenByParent.get(e.parentId);
			if (siblings) siblings.push(e);
			else childrenByParent.set(e.parentId, [e]);
		}

		const rowsEl = body.createDiv({ cls: "sf-modal-book-list sf-tag-registry-list" });
		if (topLevel.length === 0) {
			rowsEl.createDiv({ cls: "sf-empty sf-empty-inline", text: "Nothing here yet — add one below." });
		}
		for (const entry of topLevel) {
			this.renderCodexTypeGroup(rowsEl, entry, childrenByParent.get(entry.id) ?? []);
		}

		const topZones: DragZone[] = [{ key: "order", container: rowsEl }];
		makeReorderable(topZones, ".sf-tag-registry-top-row", ".sf-drag-handle", (zoneRowKeys) => {
			void this.handleReorder("codexTypes", (zoneRowKeys.order ?? []).filter(Boolean));
		});

		this.renderAddRow(body, "codexTypes", 'New type name (e.g. "Faction")');
	}

	/** One top-level type, its own row plus (Person/Place only) an indented children block. */
	private renderCodexTypeGroup(rowsEl: HTMLElement, entry: TagDefinition, children: TagDefinition[]): void {
		const wrap = rowsEl.createDiv({ cls: "sf-tag-registry-top-row" });
		wrap.dataset.key = entry.id;
		this.renderRow(wrap, "codexTypes", entry);

		if (!PROTECTED_CODEX_TYPE_IDS.has(entry.id)) return;

		const childrenEl = wrap.createDiv({ cls: "sf-tag-registry-children" });
		for (const child of children) {
			this.renderRow(childrenEl, "codexTypes", child);
		}
		this.renderAddRow(childrenEl, "codexTypes", `New ${entry.label.toLowerCase()} type`, entry.id);

		// Own drag zone, scoped to just this parent's children — reordering here never crosses
		// into another parent's children or back out to the top tier (reparenting by drag isn't
		// offered; only within-parent reordering and whole-group top-tier reordering are).
		// Selector excludes the trailing add-row: unlike the flat lists' add-row (a sibling of their
		// reorder container, not a child of it), this one lives *inside* childrenEl so the blank "add
		// nested type" box can sit beneath the last child. Matching it as a draggable row would fall
		// back to treating the whole row as its own drag handle (no `.sf-drag-handle` of its own —
		// see dragReorder.ts's bindRow), which swallows the pointerdown its input/icon-picker/add
		// button need to gain focus or fire a click at all.
		const childZones: DragZone[] = [{ key: "order", container: childrenEl }];
		makeReorderable(childZones, ".sf-row:not(.sf-tag-registry-add-row)", ".sf-drag-handle", (zoneRowKeys) => {
			void this.handleReorder("codexTypes", (zoneRowKeys.order ?? []).filter(Boolean));
		});
	}

	private renderRow(rowsEl: HTMLElement, list: TagListKind, entry: TagDefinition): void {
		const row = rowsEl.createDiv({ cls: "sf-row" });
		row.dataset.key = entry.id;
		const handle = row.createSpan({ cls: "sf-drag-handle" });
		setIcon(handle, "grip-vertical");

		const iconBtn = row.createSpan({
			cls: "sf-tag-registry-icon-btn",
			attr: { "aria-label": "Change icon", tabindex: "0" },
		});
		setIcon(iconBtn, resolveIconAlias(list, entry.iconAlias));
		const openIconPicker = () => {
			void import("./IconPickerModal").then(({ IconPickerModal }) => {
				new IconPickerModal(this.app, list, (alias) => this.handleSetIcon(list, entry.id, alias)).open();
			});
		};
		iconBtn.addEventListener("click", openIconPicker);
		makeAccessibleActivatable(iconBtn, openIconPicker);

		const input = row.createEl("input", { cls: "sf-modal-input sf-modal-book-input", type: "text" });
		input.value = entry.label;
		this.bindTextCommit(input, (value) => this.handleRename(list, entry.id, value));

		// Person/Place are protected — renameable/re-iconable above, but no delete affordance at
		// all, since too much of the app assumes they exist.
		if (list === "codexTypes" && PROTECTED_CODEX_TYPE_IDS.has(entry.id)) {
			row.createSpan({ cls: "sf-icon-action sf-icon-action-spacer", attr: { "aria-hidden": "true" } });
			return;
		}
		// Same "[-]" glyph and hover-coloured (not boxed) styling as the delete icon on
		// CodexSetTypeModal/TagPickerModal's rows — always visible here, though (this is the
		// management list, not a pick-one-and-close flow, so hover-reveal doesn't apply).
		const deleteBtn = row.createSpan({
			cls: "sf-icon-action",
			attr: { "aria-label": `Delete ${entry.label}`, title: `Delete ${entry.label}`, tabindex: "0" },
		});
		setIcon(deleteBtn, ICON_MINUS_SQUARE);
		const requestDelete = () => void this.handleDelete(list, entry);
		deleteBtn.addEventListener("click", requestDelete);
		makeAccessibleActivatable(deleteBtn, requestDelete);
	}

	private renderAddRow(body: HTMLElement, list: TagListKind, placeholder: string, parentId?: string): void {
		const addRow = body.createDiv({ cls: "sf-row sf-tag-registry-add-row" });
		// Invisible — matches .sf-drag-handle's width, so this row has no handle of its own (it's
		// not draggable) but its icon still starts in the same column as the rows' icons above,
		// which each have a real handle before theirs.
		addRow.createSpan({ cls: "sf-tag-registry-handle-spacer" });
		// ICON_TAG is a generic placeholder glyph shown before a real icon is picked — not itself a
		// catalog alias, so it's rendered directly rather than through resolveIconAlias.
		let pendingIconAlias = "";

		const iconBtn = addRow.createSpan({
			cls: "sf-tag-registry-icon-btn",
			attr: { "aria-label": "Choose icon", tabindex: "0" },
		});
		setIcon(iconBtn, ICON_TAG);
		const openIconPicker = () => {
			void import("./IconPickerModal").then(({ IconPickerModal }) => {
				new IconPickerModal(this.app, list, (alias) => {
					pendingIconAlias = alias;
					iconBtn.empty();
					setIcon(iconBtn, resolveIconAlias(list, alias));
				}).open();
			});
		};
		iconBtn.addEventListener("click", openIconPicker);
		makeAccessibleActivatable(iconBtn, openIconPicker);

		const input = addRow.createEl("input", { cls: "sf-modal-input sf-modal-book-input", type: "text", attr: { placeholder } });
		const commitAdd = () => {
			const label = input.value.trim();
			if (!label) return;
			void addTagDefinition(this.app, list, label, pendingIconAlias, parentId)
				.then(({ entries }) => {
					this.onChange();
					this.render({ list, entries });
				})
				.catch((err: Error) => new Notice(`storyForge: could not add "${label}" — ${err.message}`));
		};
		// Same "[+]" glyph and hover-coloured styling as CodexSetTypeModal/TagPickerModal's add row.
		const addBtn = addRow.createSpan({
			cls: "sf-icon-action",
			attr: { "aria-label": "Add", title: "Add", tabindex: "0" },
		});
		setIcon(addBtn, ICON_PLUS_SQUARE);
		addBtn.addEventListener("click", commitAdd);
		makeAccessibleActivatable(addBtn, commitAdd);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				commitAdd();
			}
		});
	}

	private bindTextCommit(input: HTMLInputElement, onCommit: (value: string) => Promise<void>): void {
		let pending = false;
		const commit = async () => {
			if (pending) return;
			pending = true;
			try {
				const value = input.value.trim();
				if (value) await onCommit(value);
			} finally {
				pending = false;
			}
		};
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				input.blur();
			}
		});
		input.addEventListener("blur", () => void commit());
		input.addEventListener("pointerdown", (event) => event.stopPropagation());
	}

	private async handleRename(list: TagListKind, id: string, value: string): Promise<void> {
		try {
			await renameTagDefinition(this.app, list, id, value);
			this.onChange();
		} catch (err) {
			new Notice(`storyForge: could not rename — ${(err as Error).message}`);
			this.render();
		}
	}

	private async handleSetIcon(list: TagListKind, id: string, iconAlias: string): Promise<void> {
		try {
			const { entries } = await setTagDefinitionIcon(this.app, list, id, iconAlias);
			this.onChange();
			this.render({ list, entries });
		} catch (err) {
			new Notice(`storyForge: could not set icon — ${(err as Error).message}`);
		}
	}

	private async handleDelete(list: TagListKind, entry: TagDefinition): Promise<void> {
		const confirmed = await confirmDelete(this.app, entry.label);
		if (!confirmed) return;
		try {
			const { entries } = await deleteTagDefinition(this.app, list, entry.id);
			this.onChange();
			this.render({ list, entries });
		} catch (err) {
			new Notice(`storyForge: could not delete — ${(err as Error).message}`);
		}
	}

	private async handleReorder(list: TagListKind, newOrder: string[]): Promise<void> {
		try {
			await reorderTagDefinitions(this.app, list, newOrder);
			this.onChange();
			// Deliberately not calling render() here (unlike the other handlers) — the drag itself
			// already left the DOM in the correct final order synchronously the moment you dropped;
			// re-rendering again later, after this awaited write settles, only opens a race window
			// where a second interaction starts before this fires and the render() call gets
			// silently skipped by the isDragInProgress() guard, leaving a stale/detached row on
			// screen despite the underlying data being fine. Matches SeriesModal's reorder handler.
		} catch (err) {
			new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
			this.render();
		}
	}
}
