/**
 * JSON double-quoted string is a legal YAML scalar. Using it for injected
 * frontmatter values means a newline or colon in a sibling-supplied id cannot
 * break out of the scalar and rewrite the document.
 */
export function yamlQuotedScalar(value: string): string {
	if (/[\r\n]/.test(value) || value.includes("\0")) {
		throw new Error("YAML scalar cannot contain newlines or NUL");
	}
	return JSON.stringify(value);
}
