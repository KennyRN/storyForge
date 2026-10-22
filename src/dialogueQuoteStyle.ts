export type DialogueQuoteStyle = "double" | "single";

/** Normalise stored / unknown values to a supported quote style. */
export function normalizeDialogueQuoteStyle(raw: unknown): DialogueQuoteStyle {
	return raw === "single" ? "single" : "double";
}
