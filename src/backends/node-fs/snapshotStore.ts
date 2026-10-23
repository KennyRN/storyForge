/** The snapshot store over a folder the caller supplies (the app's data folder, in Brief 4). Node only. */
import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { type Snapshot, type SnapshotLoad, type SnapshotStore, snapshotKey, validateSnapshot } from "../../core/snapshot";

export class NodeFsSnapshotStore implements SnapshotStore {
	constructor(private readonly folder: string) {}

	private file(projectRoot: string): string {
		return nodePath.join(this.folder, `${snapshotKey(projectRoot)}.json`);
	}

	async load(projectRoot: string): Promise<SnapshotLoad> {
		let text: string;
		try {
			text = await fs.readFile(this.file(projectRoot), "utf8");
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
			return { status: "unreadable", reason: (err as Error).message };
		}
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
		const target = this.file(projectRoot);
		await fs.mkdir(this.folder, { recursive: true });
		const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
		const handle = await fs.open(tmp, "wx");
		try {
			await handle.writeFile(JSON.stringify(snapshot));
			await handle.sync();
		} catch (err) {
			await handle.close().catch(() => undefined);
			await fs.rm(tmp, { force: true }).catch(() => undefined);
			throw err;
		}
		await handle.close();
		try {
			await fs.rename(tmp, target);
		} catch (err) {
			await fs.rm(tmp, { force: true }).catch(() => undefined);
			throw err;
		}
	}
}
