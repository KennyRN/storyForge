import { Project } from "../../src/core/project";
import { readFrontmatter, stringifyFrontmatterBlock, type FrontmatterRecord } from "../../src/core/frontmatter";
import { MemoryBackend } from "./memoryBackend";

export interface MemoryProject {
	project: Project;
	backend: MemoryBackend;
	/** Parsed frontmatter of a file currently on the (in-memory) disk. */
	fm(path: string): FrontmatterRecord;
	/** Paths of everything retired into `.trash/`. */
	trashed(): string[];
}

/** Opens a Project over an in-memory backend. Values are file text; `null` makes an (empty) folder. */
export async function memoryProject(files: Record<string, string | Uint8Array | null> = {}): Promise<MemoryProject> {
	const backend = new MemoryBackend(files);
	const project = await Project.open(backend);
	return {
		project,
		backend,
		fm(path) {
			const text = backend.files.get(path);
			if (typeof text !== "string") throw new Error(`no text file at ${path}`);
			const parsed = readFrontmatter(text);
			if (parsed.state !== "ok") throw new Error(`no readable frontmatter at ${path}`);
			return parsed.data;
		},
		trashed: () => [...backend.files.keys()].filter((p) => p.startsWith(".trash/")).sort(),
	};
}

export function fmFile(data: FrontmatterRecord, body = ""): string {
	return stringifyFrontmatterBlock(data) + body;
}
