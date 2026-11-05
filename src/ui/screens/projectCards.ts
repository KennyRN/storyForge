/**
 * The start screen's project cards (Brief 16, docs/project-cards.md): each recent project on a card with its image, its name and where it lives.
 * The cards are drawn at once from the recent list, with the folder's name and no image; each card then asks (`peek_recent`, read only, by its
 * index) and fills itself in when its answer arrives, so a slow or offline drive never holds the screen up and one card never waits for another.
 * One click opens a project; Remove from List takes only the entry, never the project.
 */
import { finishCard, planCard, type CardState, type CardView, type PeekCover } from "../../core/projectCard";
import { el, fill } from "../kit/dom";
import { showMenu, menuPoint } from "../kit/menu";
import { photoIcon } from "../kit/photoIcon";
import type { AppModel } from "../model";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
/** A path longer than this is cut in the middle with "…". */
const PATH_MAX = 28;

export const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1) || p;

/** The path as shown: the home folder is `~` (macOS home folders are /Users/<name>), and a long one is cut in the middle. The full path is the tooltip. */
export function shownPath(path: string): string {
	const home = /^\/Users\/[^/]+/.exec(path)?.[0];
	const tilde = home ? `~${path.slice(home.length)}` : path;
	if (tilde.length <= PATH_MAX) return tilde;
	const head = Math.ceil((PATH_MAX - 1) * 0.42);
	return `${tilde.slice(0, head)}…${tilde.slice(tilde.length - (PATH_MAX - 1 - head))}`;
}

const STATE_WORDS: Record<Exclude<CardState, "ok">, string> = { "not-found": "Not found", "not-a-project": "Not a project" };

function coverUrl(cover: PeekCover): string | null {
	const ext = cover.filename.split(".").pop()?.toLowerCase() ?? "";
	if (!(ext in MIME)) return null;
	try {
		const bytes = Uint8Array.from(atob(cover.base64), (c) => c.charCodeAt(0));
		return URL.createObjectURL(new Blob([bytes], { type: MIME[ext] }));
	} catch {
		return null; // an image that can't be shown counts as no cover
	}
}

