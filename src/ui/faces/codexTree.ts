import { getCodexTypes, codexNameClash, sanitizeCodexBasename, archiveCodexItem, codexTypeIcon, convertCodexNoteToFolder, createCodexFolder, createCodexNote, getCodexEntryType, getCodexView, moveCodexItem, readCodexFrontmatter, removeCodexFolder, renameCodexFolder, setCodexEntryType } from "../../core/codex";
import { isDescendantFolder, type CodexTreeItem } from "../../core/codexTree";
import { attachCodexDragReorder, type CodexDragRowInfo } from "../../view/dragReorderTree";
import { button } from "../kit/button";
import { customIcon } from "../kit/customIcon";
import { el, fill } from "../kit/dom";
import { icon } from "../kit/icons";
import { attachInlineRename } from "../kit/inlineRename";
import { attachTooltip } from "../kit/tooltip";
import { menuPoint, showMenu, type MenuItem } from "../kit/menu";
import type { AppModel } from "../model";
import { nameProblem, openRenameCodex } from "../screens/renameCodex";

/** The folder new notes and folders go into: the last folder the author clicked, if it still exists. */
let targetFolder: string | null = null;

/**
 * The Codex tree (virtual folders, order, type icons, drag to reorder and nest, a context menu), shared by
 * the storytelling side's Codex pane (entries open in the context panel) and the library's codex tab (entries open in the
 * workspace). The highlighted row is the note shown where that mount opens them.
 */
