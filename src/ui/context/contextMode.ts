import type { AppModel } from "../model";

/** What the context panel shows: it belongs to its side and tab, as the workspace does (Brief 19 §4). The storytelling side's note, the novel tab's chosen chapter, the series tab's chosen novel, and nothing on the Codex and Archive tabs. */
export type ContextMode = "note" | "chapter" | "novel" | "empty";

export const contextMode = (model: AppModel): ContextMode => {
	if (model.nav.face === "storytelling") return "note";
	const tab = model.nav.forgeTab;
	return tab === "novel" ? "chapter" : tab === "series" ? "novel" : "empty";
};
