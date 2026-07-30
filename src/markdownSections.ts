/** Shared markdown frontmatter fence + ## section helpers used by book synopsis and Codex facts. */

/** Splits raw file content into its frontmatter fence (verbatim, incl. trailing newline) and body. */
export function splitFrontmatterAndBody(raw: string): { frontmatterBlock: string; body: string } {
	if (!raw.startsWith("---")) return { frontmatterBlock: "", body: raw };
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return { frontmatterBlock: "", body: raw };
	let fenceEnd = end + 4;
	if (raw[fenceEnd] === "\n") fenceEnd += 1;
	return { frontmatterBlock: raw.slice(0, fenceEnd), body: raw.slice(fenceEnd) };
}

/** Parses YAML inside a leading `---` fence into a plain object (empty on failure). */
export function parseFrontmatterBlock(raw: string, parseYaml: (text: string) => unknown): Record<string, unknown> {
	if (!raw.startsWith("---")) return {};
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return {};
	const yamlText = raw.slice(3, end).trim();
	if (yamlText.length === 0) return {};
	const parsed = parseYaml(yamlText) as Record<string, unknown> | null;
	return parsed ?? {};
}

export function extractSection(body: string, header: string): string {
	const idx = body.indexOf(header);
	if (idx === -1) return "";
	const start = idx + header.length;
	const nextHeaderIdx = body.indexOf("\n## ", start);
	return (nextHeaderIdx === -1 ? body.slice(start) : body.slice(start, nextHeaderIdx)).trim();
}

/** Replaces (or appends) the given `## `-prefixed section, leaving any other body content untouched. */
export function upsertSection(body: string, header: string, content: string): string {
	const newSection = `${header}\n${content.trim()}\n`;
	const idx = body.indexOf(header);
	if (idx === -1) {
		const sep = body.trim().length === 0 ? "" : "\n";
		return `${body.trimEnd()}${sep}\n${newSection}`;
	}
	const start = idx + header.length;
	const nextHeaderIdx = body.indexOf("\n## ", start);
	const before = body.slice(0, idx);
	const after = nextHeaderIdx === -1 ? "" : body.slice(nextHeaderIdx + 1);
	return `${before}${newSection}${after}`;
}