export function mountCodexTree(host: HTMLElement, model: AppModel, options: { header: boolean; opensIn: "context" | "workspace" }): () => void {
	/** Storytelling: an entry opens in the context panel (a second click closes it). Library: it opens in the workspace. */
	const openEntry = (path: string): void => void (options.opensIn === "workspace" ? model.editors?.open("centre", path) : model.toggleLore(path));
	const tree = el("div", { class: "sf-codex-tree sf-scroll", attrs: { role: "tree", "aria-label": "Codex" } });
	/** The row the keyboard is on (a tree has one tab stop, and the arrows move within it). Survives a redraw. */
	let focusKey: string | null = null;
	let rowInfo = new Map<string, CodexDragRowInfo>();
	/** A new folder or note being named in place: nothing exists on disk until the name is confirmed (Return); Escape creates nothing. */
	let draft: { kind: "folder" | "note"; parent: string | null; text: string; focus: boolean } | null = null;
	let redrawing = false;
	/** Whether clicking away from the name box confirms a name that passes (as the inline rename does) or cancels. One line to switch. */
	const BLUR_CONFIRMS = true;

	const run = async (what: string, action: () => Promise<unknown>): Promise<void> => {
		try {
			await action();
			model.touch("codex");
		} catch (e) {
			model.notices.notify({ text: `Could not ${what}: ${(e as Error)?.message ?? String(e)}` });
		}
	};

	const readOnly = (): boolean => !!model.running?.readOnlyReason;
	const project = () => model.running!.opened.project;

	const draw = (): void => {
		const running = model.running;
		if (!running) return fill(host);
		const root = getCodexView(running.opened.project, "codex");
		const rows: CodexDragRowInfo[] = [];
		const hadFocus = tree.contains(document.activeElement) && !(document.activeElement as HTMLElement | null)?.closest(".sf-codex-draft");
		const box = tree.querySelector<HTMLInputElement>(".sf-codex-draft input");
		const boxFocused = !!box && document.activeElement === box;
		const caret = box ? [box.selectionStart, box.selectionEnd] : [null, null];
		redrawing = true;
		fill(tree);
		if ((!root || root.children.length === 0) && !draft) tree.append(el("div", { class: "sf-muted sf-codex-empty", text: "Nothing here yet." }));
		else renderItems(tree, root?.children ?? [], null, 0, rows);
		redrawing = false;
		if (draft && boxFocused) {
			// a redraw while the name is being typed (an outside change to the Codex, say) keeps the text, the focus and the caret
			const input = tree.querySelector<HTMLInputElement>(".sf-codex-draft input");
			input?.focus({ preventScroll: true });
			if (input && caret[0] !== null) input.setSelectionRange(caret[0], caret[1] ?? caret[0]);
		}
		if (draft?.focus) {
			draft.focus = false;
			const input = tree.querySelector<HTMLInputElement>(".sf-codex-draft input");
			input?.focus();
			input?.select();
			input?.scrollIntoView({ block: "nearest" });
		}
		if (!readOnly()) {
			const folders = readCodexFrontmatter(running.opened.project).folders;
			attachCodexDragReorder(
				tree,
				rows,
				(a, b) => isDescendantFolder(folders, a, b),
				(dragged, target) => void run("move that", () => moveCodexItem(project(), dragged.key, dragged.type, target.parentId, target.beforeKey)),
			);
		}
		rowInfo = new Map(rows.map((r) => [r.key, r]));
		if (!readOnly()) for (const r of treeRows()) attachTooltip(r, "⌥↑ ⌥↓ move this row, ⌥→ nest it, ⌥← bring it out", { hover: false });
		// One tab stop for the whole tree: the row the keyboard was last on, else the first.
		const items = treeRows();
		const current = items.find((r) => r.dataset.key === focusKey) ?? items[0];
		for (const r of items) r.tabIndex = r === current ? 0 : -1;
		if (hadFocus && current) current.focus({ preventScroll: true });
	};

	/** The rows on screen, in order (the "Empty" line is not a row you can be on). */
	const treeRows = (): HTMLElement[] => [...tree.querySelectorAll<HTMLElement>('[role="treeitem"][data-key]')];
	const moveTo = (row: HTMLElement | undefined): void => {
		if (!row) return;
		focusKey = row.dataset.key ?? null;
		for (const r of treeRows()) r.tabIndex = r === row ? 0 : -1;
		row.focus();
	};
	const toggleFolder = (id: string): void => {
		targetFolder = id;
		model.toggleCodexFolder(id);
	};
	tree.addEventListener("focusin", (e) => {
		const row = (e.target as Element).closest<HTMLElement>('[role="treeitem"][data-key]');
		if (row && row === e.target) focusKey = row.dataset.key ?? null;
	});
	// The standard tree keys (decision 56): the arrows move between rows, → opens a folder or goes in, ← closes it or goes to the
	// parent, Return opens or closes. Reordering is Option plus the arrows (dragReorderTree.ts).
	tree.addEventListener("keydown", (e) => {
		if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
		const row = e.target instanceof Element ? e.target.closest<HTMLElement>('[role="treeitem"][data-key]') : null;
		if (!row || row !== e.target) return; // typing in a rename box is the box's business
		const items = treeRows();
		const at = items.indexOf(row);
		const info = rowInfo.get(row.dataset.key ?? "");
		const isFolder = row.dataset.type === "folder";
		const open = row.getAttribute("aria-expanded") === "true";
		const go = (to: HTMLElement | undefined): void => {
			e.preventDefault();
			moveTo(to);
		};
		switch (e.key) {
			case "ArrowDown":
				return go(items[at + 1]);
			case "ArrowUp":
				return go(items[at - 1]);
			case "Home":
				return go(items[0]);
			case "End":
				return go(items[items.length - 1]);
			case "ArrowRight":
				if (!isFolder) return;
				e.preventDefault();
				if (!open) toggleFolder(row.dataset.key!);
				else if (items[at + 1] && rowInfo.get(items[at + 1].dataset.key ?? "")?.parentKey === row.dataset.key) moveTo(items[at + 1]);
				return;
			case "ArrowLeft":
				e.preventDefault();
				if (isFolder && open) toggleFolder(row.dataset.key!);
				else if (info?.parentKey) moveTo(items.find((r) => r.dataset.key === info.parentKey));
				return;
			case "Enter":
			case " ":
				e.preventDefault();
				info?.onClick?.(row);
				return;
		}
	});

	const typeMenu = (path: string): MenuItem[] =>
		getCodexTypes().map((t) => ({ label: `${t.parentId ? "    " : ""}${t.label}`, onSelect: () => void run("set the type", () => setCodexEntryType(project(), path, t.type)) }));

	const rowMenu = (items: MenuItem[], row: HTMLElement): void => {
		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			showMenu(items, menuPoint(e));
		});
	};

	const typeIcon = (path: string): SVGElement | null => {
		const type = getCodexEntryType(project(), path);
		const id = type ? codexTypeIcon(type) : null;
		return id ? customIcon(id) : null;
	};

	function renderItems(container: HTMLElement, items: CodexTreeItem[], parentKey: string | null, depth: number, rows: CodexDragRowInfo[]): void {
		const lorePath = model.editors?.pathIn(options.opensIn === "workspace" ? "centre" : "lore") ?? null;
		for (const item of items) {
			if (item.type === "folder") {
				const collapsed = model.nav.collapsedCodex.has(item.id);
				const wrapper = el("div", { class: "sf-codex-folder" });
				wrapper.style.setProperty("--depth", String(depth));
				const label = el("span", { class: "sf-codex-name", text: item.name });
				// No chevron: the folder's icon, after its name, is what a click on a note-folder toggles; the line beside an open
				// folder's contents (and the screen reader's "expanded" / "collapsed") says whether it is open.
				const toggle = icon("folder", 16);
				const typeMark = item.path ? typeIcon(item.path) : null;
				const header = el(
					"div",
					{
						class: `sf-codex-folder-header${item.path ? " sf-codex-lore-folder" : ""}${item.path && lorePath === item.path ? " is-active" : ""}`,
						dataset: { key: item.id, type: "folder" },
						attrs: { role: "treeitem", "aria-expanded": String(!collapsed), "aria-level": String(depth + 1), "aria-selected": String(!!item.path && lorePath === item.path) },
					},
					label,
					toggle,
					typeMark,
				);
				rows.push({
					key: item.id,
					type: "folder",
					parentKey,
					onClick: (target) => {
						targetFolder = item.id;
						model.select({ kind: "codex-folder", id: item.id, ...(item.path ? { path: item.path } : {}) });
						if (item.path && !toggle.contains(target as Node)) openEntry(item.path);
						else toggleFolder(item.id);
					},
				});
				const items2: MenuItem[] = [
					...(item.path ? [{ label: "Rename…", onSelect: () => openRenameCodex(model, item.path!) }] : []),
					...(item.path ? [{ label: "Set type…", onSelect: () => showMenu(typeMenu(item.path!), { x: header.getBoundingClientRect().left + 24, y: header.getBoundingClientRect().bottom }) }] : []),
					{ label: "Archive Entire Folder", onSelect: () => void run("archive the folder", () => archiveCodexItem(project(), item.id)) },
					{ label: "Remove Folder and Keep Items", onSelect: () => void run("remove the folder", () => removeCodexFolder(project(), item.id)) },
				];
				if (!item.path && !readOnly()) {
					attachInlineRename({ row: header, label, getCurrentTitle: () => item.name, onCommit: (name) => run("rename the folder", () => renameCodexFolder(project(), item.id, name)), extraMenuItems: items2.map((m) => ({ title: m.label!, onClick: m.onSelect! })), doubleClick: false });
				} else if (!readOnly()) rowMenu(items2, header);
				wrapper.append(header);
				if (!collapsed) {
					const children = el("div", { class: "sf-codex-children", attrs: { role: "group" } });
					renderItems(children, item.children, item.id, depth + 1, rows);
					// An open folder with nothing in it says so, in words (the screen reader too).
					if (item.children.length === 0 && !(draft && draft.parent === item.id)) children.append(el("div", { class: "sf-codex-folder-empty", text: "Empty", attrs: { role: "treeitem", "aria-disabled": "true", "aria-level": String(depth + 2), "aria-label": "Empty folder" } }));
					wrapper.append(children);
				}
				container.append(wrapper);
			} else {
				const row = el(
					"div",
					{ class: `sf-codex-file${lorePath === item.path ? " is-active" : ""}`, dataset: { key: item.path, type: "file" }, attrs: { role: "treeitem", "aria-level": String(depth + 1), "aria-selected": String(lorePath === item.path) } },
					el("span", { class: "sf-codex-name", text: item.name }),
					typeIcon(item.path) ?? icon("file", 16),
				);
				row.style.setProperty("--depth", String(depth));
				rows.push({
					key: item.path,
					type: "file",
					parentKey,
					onClick: () => {
						model.select({ kind: "codex-note", path: item.path });
						openEntry(item.path);
					},
				});
				if (!readOnly()) {
					rowMenu(
						[
							{ label: "Rename…", onSelect: () => openRenameCodex(model, item.path) },
							{ label: "Set type…", onSelect: () => showMenu(typeMenu(item.path), { x: row.getBoundingClientRect().left + 24, y: row.getBoundingClientRect().bottom }) },
							{ label: "Archive", onSelect: () => void run("archive the note", () => archiveCodexItem(project(), item.path)) },
							{ label: "Convert to folder", onSelect: () => void run("convert the note to a folder", () => convertCodexNoteToFolder(project(), item.path)) },
						],
						row,
					);
				}
				container.append(row);
			}
		}
		if (draft && draft.parent === parentKey) container.append(draftRow(depth));
	}

	/** What is wrong with a typed name for the new thing, in words, or null: the rename's own rules (no [ ] # ^ |, not empty), no character a file name can't hold, no clash with a note that is there. */
	const draftProblem = (kind: "folder" | "note", typed: string, parent: string | null): string | null => {
		const name = typed.trim();
		if (!name) return "Type a name.";
		if (kind === "note") {
			const p = nameProblem(name, "");
			if (p) return p;
			if (sanitizeCodexBasename(name) !== name.replace(/\.md$/i, "")) return "A note name can't contain / \\ ? % * : | \" < >.";
		}
		// Case and accents are ignored: a note against every note, a folder against the folders beside it.
		if (codexNameClash(project(), kind, parent, name)) return kind === "note" ? `There is already a note called “${name}”.` : `There is already a folder called “${name}” here.`;
		return null;
	};

	function draftRow(depth: number): HTMLElement {
		const d = draft!;
		const input = el("input", { class: "sf-rename-input", attrs: { type: "text", "aria-label": d.kind === "folder" ? "Name of the new folder" : "Name of the new note", spellcheck: "false", placeholder: d.kind === "folder" ? "New folder" : "New note" } });
		input.value = d.text;
		const problem = el("div", { class: "sf-rename-problem", attrs: { role: "alert" } });
		const row = el("div", { class: "sf-codex-draft" }, el("div", { class: "sf-codex-draft-field" }, input, problem), icon(d.kind === "folder" ? "folder" : "file", 16));
		row.style.setProperty("--depth", String(depth));
		let settled = false;
		const finish = (confirm: boolean): void => {
			if (settled) return;
			settled = true;
			const mine = draft;
			if (!mine) return;
			draft = null;
			const name = input.value.trim();
			if (confirm && name && !draftProblem(mine.kind, name, mine.parent)) {
				void run(mine.kind === "folder" ? "create the folder" : "create the note", async () => {
					if (mine.kind === "folder") {
						const id = await createCodexFolder(project(), mine.parent, name);
						focusKey = id;
					} else {
						const entry = await createCodexNote(project(), mine.parent, { filename: `${name.replace(/\.md$/i, "")}.md` });
						model.touch("codex");
						openEntry(entry.path);
					}
				}).then(() => {
					if (mine.kind === "folder") moveTo(treeRows().find((r) => r.dataset.key === focusKey));
				});
			} else draw();
		};
		const check = (): string | null => {
			d.text = input.value;
			const message = input.value.trim() ? draftProblem(d.kind, input.value, d.parent) : null;
			problem.textContent = message ?? "";
			input.toggleAttribute("aria-invalid", message !== null);
			return message;
		};
		input.addEventListener("input", check);
		input.addEventListener("keydown", (e) => {
			e.stopPropagation();
			if (e.key === "Enter") {
				e.preventDefault();
				if (input.value.trim() && !check()) finish(true);
				else check();
				if (!input.value.trim()) problem.textContent = "Type a name.";
			} else if (e.key === "Escape") {
				e.preventDefault();
				finish(false);
			}
		});
		// Leaving the box (a click elsewhere) confirms a good name and otherwise creates nothing.
		input.addEventListener("blur", () => {
			if (redrawing || !input.isConnected) return;
			finish(BLUR_CONFIRMS && !!input.value.trim() && !draftProblem(d.kind, input.value, d.parent));
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());
		return row;
	}

	/** The strip's two buttons: the name is typed in the list, in the last folder clicked (opened if it was closed). */
	const beginDraft = (kind: "folder" | "note"): void => {
		if (readOnly()) return;
		const parent = validTarget(model);
		if (parent && model.nav.collapsedCodex.has(parent)) model.toggleCodexFolder(parent);
		draft = { kind, parent, text: "", focus: true };
		draw();
	};

	// The strip down the list's left edge (the plugin's place for them): New Folder, then New Note beneath it. On the storytelling
	// side a new note opens in the context panel, on the library side in the workspace.
	const noWriting = (): string | null => (readOnly() ? "This project is open read-only." : null);
	const strip = el("div", { class: "sf-codex-strip", attrs: { role: "toolbar", "aria-orientation": "vertical", "aria-label": "Codex actions" } });
	let stripReadOnly: boolean | null = null;
	const drawStrip = (): void => {
		if (stripReadOnly === readOnly()) return; // only the read-only state changes it; redrawing would drop a focused button
		stripReadOnly = readOnly();
		fill(
			strip,
			button({ icon: "folder-plus", name: "New folder", tooltip: noWriting() ?? "New folder", disabled: readOnly(), kind: "quiet", onClick: () => beginDraft("folder") }),
			button({ icon: "file-plus", name: "New note", tooltip: noWriting() ?? "New note", disabled: readOnly(), kind: "quiet", onClick: () => beginDraft("note") }),
		);
	};
	// A toolbar is one tab stop with the arrows moving within it.
	strip.addEventListener("keydown", (e) => {
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
		const buttons = [...strip.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (at === -1) return;
		e.preventDefault();
		buttons[(at + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length].focus();
	});
	const body = el("div", { class: "sf-codex-body" }, strip, tree);
	if (options.header) {
		host.classList.add("sf-pane", "sf-codex-pane");
		fill(host, el("div", { class: "sf-pane-header" }, el("h2", { class: "sf-pane-title", text: "Codex" })), body);
	} else {
		host.classList.add("sf-codex-pane");
		fill(host, body);
	}
	drawStrip();
	draw();
	return model.subscribe(["codex", "project", "nav"], () => {
		if (!host.isConnected) return;
		drawStrip();
		draw();
	});
}

function validTarget(model: AppModel): string | null {
	const running = model.running;
	if (!running || !targetFolder) return null;
	return readCodexFrontmatter(running.opened.project).folders[targetFolder] ? targetFolder : null;
}
