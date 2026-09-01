import { App, Modal, Notice, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import {
	addPlotThread,
	deletePlotThread,
	isPlotThreadUsed,
	MAIN_THREAD_FALLBACK_COLOR,
	MAIN_THREAD_ID,
	readPlotThreads,
	renamePlotThread,
	reorderPlotThreads,
	setPlotThreadColor,
	setPlotThreadTextColor,
	setPlotThreadUse,
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
 * types/tags tab. `fresh`, when passed, is the just-written result of a mutation this modal
 * itself just made — used in place of a readPlotThreads() re-read.
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

		const headers = contentEl.createDiv({ cls: "sf-plot-thread-col-headers" });
		headers.createSpan({ cls: "sf-plot-thread-col-spacer" });
		const swatchHeaders = headers.createDiv({ cls: "sf-plot-thread-swatches" });
		swatchHeaders.createSpan({ cls: "sf-plot-thread-col-label", text: "thread" });
		swatchHeaders.createSpan({ cls: "sf-plot-thread-col-label", text: "text" });
		headers.createSpan({ cls: "sf-plot-thread-col-name-spacer" });
		headers.createSpan({ cls: "sf-plot-thread-col-label sf-plot-thread-col-label--use", text: "use thread" });

		const entries = freshEntries ?? readPlotThreads(this.app);
		const scroll = contentEl.createDiv({ cls: "sf-plot-thread-registry-scroll" });
		const rowsEl = scroll.createDiv({ cls: "sf-plot-thread-registry-list" });
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

		this.renderAddRow(contentEl, entries);
	}

	private paintNamePreview(input: HTMLElement, background: string, color: string): void {
		input.setCssProps({ "--sf-thread-bg": background, "--sf-thread-fg": color });
		input.setCssStyles({ backgroundColor: background, color, webkitTextFillColor: color });
	}

	private renderUseCheckbox(
		parent: HTMLElement,
		checked: boolean,
		label: string,
		onChange: (value: boolean) => void,
	): HTMLInputElement {
		const cell = parent.createDiv({ cls: "sf-plot-thread-use" });
		const checkbox = cell.createEl("input", {
			type: "checkbox",
			attr: { "aria-label": label },
		});
		checkbox.checked = checked;
		checkbox.addEventListener("pointerdown", (event) => event.stopPropagation());
		checkbox.addEventListener("change", () => onChange(checkbox.checked));
		return checkbox;
	}

	private renderRow(rowsEl: HTMLElement, entry: PlotThread): void {
		const row = rowsEl.createDiv({ cls: "sf-row sf-plot-thread-registry-row" });
		row.dataset.key = entry.id;
		const isMain = entry.id === MAIN_THREAD_ID;
		if (isMain) {
			row.dataset.dragLocked = "true";
			row.createSpan({ cls: "sf-plot-thread-col-spacer" });
		} else {
			const handle = row.createSpan({ cls: "sf-drag-handle" });
			setIcon(handle, "grip-vertical");
		}

		const settings = this.plugin.getSettings();
		const textColor = resolvePlotThreadTextColor(settings, entry);

		const swatches = row.createDiv({ cls: "sf-plot-thread-swatches" });
		const threadSwatch = swatches.createEl("button", {
			cls: "sf-color-swatch-btn",
			attr: { "aria-label": `${entry.label} thread colour` },
		});
		const textSwatch = swatches.createEl("button", {
			cls: "sf-color-swatch-btn",
			attr: { "aria-label": `${entry.label} text colour` },
		});

		const nameGroup = row.createDiv({ cls: "sf-plot-thread-name-group" });
		const input = nameGroup.createEl("input", {
			cls: "sf-modal-input sf-plot-thread-name",
			type: "text",
		});
		input.value = entry.label;
		this.paintNamePreview(input, entry.color, textColor);
		this.bindTextCommit(input, (value) => this.handleRename(entry.id, value));

		bindColorSwatchButton(this.app, this.plugin, threadSwatch, entry.color, (hex) => {
			this.paintNamePreview(input, hex, textColor);
			void this.handleSetColor(entry.id, hex);
		});
		bindColorSwatchButton(this.app, this.plugin, textSwatch, textColor, (hex) => {
			this.paintNamePreview(input, entry.color, hex);
			void this.handleSetTextColor(entry.id, hex);
		});

		if (entry.id !== MAIN_THREAD_ID) {
			const deleteBtn = nameGroup.createSpan({
				cls: "sf-icon-action",
				attr: { "aria-label": `Delete ${entry.label}`, title: `Delete ${entry.label}`, tabindex: "0" },
			});
			setIcon(deleteBtn, ICON_MINUS_SQUARE);
			deleteBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
			const requestDelete = () => void this.handleDelete(entry);
			deleteBtn.addEventListener("click", requestDelete);
			makeAccessibleActivatable(deleteBtn, requestDelete);
		}

		this.renderUseCheckbox(row, isPlotThreadUsed(entry), `use ${entry.label}`, (value) => {
			void this.handleSetUse(entry.id, value);
		});
	}

	private renderAddRow(body: HTMLElement, existing: PlotThread[]): void {
		const addRow = body.createDiv({ cls: "sf-row sf-plot-thread-registry-row sf-plot-thread-registry-add-row" });
		addRow.createSpan({ cls: "sf-plot-thread-col-spacer" });

		let pendingColor =
			nextUnusedPlotThreadColor(
				this.plugin.getSettings(),
				existing.map((e) => e.color),
			) ?? MAIN_THREAD_FALLBACK_COLOR;
		let pendingTextColor = resolveAccentTextColor(this.plugin.getSettings(), pendingColor) ?? "#ffffff";
		let pendingUse = true;
		let textColorTouched = false;

		const swatches = addRow.createDiv({ cls: "sf-plot-thread-swatches" });
		const threadSwatch = swatches.createEl("button", {
			cls: "sf-color-swatch-btn",
			attr: { "aria-label": "plot thread colour" },
		});
		const textSwatch = swatches.createEl("button", {
			cls: "sf-color-swatch-btn",
			attr: { "aria-label": "plot thread text colour" },
		});
		const nameGroup = addRow.createDiv({ cls: "sf-plot-thread-name-group" });
		const input = nameGroup.createEl("input", {
			cls: "sf-modal-input sf-plot-thread-name",
			type: "text",
		});
		input.value = "new plot thread";
		this.paintNamePreview(input, pendingColor, pendingTextColor);

		bindColorSwatchButton(this.app, this.plugin, threadSwatch, pendingColor, (hex) => {
			pendingColor = hex;
			if (!textColorTouched) {
				pendingTextColor = resolveAccentTextColor(this.plugin.getSettings(), hex) ?? pendingTextColor;
				textSwatch.setCssStyles({ backgroundColor: pendingTextColor });
			}
			this.paintNamePreview(input, pendingColor, pendingTextColor);
		});
		bindColorSwatchButton(this.app, this.plugin, textSwatch, pendingTextColor, (hex) => {
			textColorTouched = true;
			pendingTextColor = hex;
			this.paintNamePreview(input, pendingColor, pendingTextColor);
		});

		const commitAdd = () => {
			const label = input.value.trim() || "new plot thread";
			if (!pendingColor) return;
			void addPlotThread(this.app, label, pendingColor, pendingTextColor, pendingUse)
				.then(({ entries }) => {
					this.onChange();
					this.render(entries);
				})
				.catch((err: Error) => new Notice(`storyForge: could not add "${label}" — ${err.message}`));
		};
		const addBtn = nameGroup.createSpan({
			cls: "sf-icon-action",
			attr: { "aria-label": "Add", title: "Add", tabindex: "0" },
		});
		setIcon(addBtn, ICON_PLUS_SQUARE);
		addBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
		addBtn.addEventListener("click", commitAdd);
		makeAccessibleActivatable(addBtn, commitAdd);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				commitAdd();
			}
		});

		this.renderUseCheckbox(addRow, pendingUse, "use thread", (value) => {
			pendingUse = value;
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

	private async handleSetUse(id: string, use: boolean): Promise<void> {
		try {
			await setPlotThreadUse(this.app, id, use);
			this.onChange();
		} catch (err) {
			new Notice(`storyForge: could not update thread — ${(err as Error).message}`);
			this.render();
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
