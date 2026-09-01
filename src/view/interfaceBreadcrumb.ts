import { setIcon, setTooltip } from "obsidian";
import { makeAccessibleActivatable } from "./a11y";

export interface BreadcrumbNode {
	id: string;
	label: string;
	icon: string;
	children?: BreadcrumbNode[];
	render?: (body: HTMLElement) => void;
}

/** Clicking a node at `depth` keeps ancestors and replaces everything below. */
export function clickBreadcrumb(path: string[], depth: number, id: string): string[] {
	return [...path.slice(0, depth), id];
}

export function nodeAtPath(roots: BreadcrumbNode[], path: string[]): BreadcrumbNode | undefined {
	let siblings: BreadcrumbNode[] | undefined = roots;
	let node: BreadcrumbNode | undefined;
	for (const id of path) {
		node = siblings?.find((candidate) => candidate.id === id);
		if (!node) return undefined;
		siblings = node.children;
	}
	return node;
}

export function isLeafNode(node: BreadcrumbNode | undefined): node is BreadcrumbNode {
	return !!node && !node.children?.length;
}

/** One sibling group per selected ancestor that has children, starting with the roots. */
export function groupsForPath(roots: BreadcrumbNode[], path: string[]): BreadcrumbNode[][] {
	const groups: BreadcrumbNode[][] = [roots];
	let siblings = roots;
	for (const id of path) {
		const node = siblings.find((candidate) => candidate.id === id);
		if (!node?.children?.length) break;
		groups.push(node.children);
		siblings = node.children;
	}
	return groups;
}

export function renderIconBreadcrumb(
	host: HTMLElement,
	roots: BreadcrumbNode[],
	path: string[],
	onSelect: (next: string[]) => void,
): void {
	host.empty();
	const groups = groupsForPath(roots, path);
	groups.forEach((group, depth) => {
		if (depth > 0) host.createSpan({ cls: "sf-ui-format-crumb-spacer" });
		const phase = host.createDiv({ cls: "sf-ui-format-crumb-phase" });
		for (const node of group) {
			const selected = path[depth] === node.id;
			const el = phase.createSpan({
				cls: `sf-ui-format-crumb-icon${selected ? " is-active" : ""}${node.id === "text" ? " sf-ui-format-crumb-icon--text" : ""}`,
				attr: {
					"aria-label": node.label,
					"aria-pressed": selected ? "true" : "false",
				},
			});
			setIcon(el, node.icon);
			setTooltip(el, node.label);
			const select = () => onSelect(clickBreadcrumb(path, depth, node.id));
			el.addEventListener("click", select);
			makeAccessibleActivatable(el, select);
		}
	});
}
