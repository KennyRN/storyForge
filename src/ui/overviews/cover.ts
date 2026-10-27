import type { CoverTarget } from "../../app/appLife";
import { readBookFrontmatter } from "../../core/book";
import { bookBackstagePath, seriesBackstagePath } from "../../core/paths";
import { readSeriesFrontmatter } from "../../core/series";
import { el } from "../kit/dom";
import type { AppModel } from "../model";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
/** Blob URLs by cover, kept until the file changes (its name, size or time). */
const shown = new Map<string, { version: string; url: string }>();
const targetKey = (t: CoverTarget): string => (t.kind === "series" ? "series" : `book:${t.code}`);
/** Covers already reported as not showing, by version: one notice per failure, not one per redraw. */
const reported = new Set<string>();

/**
 * A cover: the image if there is one that Rust will read, otherwise a placeholder (a missing, unreadable or
 * unrecognised image is never an error). Clicking it asks Rust to show the open panel; the window never names a path.
 */
export function coverBox(model: AppModel, target: CoverTarget, title: string): HTMLElement {
	const running = model.running;
	const project = running?.opened.project;
	const readOnly = !running || !!running.readOnlyReason;
	const name = !project ? null : target.kind === "series" ? readSeriesFrontmatter(project).coverImage : (readBookFrontmatter(project, target.code)?.coverImage ?? null);
	const folder = target.kind === "series" ? seriesBackstagePath() : bookBackstagePath(target.code);
	const entry = project && name ? project.entry(`${folder}/${name}`) : undefined;
	const ext = name?.split(".").pop()?.toLowerCase() ?? "";
	const readable = !!entry && entry.kind === "file" && name === `cover.${ext}` && ext in MIME;

	const box = el("button", { class: "sf-cover", attrs: { type: "button", "aria-label": `Choose a cover for ${title}` }, dataset: { cover: targetKey(target) } });
	box.disabled = readOnly;
	box.addEventListener("click", () => void model.chooseCover(target));
	const placeholder = (): void => {
		box.replaceChildren(el("span", { class: "sf-cover-placeholder sf-muted", text: "No cover" }));
		box.dataset.state = "placeholder";
		box.setAttribute("aria-label", `Choose a cover for ${title}`);
	};
	/** A cover that is recorded but can't be shown is never a silent "No cover": a notice says what failed (once per version). */
	const failed = (version: string, why: string): void => {
		placeholder();
		const key = `${targetKey(target)}|${version}`;
		if (reported.has(key)) return;
		reported.add(key);
		model.notices.notify({ text: `The cover of ${title} could not be shown: ${why}`, key: `cover-${targetKey(target)}` });
	};
	placeholder();
	if (readable && entry && name) {
		const version = `${name}|${entry.size}|${entry.mtimeMs}`;
		const show = (url: string): void => {
			const img = el("img", { class: "sf-cover-image", attrs: { src: url, alt: "" } });
			// A file the window can't draw (not a picture, or blocked) is a placeholder and a notice, never a broken image or silence.
			img.addEventListener("error", () => failed(version, "the file is not an image the window can draw."));
			box.replaceChildren(img);
			box.dataset.state = "image";
			// The label says what is true: a cover is on screen. (A button's children are not exposed, so this is also how a check sees it.)
			box.setAttribute("aria-label", `Change the cover of ${title}`);
		};
		const key = targetKey(target);
		const cached = shown.get(key);
		if (cached?.version === version) show(cached.url);
		else {
			void model.controller
				.readCover(target, name)
				.then((bytes) => {
					const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: MIME[ext] }));
					const old = shown.get(key);
					if (old) URL.revokeObjectURL(old.url);
					shown.set(key, { version, url });
					show(url);
				})
				.catch((e) => failed(version, (e as { message?: string })?.message ?? String(e)));
		}
	}
	return box;
}

/** A small "Remove cover" button, shown only when there is a cover and the project can be written. */
export function removeCoverButton(model: AppModel, target: CoverTarget, title: string): HTMLElement | null {
	const running = model.running;
	const project = running?.opened.project;
	if (!running || !project || running.readOnlyReason) return null;
	const name = target.kind === "series" ? readSeriesFrontmatter(project).coverImage : (readBookFrontmatter(project, target.code)?.coverImage ?? null);
	if (!name) return null;
	return el("button", { class: "sf-cover-remove", text: "Remove cover", attrs: { type: "button", "aria-label": `Remove the cover of ${title}` }, on: { click: () => void model.removeCover(target) } });
}
