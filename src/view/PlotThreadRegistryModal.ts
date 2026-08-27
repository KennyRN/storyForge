import { App, Modal, Notice, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import {
	addPlotThread,
	deletePlotThread,
	MAIN_THREAD_ID,
	readPlotThreads,
	renamePlotThread,
	reorderPlotThreads,
	setPlotThreadColor,
	setPlotThreadTextColor,
	type PlotThread,
} from "../plotThreads";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { bindColorSwatchButton } from "./styleModalHelpers";
import { nextUnusedPlotThreadColor, resolveAccentTextColor, resolvePlotThreadTextColor } from "./novelColor";
import { ICON_MINUS_SQUARE, ICON_PLUS_SQUARE } from "../icons";
import { confirmDelete } from "./confirmDeleteModal";

/**
 * Manage the vault's plot-thread list (colour + name): add, rename, recolour, reorder, delete.
 * Opened from the story library Series pane's corner hover icon, and from SeriesModal's
 * types/tags tab — same job TagRegistryModal does for types and for tags (now as two dialogs). Fixed-size dialog matching
 * `.modal.sf-tag-registry-modal`. `fresh`, when passed, is the just-written result of a mutation
 * this modal itself just made — used in place of a readPlotThreads() re-read (see plotThreads.ts's
 * mutatePlotThreads doc comment).
 */
export class PlotThreadRegistryModal extends Modal {
	constructor(
		app: App,
		private plugin: StoryForgePlugin,
		private onChange: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-plot-thread-registry-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(freshEntries?: PlotThread[]): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-plot-thread-registry-modal");

		const scroll = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });
		const body = scroll.createDiv({ cls: "sf-text-style-tab-body" });
		body.createEl("h2", { text: "Plot threads" });

		const entries = freshEntries ?? readPlotThreads(this.app);
		const rowsEl = body.createDiv({ cls: "sf-modal-book-list sf-tag-registry-list" });
		if (entries.length === 0) {
			rowsEl.createDiv({ cls: "sf-empty sf-empty-inline", text: "Nothing here yet — add one below." });
		}
		for (const entry of entries) {
			this.renderRow(rowsEl, entry);
		}

		const zones: DragZone[] = [{ key: "order", container: rowsEl }];
		makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
			void this.handleReorder((zoneRowKeys.order ?? []).filter(Boolean));
		});

		this.renderAddRow(body, entries);
	}

	private renderRow(rowsEl: HTMLElement, entry: PlotThread): void {
		const row = rowsEl.createDiv({ cls: "sf-row" });
		row.dataset.key = entry.id;
		const handle = row.createSpan({ cls: "sf-drag-handle" });
		setIcon(handle, "grip-vertical");

		const swatches = row.createDiv({ cls: "sf-plot-thread-swatches" });
		const swatch = swatches.createEl("button", { cls: "sf-color-swatch-btn", attr: { "aria-label": `${entry.label} colour` } });
		bindColorSwatchButton(this.app, this.plugin, swatch, entry.color, (hex) => {
			void this.handleSetColor(entry.id, hex);
		});
		const textSwatch = swatches.createEl("button", {
			cls: "sf-color-swatch-btn sf-color-swatch-btn--text",
			attr: { "aria-label": `${entry.label} text colour` },
		});
		bindColorSwatchButton(this.app, this.plugin, textSwatch, resolvePlotThreadTextColor(this.plugin.getSettings(), entry), (hex) => {
			void this.handleSetTextColor(entry.id, hex);
		});

		const input = row.createEl("input", { cls: "sf-modal-input sf-modal-book-input", type: "text" });
		input.value = entry.label;
		this.bindTextCommit(input, (value) => this.handleRename(entry.id, value));

		if (entry.id === MAIN_THREAD_ID) return;
		const deleteBtn = row.createSpan({
			cls: "sf-icon-action",
			attr: { "aria-label": `Delete ${entry.label}`, title: `Delete ${entry.label}`, tabindex: "0" },
		});
		setIcon(deleteBtn, ICON_MINUS_SQUARE);
		const requestDelete = () => void this.handleDelete(entry);
		deleteBtn.addEventListener("click", requestDelete);
		makeAccessibleActivatable(deleteBtn, requestDelete);
	}

	private renderAddRow(body: HTMLElement, existing: PlotThread[]): void {
		const addRow = body.createDiv({ cls: "sf-row sf-tag-registry-add-row" });
		addRow.createSpan({ cls: "sf-tag-registry-handle-spacer" });

		let pendingColor = nextUnusedPlotThreadColor(
			this.plugin.getSettings(),
			existing.map((e) => e.color),
		);
		let pendingTextColor = pendingColor
			? resolveAccentTextColor(this.plugin.getSettings(), pendingColor) ?? "#ffffff"
			: "#ffffff";
		let textColorTouched = false;
		const swatches = addRow.createDiv({ cls: "sf-plot-thread-swatches" });
		const swatch = swatches.createEl("button", { cls: "sf-color-swatch-btn", attr: { "aria-label": "plot thread colour" } });
		const textSwatch = swatches.createEl("button", {
			cls: "sf-color-swatch-btn sf-color-swatch-btn--text",
			attr: { "aria-label": "plot thread text colour" },
		});
		if (pendingColor) {
			bindColorSwatchButton(this.app, this.plugin, swatch, pendingColor, (hex) => {
				pendingColor = hex;
				if (!textColorTouched) {
					pendingTextColor = resolveAccentTextColor(this.plugin.getSettings(), hex) ?? pendingTextColor;
					textSwatch.setCssStyles({ backgroundColor: pendingTextColor });
				}
			});
			bindColorSwatchButton(this.app, this.plugin, textSwatch, pendingTextColor, (hex) => {
				textColorTouched = true;
				pendingTextColor = hex;
			});
		}

		const input = addRow.createEl("input", {
			cls: "sf-modal-input sf-modal-book-input",
			type: "text",
			attr: { placeholder: 'New plot thread (e.g. "Romance")' },
		});
		const commitAdd = () => {
			const label = input.value.trim();
			if (!label || !pendingColor) return;
			void addPlotThread(this.app, label, pendingColor, pendingTextColor)
				.then(({ entries }) => {
					this.onChange();
					this.render(entries);
				})
				.catch((err: Error) => new Notice(`storyForge: could not add "${label}" — ${err.message}`));
		};
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

	private async handleRename(id: string, value: string): Promise<void> {
		try {
			await renamePlotThread(this.app, id, value);
			this.onChange();
		} catch (err) {
			new Notice(`storyForge: could not rename — ${(err as Error).message}`);
			this.render();
		}
	}

	private async handleSetColor(id: string, color: string): Promise<void> {
		try {
			const { entries } = await setPlotThreadColor(this.app, id, color);
			this.onChange();
			this.render(entries);
		} catch (err) {
			new Notice(`storyForge: could not set colour — ${(err as Error).message}`);
		}
	}

	private async handleSetTextColor(id: string, color: string): Promise<void> {
		try {
			const { entries } = await setPlotThreadTextColor(this.app, id, color);
			this.onChange();
			this.render(entries);
		} catch (err) {
			new Notice(`storyForge: could not set text colour — ${(err as Error).message}`);
		}
	}

	private async handleDelete(entry: PlotThread): Promise<void> {
		const confirmed = await confirmDelete(this.app, entry.label);
		if (!confirmed) return;
		try {
			const { entries } = await deletePlotThread(this.app, entry.id);
			this.onChange();
			this.render(entries);
		} catch (err) {
			new Notice(`storyForge: could not delete — ${(err as Error).message}`);
		}
	}

	private async handleReorder(newOrder: string[]): Promise<void> {
		try {
			await reorderPlotThreads(this.app, newOrder);
			this.onChange();
		} catch (err) {
			new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
			this.render();
		}
	}
}