/** Draws the cards into `host` and keeps them current; returns what to call when the screen goes. */
export function mountProjectCards(host: HTMLElement, model: AppModel): () => void {
	const list = el("ul", { class: "sf-project-cards", attrs: { "aria-label": "Recent projects" } });
	fill(host, list);
	let generation = 0;
	let urls: string[] = [];
	let paths: string[] = [];
	/** What each project's card last showed, by path, so a redraw (after a removal) is instant and only new entries ask. */
	const views = new Map<string, CardView>();
	let namesTimer = false;
	/** After Delete removes a card, focus goes to the card that took its place, once the list is drawn again. */
	let refocus: number | null = null;

	const sendNames = (): void => {
		if (namesTimer) return;
		namesTimer = true;
		queueMicrotask(() => {
			namesTimer = false;
			const now = paths.map((p): [string, string] => [baseName(p), views.get(p)?.name ?? baseName(p)]);
			void model.controller.setRecentNames(now).catch(() => undefined); // labels only: the menu keeps the folders' names if this fails
		});
	};

	const cards = (): HTMLButtonElement[] => Array.from(list.querySelectorAll<HTMLButtonElement>("button.sf-project-card"));

	const remove = async (index: number): Promise<void> => {
		await model.forgetRecent(index);
	};

	const paint = (card: HTMLButtonElement, path: string, view: CardView): void => {
		const image = card.querySelector<HTMLElement>(".sf-project-card-image")!;
		const name = card.querySelector<HTMLElement>(".sf-project-card-name")!;
		const state = card.querySelector<HTMLElement>(".sf-project-card-state")!;
		const blocked = view.state !== "ok";
		name.textContent = view.name;
		state.textContent = blocked ? STATE_WORDS[view.state as Exclude<CardState, "ok">] : "";
		state.hidden = !blocked;
		card.setAttribute("aria-disabled", String(blocked));
		card.classList.toggle("is-unavailable", blocked);
		// The screen reader hears the state as part of the card's name.
		card.setAttribute("aria-label", blocked ? `${view.name}, ${STATE_WORDS[view.state as Exclude<CardState, "ok">]}` : view.name);
		card.dataset.state = view.state;
		const url = view.cover ? coverUrl(view.cover) : null;
		if (url) {
			urls.push(url);
			fill(image, el("img", { attrs: { src: url, alt: "", draggable: "false" } }));
			image.classList.remove("is-empty");
		} else {
			fill(image, photoIcon());
			image.classList.add("is-empty");
		}
		views.set(path, view);
		sendNames();
	};

	const ask = async (card: HTMLButtonElement, index: number, path: string, mine: number): Promise<void> => {
		try {
			const peek = await model.controller.peekRecent(index);
			if (mine !== generation) return;
			const plan = planCard(peek, baseName(path));
			paint(card, path, { state: plan.state, name: plan.name, cover: plan.cover });
			if (!plan.needsBook || !plan.firstBook) return;
			const book = await model.controller.peekRecentBook(index, plan.firstBook.position).catch(() => null); // a book that changed since is ignored
			if (mine !== generation) return;
			paint(card, path, finishCard(plan, book));
		} catch {
			/* it stays as drawn: the folder's name, no image, and still clickable */
		}
	};

	const draw = async (): Promise<void> => {
		const mine = ++generation;
		const recent = await model.controller.recent();
		if (mine !== generation) return;
		for (const u of urls.splice(0)) URL.revokeObjectURL(u);
		paths = recent;
		for (const known of [...views.keys()]) if (!recent.includes(known)) views.delete(known);
		if (recent.length === 0) return fill(list);
		fill(
			list,
			...recent.map((path, i) => {
				const card = el(
					"button",
					{ class: "sf-project-card", attrs: { type: "button", title: path, "aria-label": baseName(path) }, dataset: { recent: String(i) } },
					el("div", { class: "sf-project-card-image is-empty" }, photoIcon()),
					el("div", { class: "sf-project-card-text" }, el("span", { class: "sf-project-card-name", text: baseName(path) }), el("span", { class: "sf-project-card-path", text: shownPath(path) }), el("span", { class: "sf-project-card-state", attrs: { hidden: "" } })),
				);
				card.addEventListener("click", () => {
					if (card.getAttribute("aria-disabled") === "true") return; // not found, or not a project: nothing to open
					void model.openRecent(i);
				});
				card.addEventListener("contextmenu", (e) => {
					e.preventDefault();
					showMenu([{ label: "Remove from List", onSelect: () => void remove(i) }], menuPoint(e), { label: "Project" });
				});
				return el("li", { class: "sf-project-cards-item" }, card);
			}),
		);
		cards().forEach((card, i) => {
			const known = views.get(recent[i]);
			if (known) paint(card, recent[i], known);
			else void ask(card, i, recent[i], mine);
		});
		if (refocus !== null) {
			cards()[Math.min(refocus, cards().length - 1)]?.focus();
			refocus = null;
		}
	};

	// Arrows move between cards (left and right by one, up and down to the card nearest above or below), Return opens (a button's own), Delete
	// removes the entry, and Shift-F10 or Control-Return opens the context menu: the cards are buttons in one list.
	list.addEventListener("keydown", (e) => {
		const card = (e.target as HTMLElement).closest<HTMLButtonElement>("button.sf-project-card");
		if (!card) return;
		const all = cards();
		const at = all.indexOf(card);
		const focus = (i: number): void => void all[Math.max(0, Math.min(all.length - 1, i))]?.focus();
		const index = Number(card.dataset.recent);
		if (e.key === "ArrowRight") focus(at + 1);
		else if (e.key === "ArrowLeft") focus(at - 1);
		else if (e.key === "Home") focus(0);
		else if (e.key === "End") focus(all.length - 1);
		else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			const r = card.getBoundingClientRect();
			const below = e.key === "ArrowDown";
			const candidates = all.filter((c) => {
				const b = c.getBoundingClientRect();
				return below ? b.top > r.top + 4 : b.top < r.top - 4;
			});
			if (candidates.length === 0) return;
			const rowTop = below ? Math.min(...candidates.map((c) => c.getBoundingClientRect().top)) : Math.max(...candidates.map((c) => c.getBoundingClientRect().top));
			const row = candidates.filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 4);
			row.sort((a, b) => Math.abs(a.getBoundingClientRect().left - r.left) - Math.abs(b.getBoundingClientRect().left - r.left));
			row[0]?.focus();
		} else if (e.key === "Delete" || e.key === "Backspace") {
			refocus = at;
			void remove(index);
		} else if ((e.key === "F10" && e.shiftKey) || (e.key === "Enter" && e.ctrlKey)) {
			showMenu([{ label: "Remove from List", onSelect: () => void remove(index) }], menuPoint(card), { label: "Project" });
		} else return;
		e.preventDefault();
	});

	const off = model.subscribe("recent", () => void draw());
	void draw();
	return () => {
		generation++;
		off();
		for (const u of urls.splice(0)) URL.revokeObjectURL(u);
	};
}
