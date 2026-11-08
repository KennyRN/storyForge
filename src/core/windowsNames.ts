import { isReservedFileName } from "./codex";
import type { ProjectIndex } from "./projectIndex";

/** The folders whose names are the author's and storyForge's own; the rest of the folder (other apps' files) is not our business. */
const OWN_ROOTS = ["codex/", "_story-library/", "notes/", "_backstage/"];
const BAD_CHARS = /[<>:"|?*\u0000-\u001f]/;

/** Why a file or folder name can't exist on Windows, or null (Brief 22, ruling 2). */
export function windowsNameProblem(segment: string): string | null {
	if (BAD_CHARS.test(segment)) return "its name has a character Windows doesn't allow (< > : \" | ? *)";
	if (/[. ]$/.test(segment)) return "its name ends in a dot or a space";
	if (isReservedFileName(segment)) return "its name is reserved by Windows";
	return null;
}

export interface UnusableName {
	path: string;
	reason: string;
}

/**
 * Files and folders already in the project whose names Windows can't hold. They are only listed, never renamed: the
 * project is opened on the Mac as it always was, and the list says what a Windows copy of it would lose.
 */
export function unusableOnWindows(index: ProjectIndex): UnusableName[] {
	const out: UnusableName[] = [];
	for (const entry of index.all()) {
		if (!OWN_ROOTS.some((r) => entry.path.toLowerCase().startsWith(r))) continue;
		for (const segment of entry.path.split("/")) {
			const reason = windowsNameProblem(segment);
			if (reason) {
				out.push({ path: entry.path, reason });
				break;
			}
		}
	}
	return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}
