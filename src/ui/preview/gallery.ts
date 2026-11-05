import { installInputMode } from "../kit/inputMode";
import { installScrollIndicator } from "../kit/scrollIndicator";
/** The kit on one page, for looking at and testing in WebKit (docs/interface.md §8). */
import "../theme/index.css";
import { button } from "../kit/button";
import { openDialog } from "../kit/dialog";
import { el } from "../kit/dom";
import { attachInlineRename } from "../kit/inlineRename";
import { showMenu, menuPoint } from "../kit/menu";
import { mountNotices, NoticeCenter } from "../kit/notices";

const app = document.getElementById("app") as HTMLElement;
const notices = new NoticeCenter();
const noticeHost = el("div");
const log = el("div", { class: "sf-muted", attrs: { id: "log" } });

const title = el("span", { text: "Chapter one", attrs: { id: "title" } });
const row = el("div", { class: "gallery-row", attrs: { id: "row", tabindex: "0" } }, title);
attachInlineRename({
	row,
	label: title,
	getCurrentTitle: () => title.textContent ?? "",
	onCommit: async (name) => {
		title.textContent = name;
		log.textContent = `renamed to ${name}`;
	},
	validate: (name) => (/[\[\]#^|]/.test(name) ? "A note name can't contain [ ] # ^ |, because no link can carry them." : null),
});

const iconOnly = button({ icon: "settings", tooltip: "Settings", onClick: () => (log.textContent = "settings clicked") });
iconOnly.id = "icon-button";

app.append(
	el(
		"div",
		{ class: "gallery" },
		el("h1", { text: "Kit" }),
		el(
			"div",
			{ class: "gallery-buttons" },
			button({ label: "Primary", kind: "primary", onClick: () => (log.textContent = "primary clicked") }),
			button({ label: "Default", onClick: () => (log.textContent = "default clicked") }),
			button({ label: "Quiet", kind: "quiet", onClick: () => {} }),
			button({ label: "Disabled", disabled: true, onClick: () => {} }),
			iconOnly,
			button({ icon: "folder-plus", tooltip: "New folder", onClick: () => {} }),
			button({ icon: "archive", tooltip: "Archive", onClick: () => {} }),
		),
		el(
			"div",
			{ class: "gallery-buttons" },
			(() => {
				const b = button({
					label: "Menu",
					onClick: () =>
						showMenu(
							[
								{ label: "Rename", onSelect: () => void (log.textContent = "menu: rename") },
								{ separator: true },
								{ label: "Archive", onSelect: () => void (log.textContent = "menu: archive") },
								{ label: "Unavailable", disabled: true },
							],
							menuPoint(b),
						),
				});
				b.id = "menu-button";
				return b;
			})(),
			(() => {
				const b = button({
					label: "Dialog",
					onClick: () =>
						openDialog({
							title: "Rename note",
							body: el("div", {}, el("p", { text: "Type a new name." }), el("input", { class: "sf-field", attrs: { type: "text", "aria-label": "Name" } })),
							buttons: [{ label: "Cancel", kind: "quiet", onClick: () => void (log.textContent = "dialog cancelled") }, { label: "Rename", kind: "primary", onClick: () => void (log.textContent = "dialog confirmed") }],
						}),
				});
				b.id = "dialog-button";
				return b;
			})(),
			(() => {
				const b = button({ label: "Transient notice", onClick: () => notices.notify({ kind: "success", text: "Chapter created" }) });
				b.id = "notify-transient";
				return b;
			})(),
			(() => {
				const b = button({
					label: "Sticky notice",
					onClick: () =>
						notices.notify({
							kind: "error",
							text: "Chapter 3 changed on disk while you were typing. Your text is saved at _sf-backup/recovery/aaa/ch-a1.md.",
							sticky: true,
							actions: [{ label: "Reveal", onClick: () => void (log.textContent = "revealed"), dismiss: false }],
						}),
				});
				b.id = "notify-sticky";
				return b;
			})(),
		),
		el("p", { class: "sf-muted", text: "Double-click the title, or focus it and press F2, to rename." }),
		row,
		log,
	),
	noticeHost,
);
mountNotices(noticeHost, notices);
installScrollIndicator();
installInputMode();
document.documentElement.dataset.ready = "true";
