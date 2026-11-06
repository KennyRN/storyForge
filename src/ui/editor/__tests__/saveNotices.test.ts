import { describe, expect, it } from "vitest";
import { noticeForOutsideChange, noticesForSave, readOnlyBanner } from "../saveNotices";

const P = "_story-library/aaa/ch-a1.md";
const revealed: string[] = [];
const ctx = { reveal: (p: string) => void revealed.push(p) };

describe("what the author is told about a save", () => {
	it("a save that works says nothing, and clears earlier trouble with that file", () => {
		const r = noticesForSave({ kind: "saved", path: P }, ctx);
		expect(r.show).toEqual([]);
		expect(r.clear).toEqual([`error:${P}`, `recovery-failed:${P}`]);
	});

	it("a failed session backup is sticky and says the text was saved; mixed line endings are a one-off, not sticky", () => {
		const r = noticesForSave({ kind: "saved", path: P, backup: { ok: false, error: new Error("no space") }, normalizedLineEndings: true }, ctx);
		expect(r.show).toHaveLength(2);
		expect(r.show[0]).toMatchObject({ sticky: true });
		expect(r.show[0].text).toContain("ch-a1");
		expect(r.show[0].text).toContain("Your text was saved");
		expect(r.show[1].sticky).toBeFalsy();
		expect(r.show[1].text).toContain("mixed line endings");
	});

	it("a successful backup says nothing", () => {
		expect(noticesForSave({ kind: "saved", path: P, backup: { ok: true, path: "x.zip" } }, ctx).show).toEqual([]);
	});

	it("a conflict names the file and the recovery path and offers Reveal without dismissing", async () => {
		const rec = "_sf-backup/recovery/aaa/ch-a1 2026-10-23 100000.md";
		const [n] = noticesForSave({ kind: "conflict", path: P, recoveryPath: rec }, ctx).show;
		expect(n.sticky).toBe(true);
		expect(n.text).toContain("ch-a1");
		expect(n.text).toContain(rec);
		await n.actions?.[0].onClick();
		expect(revealed).toEqual([rec]);
		expect(n.actions?.[0].dismiss).toBe(false);
	});

	it("a refusal gives the reason and the recovery path", () => {
		const [n] = noticesForSave({ kind: "refused", path: P, reason: "the chapter is archived", recoveryPath: "r.md" }, ctx).show;
		expect(n.text).toContain("the chapter is archived");
		expect(n.text).toContain("r.md");
		expect(n.sticky).toBe(true);
	});

	it("a disk error says it will retry, or where the text went when it was a flush", () => {
		const retry = noticesForSave({ kind: "error", path: P, error: new Error("EIO") }, ctx).show[0];
		expect(retry.text).toContain("will try again");
		expect(retry.actions).toBeUndefined();
		const flushed = noticesForSave({ kind: "error", path: P, error: new Error("EIO"), recoveryPath: "r.md" }, ctx).show[0];
		expect(flushed.text).toContain("r.md");
	});

	it("recovery failure is pinned: it stays until the text is saved", () => {
		const [n] = noticesForSave({ kind: "recovery-failed", path: P, error: new Error("a"), recoveryError: new Error("b") }, ctx).show;
		expect(n).toMatchObject({ sticky: true, pinned: true, key: `recovery-failed:${P}` });
	});

	it("an outside change over unsaved text names the recovery file", () => {
		const n = noticeForOutsideChange(P, "r.md", ctx);
		expect(n).toMatchObject({ sticky: true });
		expect(n.text).toContain("r.md");
	});

	it("the read-only banners say why, and are notices of their kind", () => {
		expect(readOnlyBanner("the chapter is archived (archived chapters are read-only until un-archived)")).toEqual({ kind: "warning", text: "Archived. Unarchive it to edit." });
		expect(readOnlyBanner("the project is open read-only (it was made by a newer storyForge)")).toEqual({ kind: "warning", text: "This project was made by a newer storyForge. Update the app to edit it." });
		expect(readOnlyBanner("the file is stored in iCloud and has not been downloaded yet")).toEqual({ kind: "information", text: "Downloading from iCloud…" });
		expect(readOnlyBanner("something else")).toEqual({ kind: "warning", text: "Read-only: something else" });
	});
});
