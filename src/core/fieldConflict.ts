/** Thrown from inside a locked write when a field no longer holds what the writer last saw. Nothing has been written. */
export class FieldConflictError extends Error {
	constructor(readonly current: string) {
		super("The field changed on disk since it was last seen.");
		this.name = "FieldConflictError";
	}
}
