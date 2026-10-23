import { el } from "../kit/dom";
import { openDialog } from "../kit/dialog";
import type { AppModel } from "../model";

/** The plugin's onboarding question: a series or one standalone book; then the folder picker, then `createProject`. */
export function openNewProject(model: AppModel): void {
	const input = el("input", { class: "sf-field", attrs: { type: "text", placeholder: "Series name", "aria-label": "Series name" } });
	const body = el("div", {}, el("p", { text: "Are you writing a series, or a single standalone book?" }), input);
	let dialog: ReturnType<typeof openDialog>;
	const start = (standalone: boolean) => async (): Promise<boolean> => {
		const title = input.value.trim();
		if (!title) {
			input.focus();
			return false;
		}
		dialog.close();
		await model.openProject("create", { seriesTitle: title, standalone });
		return true;
	};
	dialog = openDialog({
		title: "Welcome to storyForge",
		body,
		buttons: [
			{ label: "Cancel", kind: "quiet" },
			{ label: "Just one book (no series)", onClick: start(true) },
			{ label: "Start my series", kind: "primary", onClick: start(false) },
		],
	});
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") void start(false)();
	});
}
