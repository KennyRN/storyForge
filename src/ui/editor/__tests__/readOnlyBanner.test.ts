import { describe, expect, it } from "vitest";
import { readOnlyBanner } from "../saveNotices";

// The banner above a read-only editor is a notice of its kind (decision 122, round five).
describe("the read-only banner's kinds", () => {
	it("the newer-format, archived and read-only states are warnings; the iCloud download is information", () => {
		expect(readOnlyBanner("This project was made by a newer storyForge")).toMatchObject({ kind: "warning", text: expect.stringContaining("made by a newer storyForge") });
		expect(readOnlyBanner("archived")).toEqual({ kind: "warning", text: "Archived. Unarchive it to edit." });
		expect(readOnlyBanner("the project is read-only")).toEqual({ kind: "warning", text: "Read-only: the project is read-only" });
		expect(readOnlyBanner("iCloud")).toEqual({ kind: "information", text: "Downloading from iCloud…" });
	});
});
