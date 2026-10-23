/** The session snapshot (Brief 3) kept in machine settings: one entry per project, named by a hash of the project's path. */
import { type Snapshot, type SnapshotLoad, type SnapshotStore, snapshotKey, validateSnapshot } from "../core/snapshot";
import type { MachineStore } from "./settings";

export class MachineSnapshotStore implements SnapshotStore {
	constructor(private readonly store: MachineStore) {}

	async load(projectRoot: string): Promise<SnapshotLoad> {
		let text: string | null;
		try {
			text = await this.store.get(`snapshots/${snapshotKey(projectRoot)}`);
		} catch (err) {
			return { status: "unreadable", reason: (err as Error).message };
		}
		if (text === null) return { status: "missing" };
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return { status: "unreadable", reason: "not valid JSON" };
		}
		const checked = validateSnapshot(parsed, projectRoot);
		return checked.ok ? { status: "ok", snapshot: checked.snapshot } : { status: "unreadable", reason: checked.reason };
	}

	async save(projectRoot: string, snapshot: Snapshot): Promise<void> {
		await this.store.set(`snapshots/${snapshotKey(projectRoot)}`, JSON.stringify(snapshot));
	}
}
