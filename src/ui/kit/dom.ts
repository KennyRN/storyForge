/** A tiny element builder: plain DOM, no framework. */
export interface ElProps {
	class?: string;
	text?: string;
	attrs?: Record<string, string>;
	dataset?: Record<string, string>;
	on?: { [K in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[K]) => void };
}

export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (props.class) node.className = props.class;
	if (props.text !== undefined) node.textContent = props.text;
	for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
	for (const [k, v] of Object.entries(props.dataset ?? {})) node.dataset[k] = v;
	for (const [type, handler] of Object.entries(props.on ?? {})) node.addEventListener(type, handler as EventListener);
	append(node, children);
	return node;
}

export function append(parent: Element | DocumentFragment, children: Child[]): void {
	for (const c of children) if (c) parent.append(c);
}

export function clear(node: Node): void {
	while (node.firstChild) node.removeChild(node.firstChild);
}

/** Replaces `node`'s children. */
export function fill(node: Element | DocumentFragment, ...children: Child[]): void {
	clear(node);
	append(node, children);
}
