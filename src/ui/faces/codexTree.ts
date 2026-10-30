import { getCodexTypes, archiveCodexItem, codexTypeIcon, convertCodexNoteToFolder, createCodexFolder, createCodexNote, getCodexEntryType, getCodexView, moveCodexItem, readCodexFrontmatter, removeCodexFolder, renameCodexFolder, setCodexEntryType } from "../../core/codex";
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
import { openRenameCodex } from "../screens/renameCodex";

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
		const hadFocus = tree.contains(document.activeElement);
		fill(tree);
		if (!root || root.children.length === 0) tree.append(el("div", { class: "sf-muted sf-codex-empty", text: "Nothing here yet." }));
		else renderItems(tree, root.children, null, 0, rows);
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
					if (item.children.length === 0) children.append(el("div", { class: "sf-codex-folder-empty", text: "Empty", attrs: { role: "treeitem", "aria-disabled": "true", "aria-level": String(depth + 2), "aria-label": "Empty folder" } }));
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
	}

	const createNote = (): void =>
		void run("create the note", async () => {
			const entry = await createCodexNote(project(), validTarget(model), {});
			model.touch("codex");
			openEntry(entry.path);
		});
	const createFolder = (): void => void run("create the folder", () => createCodexFolder(project(), validTarget(model)));

	if (options.header) {
		const noWriting = readOnly() ? "This project is open read-only." : null;
		const head = el(
			"div",
			{ class: "sf-pane-header" },
			el("h2", { class: "sf-pane-title", text: "Codex" }),
			el(
				"div",
				{ class: "sf-pane-actions" },
				button({ icon: "file-plus", name: "New file", tooltip: noWriting ?? "New file", disabled: readOnly(), onClick: createNote }),
				button({ icon: "folder-plus", name: "New folder", tooltip: noWriting ?? "New folder", disabled: readOnly(), onClick: createFolder }),
			),
		);
		host.classList.add("sf-pane", "sf-codex-pane");
		fill(host, head, tree);
	} else {
		fill(host, tree);
	}
	draw();
	return model.subscribe(["codex", "project", "nav"], () => {
		if (!host.isConnected) return;
		draw();
	});
}

function validTarget(model: AppModel): string | null {
	const running = model.running;
	if (!running || !targetFolder) return null;
	return readCodexFrontmatter(running.opened.project).folders[targetFolder] ? targetFolder : null;
}
