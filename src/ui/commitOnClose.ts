/**
 * Fields that write to the project (plot notes, synopses, the description, the planned lengths) commit when
 * they lose focus. The one that has focus when the app closes would otherwise be lost, so while a field is
 * being edited it registers here, and the close commits whatever is registered before the editors are flushed
 * (docs/story-shape.md §5.3).
 */
export interface FocusedField {
	/** Commits the field now and resolves when the write (or its recovery) is done. */
	flush(): Promise<void>;
}

const active = new Set<FocusedField>();

/** Marks a field as being edited. Returns the function that says it no longer is. */
export function registerFocusedField(field: FocusedField): () => void {
	active.add(field);
	return () => void active.delete(field);
}

/** Commits every field being edited right now. */
export async function commitFocusedFields(): Promise<void> {
	await Promise.all([...active].map((f) => f.flush()));
}
