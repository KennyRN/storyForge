import { describe, expect, it } from "vitest";
import type { FieldResult } from "../../../core/fieldWriter";
import type { RecoveryResult } from "../../../core/recovery";
import type { NoticeInput } from "../../kit/notices";
import { FieldState } from "../fieldState";

function make(overrides: { commit?: (expected: string, next: string) => Promise<FieldResult>; recover?: (text: string) => Promise<RecoveryResult> } = {}) {
	const log = { text: "", recovered: [] as string[], notices: [] as NoticeInput[], written: [] as string[] };
	const state = new FieldState({
		label: "Plot note",
		read: async () => "on disk",
		commit: overrides.commit ?? (async () => ({ status: "written" })),
		recover: overrides.recover ?? (async (t) => (log.recovered.push(t), { ok: true, path: "_sf-backup/recovery/x.md" })),
		notify: (n) => log.notices.push(n),
		getText: () => log.text,
		setText: (t) => (log.text = t),
		written: (s) => log.written.push(s),
	});
	const type = (text: string) => {
		log.text = text;
		state.edited();
	};
	return { state, log, type };
}

describe("a field of the author's words", () => {
	it("writes on flush and remembers what it wrote; nothing is left unsaved", async () => {
		const { state, log, type } = make();
		type("New words.  ");
		expect(state.unsaved).toBe("New words.  ");
		await state.flush();
		expect(log.written).toEqual(["New words."]);
		expect(state.unsaved).toBeNull();
		expect(log.recovered).toEqual([]);
	});

	it("a commit that hangs is rescued into a recovery file when the close cuts it off", async () => {
		const { state, log, type } = make({ commit: () => new Promise(() => undefined) });
		type("Words typed when the disk hung.");
		void state.flush(); // never resolves
		await Promise.resolve();
		expect(state.unsaved).toBe("Words typed when the disk hung.");
		await state.rescue();
		expect(log.recovered).toEqual(["Words typed when the disk hung."]);
		expect(log.notices[0]).toMatchObject({ sticky: true });
		expect(log.notices[0].text).toContain("_sf-backup/recovery/x.md");
		expect(state.unsaved).toBeNull();
	});

	it("text that was typed but never flushed is rescued too", async () => {
		const { state, log, type } = make();
		type("Still in the field.");
		await state.rescue();
		expect(log.recovered).toEqual(["Still in the field."]);
	});

	it("a commit that throws sends the text to a recovery file instead of losing it", async () => {
		const { state, log, type } = make({
			commit: async () => {
				throw new Error("disk full");
			},
		});
		type("Do not lose me.");
		await state.flush();
		expect(log.recovered).toEqual(["Do not lose me."]);
		expect(log.notices[0].text).toContain("could not be saved");
		expect(log.notices[0].text).toContain("_sf-backup/recovery/x.md");
		expect(state.unsaved).toBeNull();
	});

	it("if the recovery file cannot be written either, the text is kept as unsaved, the notice is pinned, and a later rescue tries again", async () => {
		let works = false;
		const { state, log, type } = make({
			commit: async () => {
				throw new Error("disk full");
			},
			recover: async (t) => (works ? (log0.push(t), { ok: true, path: "r.md" }) : { ok: false, error: new Error("no space") }),
		});
		const log0: string[] = [];
		type("Precious.");
		await state.flush();
		expect(state.unsaved).toBe("Precious.");
		expect(log.notices[0].pinned).toBe(true);
		works = true;
		await state.rescue();
		expect(log0).toEqual(["Precious."]);
		expect(state.unsaved).toBeNull();
	});

	it("a conflict shows what is on disk and keeps the author's text in recovery", async () => {
		const { state, log, type } = make({ commit: async () => ({ status: "conflict", current: "somebody else", recovery: { ok: true, path: "rec.md" } }) });
		type("Mine.");
		await state.flush();
		expect(log.text).toBe("somebody else");
		expect(state.seen).toBe("somebody else");
		expect(log.notices[0].text).toContain("rec.md");
		expect(state.unsaved).toBeNull();
	});

	it("words typed while a commit is in flight stay protected", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const { state, type, log } = make({
			commit: async () => {
				await gate;
				return { status: "written" };
			},
		});
		type("First.");
		const flushing = state.flush();
		await Promise.resolve();
		type("First. And more.");
		release();
		await flushing;
		expect(state.unsaved).toBe("First. And more.");
		await state.rescue();
		expect(log.recovered).toEqual(["First. And more."]);
	});

	it("a value from disk is not shown over the author's typing", () => {
		const { state, log, type } = make();
		type("typing");
		expect(state.showFromDisk("from disk", false)).toBe(false);
		expect(log.text).toBe("typing");
	});
});
