import { getCodexTypes, archiveCodexItem, codexTypeIcon, convertCodexNoteToFolder, createCodexFolder, createCodexNote, getCodexEntryType, getCodexView, moveCodexItem, readCodexFrontmatter, removeCodexFolder, renameCodexFolder, setCodexEntryType } from "../../core/codex";
import { isDescendantFolder, type CodexTreeItem } from "../../core/codexTree";
import { attachCodexDragReorder, type CodexDragRowInfo } from "../../view/dragReorderTree";
import { button } from "../kit/button";
import { customIcon } from "../kit/customIcon";
import { el, fill } from "../kit/dom";
import { icon } from "../kit/icons";
import { attachInlineRename } from "../kit/inlineRename";
import { menuPoint, showMenu, type MenuItem } from "../kit/menu";
import type { AppModel } from "../model";

/** The folder new notes and folders go into: the last folder the author clicked, if it still exists. */
let targetFolder: string | null = null;

/**
 * The Codex tree (virtual folders, order, type icons, drag to reorder and nest, a context menu), shared by
 * the storytelling face's Codex pane and the storyForge face's codex tab. `highlight` is the lore slot's note.
 */
export function mountCodexTree(host: HTMLElement, model: AppModel, options: { header: boolean }): () => void {
	const tree = el("div", { class: "sf-codex-tree sf-scroll", attrs: { role: "tree", "aria-label": "Codex" } });

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
	};

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
		const lorePath = model.editors?.pathIn("lore") ?? null;
		for (const item of items) {
			if (item.type === "folder") {
				const collapsed = model.nav.collapsedCodex.has(item.id);
				const wrapper = el("div", { class: "sf-codex-folder" });
				wrapper.style.setProperty("--depth", String(depth));
				const label = el("span", { class: "sf-codex-name", text: item.name });
				const toggle = el("span", { class: "sf-codex-toggle", attrs: { "aria-hidden": "true" } }, icon(collapsed ? "chevron-right" : "chevron-down", 14));
				const header = el(
					"div",
					{ class: `sf-codex-folder-header${item.path ? " sf-codex-lore-folder" : ""}${item.path && lorePath === item.path ? " is-active" : ""}`, dataset: { key: item.id, type: "folder" }, attrs: { role: "treeitem", "aria-expanded": String(!collapsed) } },
					toggle,
					icon("folder", 16),
					item.path ? typeIcon(item.path) : null,
					label,
				);
				rows.push({
					key: item.id,
					type: "folder",
					parentKey,
					onClick: (target) => {
						targetFolder = item.id;
						if (item.path && !toggle.contains(target as Node)) void model.toggleLore(item.path);
						else model.toggleCodexFolder(item.id);
					},
				});
				const items2: MenuItem[] = [
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
					wrapper.append(children);
				}
				container.append(wrapper);
			} else {
				const row = el(
					"div",
					{ class: `sf-codex-file${lorePath === item.path ? " is-active" : ""}`, dataset: { key: item.path, type: "file" }, attrs: { role: "treeitem" } },
					typeIcon(item.path) ?? icon("file", 16),
					el("span", { class: "sf-codex-name", text: item.name }),
				);
				row.style.setProperty("--depth", String(depth));
				rows.push({ key: item.path, type: "file", parentKey, onClick: () => void model.toggleLore(item.path) });
				if (!readOnly()) {
					rowMenu(
						[
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
			await model.toggleLore(entry.path);
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
