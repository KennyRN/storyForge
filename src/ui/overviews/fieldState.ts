import type { FieldResult } from "../../core/fieldWriter";
import type { RecoveryResult } from "../../core/recovery";
import type { NoticeInput } from "../kit/notices";

/** What a field of the author's words needs from its surroundings. No DOM here: the state is tested without one. */
export interface FieldHooks {
	label: string;
	/** The value on disk now. */
	read: () => Promise<string>;
	/** Writes `next` if the disk still holds `expected`. Sends whatever can't land to a recovery file itself. */
	commit: (expected: string, next: string) => Promise<FieldResult>;
	/** Saves text to a recovery file. Used when a commit throws, or is cut off by the close. */
	recover: (text: string) => Promise<RecoveryResult>;
	notify: (notice: NoticeInput) => void;
	getText: () => string;
	setText: (text: string) => void;
	/** Called after a successful write, with the value as stored. */
	written?: (stored: string) => void;
}

const stored = (text: string): string => (text.trim() === "" ? "" : text.trimEnd());

/**
 * The life of one field: what the disk held when the author began (`seen`), whether there is text not yet
 * written (`unsaved`, which stays set while a commit is in flight), and the two ways out of it: `flush`
 * (commit, and on a conflict or refusal recover) and `rescue` (the close has run out of patience: put the
 * text in a recovery file whatever the commit is doing). The author's words are never only in the field
 * once a close has been asked for.
 */
export class FieldState {
	seen = "";
	dirty = false;
	/** The text that has not been written yet, or is being written. Null when everything is on disk or in a recovery file. */
	unsaved: string | null = null;
	private pending: Promise<void> = Promise.resolve();

	constructor(private readonly hooks: FieldHooks) {}

	focused(): void {
		void this.hooks.read().then((v) => {
			if (!this.dirty) this.seen = v;
		});
	}

	edited(): void {
		this.dirty = true;
		this.unsaved = this.hooks.getText();
	}

	/** Shows a value from disk unless the author is in the middle of typing. Returns whether it was shown. */
	showFromDisk(value: string, focused: boolean): boolean {
		if (focused || this.dirty) return false;
		this.seen = value;
		this.hooks.setText(value);
		return true;
	}

	flush(): Promise<void> {
		this.pending = this.pending.then(async () => {
			if (!this.dirty) return;
			this.dirty = false;
			const next = this.hooks.getText();
			this.unsaved = next;
			let result: FieldResult;
			try {
				result = await this.hooks.commit(this.seen, next);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				result = { status: "refused", error: err, recovery: await this.hooks.recover(next).catch((e: Error): RecoveryResult => ({ ok: false, error: e })) };
			}
			if (result.status === "written" || result.status === "unchanged") {
				if (result.status === "written") {
					this.seen = stored(next);
					this.hooks.written?.(this.seen);
				}
				this.unsaved = this.dirty ? this.hooks.getText() : null;
			} else {
				const where = result.recovery.ok ? `Your text is saved in ${result.recovery.path}.` : "Your text could not be saved to a recovery file; it is still in the field.";
				if (result.status === "conflict") {
					this.hooks.setText(result.current);
					this.seen = result.current;
				}
				this.hooks.notify({
					kind: "error",
					text: result.status === "conflict" ? `${this.hooks.label} changed on disk while you were editing it, so your text was not saved over it. ${where}` : `${this.hooks.label} could not be saved. ${where}`,
					sticky: true,
					pinned: !result.recovery.ok,
				});
				this.unsaved = result.recovery.ok ? (this.dirty ? this.hooks.getText() : null) : next;
			}
		});
		return this.pending;
	}

	/** The close has cut the commit off (or it failed): the unsaved text goes to a recovery file now. */
	async rescue(): Promise<void> {
		const text = this.unsaved ?? (this.dirty ? this.hooks.getText() : null);
		if (text === null) return;
		const result = await this.hooks.recover(text).catch((e: Error): RecoveryResult => ({ ok: false, error: e }));
		this.hooks.notify({
			kind: "error",
			text: result.ok ? `${this.hooks.label} could not be saved before closing. Your text is saved in ${result.path}.` : `${this.hooks.label} could not be saved before closing, or to a recovery file.`,
			sticky: true,
			pinned: !result.ok,
		});
		if (result.ok) {
			this.unsaved = null;
			this.dirty = false;
		}
	}
}
