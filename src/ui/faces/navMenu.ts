import { el } from "../kit/dom";
import { icon } from "../kit/icons";
import { attachTooltip } from "../kit/tooltip";
import { handleMenu, menuState } from "../menu";
import type { AppModel, ForgeTab } from "../model";

/**
 * The left panel's menu (Fix 7 polish, item 6): a chevron at the right end of the panel's top band, on both sides, opening where you
 * steer from: the project's name (quiet, not a control), the storytelling side, the four library tabs, then Back Up Now and Change
 * Project. Where you are is green. It is drawn in the panel, on the raised surface with no border, and its rows take the chapter
 * list's shape. Back Up Now and Change Project are the File menu's own items (`handleMenu`), so the reasons and the close are the same.
 */
export function mountNavMenu(host: HTMLElement, model: AppModel): { button: HTMLElement; dispose(): void } {
	let menu: HTMLElement | null = null;
	let off: (() => void) | null = null;

	const button = el("button", { class: "sf-navmenu-button", attrs: { type: "button", "aria-label": "Navigate", "aria-haspopup": "menu", "aria-expanded": "false" } });
	const chevron = icon("chevron-down", 13);
	chevron.style.width = "1em";
	chevron.style.height = "1em";
	button.append(chevron);
	attachTooltip(button, "navigate");

	const close = (focus: boolean): void => {
		if (!menu) return;
		menu.remove();
		menu = null;
		off?.();
		off = null;
		button.setAttribute("aria-expanded", "false");
		if (focus) button.focus();
	};

	const open = (): void => {
		const running = model.running;
		if (!running || menu) return;
		const name = running.root.slice(running.root.lastIndexOf("/") + 1);
		const state = menuState(model);
		const hideSeries = !!running.settings.values.hideSeriesPane;
		const onForge = model.nav.face === "storyforge";
		const rows: HTMLButtonElement[] = [];
		const item = (label: string, action: () => void, opts: { here?: boolean; disabled?: string | boolean } = {}): HTMLButtonElement => {
			const row = el("button", { class: `sf-navmenu-row${opts.here ? " is-here" : ""}`, attrs: { type: "button", role: "menuitem", tabindex: "-1", ...(opts.here ? { "aria-current": "true" } : {}) }, text: label });
			if (opts.disabled) {
				row.disabled = true;
				if (typeof opts.disabled === "string") row.title = opts.disabled;
			} else row.addEventListener("click", () => (close(false), action()));
			rows.push(row);
			return row;
		};
		const tab = (id: ForgeTab, label: string): HTMLButtonElement => item(label, () => model.openLibraryTab(id), { here: onForge && model.nav.forgeTab === id });
		const readOnly = running.readOnlyReason ? "This project is open read-only." : "";
		menu = el(
			"div",
			{ class: "sf-navmenu", attrs: { role: "menu", "aria-label": "Navigate" } },
			el("div", { class: "sf-navmenu-name", attrs: { role: "presentation" }, text: name }),
			item("Storytelling", () => model.flipFace(), { here: !onForge }),
			tab("codex", "Codex"),
			...(hideSeries ? [] : [tab("series", "Series")]),
			tab("novel", "Novel"),
			tab("archive", "Archive"),
			el("div", { class: "sf-navmenu-gap", attrs: { role: "separator" } }),
			item("Back Up Now", () => void handleMenu(model, "backup-now"), { disabled: state["backup-now"] ? false : readOnly || true }),
			item("Change Project", () => void handleMenu(model, "close-project")),
		);
		host.append(menu);
		button.setAttribute("aria-expanded", "true");
		const enabled = (): HTMLButtonElement[] => rows.filter((r) => !r.disabled);
		const away = (e: Event): void => {
			if (e.target instanceof Node && !menu?.contains(e.target) && !button.contains(e.target)) close(false);
		};
		const key = (e: KeyboardEvent): void => {
			const list = enabled();
			const at = list.indexOf(document.activeElement as HTMLButtonElement);
			if (e.key === "Escape") (e.stopPropagation(), close(true));
			else if (e.key === "Tab") close(false);
			else if (e.key === "ArrowDown") list[(at + 1) % list.length]?.focus();
			else if (e.key === "ArrowUp") list[(at <= 0 ? list.length : at) - 1]?.focus();
			else if (e.key === "Home") list[0]?.focus();
			else if (e.key === "End") list[list.length - 1]?.focus();
			else return;
			e.preventDefault();
		};
		document.addEventListener("pointerdown", away, true);
		menu.addEventListener("keydown", key);
		const offNav = model.subscribe(["face", "nav", "project"], () => close(false));
		off = () => (document.removeEventListener("pointerdown", away, true), offNav());
		enabled()[0]?.focus();
	};

	button.addEventListener("click", () => (menu ? close(false) : open()));
	button.addEventListener("keydown", (e) => {
		if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !menu) {
			e.preventDefault();
			open();
		}
	});
	return { button, dispose: () => close(false) };
}
