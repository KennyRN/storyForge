import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { Project } from "../project";
import { SESSIONS_FOLDER, appendSession, fromStored, readSessions, sessionFilePath, toStored } from "../sessionFiles";
import type { SessionRecord } from "../sessions";

afterEach(cleanupFixtures);

const rec = (day: string, hhmm: string, net = 100, over: Partial<SessionRecord> = {}): SessionRecord => {
	const [h, m] = hhmm.split(":");
	const start = `${day}T${h}:${m}:00+00:00`;
	return { id: start.replace(/[-:]/g, "").replace("+0000", "+0000"), start, end: `${day}T${h}:${String(Number(m) + 20).padStart(2, "0")}:00+00:00`, day, net, chapters: [{ path: "aaa/ch-a1.md", id: "c-a1k3", net }], unreliable: false, recovered: false, ...over };
};

async function open() {
	const root = copyFixture("series");
	const project = await Project.open(new NodeFsBackend(root));
	return { root, project, rd: (rel: string) => fs.readFileSync(path.join(root, rel), "utf8") };
}

describe("session files", () => {
	it("a session is written to its own file and nothing else changes, wordcount.md included", async () => {
		const { root, project } = await open();
		const before = snapshot(root);
		const written = await appendSession(project, rec("2026-10-25", "09:00"), "k7x2q9ab");
		expect(written).toEqual({ path: "_backstage/storyforge/sessions/2026-10-k7x2q9ab.md", sibling: false });
		const diff = diffSnapshots(before, snapshot(root));
		expect(diff.added).toEqual([`${SESSIONS_FOLDER}/`, written.path]); // the new folder, and its one file
		expect(diff.changed).toEqual([]);
		expect(diff.removed).toEqual([]);
		const read = readSessions(project);
		expect(read.sessions).toHaveLength(1);
		expect(read.sessions[0]).toMatchObject({ day: "2026-10-25", net: 100, unreliable: false, recovered: false });
		expect(read.sessions[0].chapters).toEqual([{ path: "aaa/ch-a1.md", id: "c-a1k3", net: 100 }]);
	});

	it("is readable text with the format, the computer and a plain note", async () => {
		const { project, rd } = await open();
		await appendSession(project, rec("2026-10-25", "09:00"), "k7x2q9ab");
		const text = rd(sessionFilePath("k7x2q9ab", "2026-10-25"));
		expect(text).toMatch(/^---\nsessions-format: 1\ncomputer: k7x2q9ab\nsessions:\n {2}- id: /);
		expect(text).toContain("Writing sessions recorded by storyForge");
	});

	it("one file per month per computer: the same month appends, another month or computer is another file", async () => {
		const { root, project } = await open();
		await appendSession(project, rec("2026-10-25", "09:00"), "aaaa1111");
		await appendSession(project, rec("2026-10-26", "10:00"), "aaaa1111");
		await appendSession(project, rec("2026-11-01", "10:00"), "aaaa1111");
		await appendSession(project, rec("2026-10-27", "08:00"), "bbbb2222");
		expect(fs.readdirSync(path.join(root, SESSIONS_FOLDER)).sort()).toEqual(["2026-10-aaaa1111.md", "2026-10-bbbb2222.md", "2026-11-aaaa1111.md"]);
		const read = readSessions(project);
		expect(read.sessions.map((s) => s.day)).toEqual(["2026-10-25", "2026-10-26", "2026-10-27", "2026-11-01"]); // every computer, in order of start
	});

	it("the same session written twice is stored once", async () => {
		const { project } = await open();
		const r = rec("2026-10-25", "09:00");
		await appendSession(project, r, "aaaa1111");
		await appendSession(project, r, "aaaa1111");
		expect(readSessions(project).sessions).toHaveLength(1);
	});

	it("an unreadable file is left byte-identical, the session goes to a sibling, and the reader says so", async () => {
		const { root, project, rd } = await open();
		fs.mkdirSync(path.join(root, SESSIONS_FOLDER), { recursive: true });
		const bad = "---\nsessions: &a []\nlater: *a\n---\nanchors can't be rewritten minimally\n";
		const badPath = sessionFilePath("aaaa1111", "2026-10-25");
		fs.writeFileSync(path.join(root, badPath), bad);
		const reopened = await Project.open(new NodeFsBackend(root));
		const written = await appendSession(reopened, rec("2026-10-25", "09:00"), "aaaa1111");
		expect(written).toEqual({ path: "_backstage/storyforge/sessions/2026-10-aaaa1111-2.md", sibling: true });
		expect(rd(badPath)).toBe(bad);
		const read = readSessions(reopened);
		expect(read.sessions).toHaveLength(1);
		expect(read.unreadable).toEqual([badPath]);
	});

	it("keys the app doesn't understand survive an append, in the file and in earlier entries", async () => {
		const { root, project, rd } = await open();
		fs.mkdirSync(path.join(root, SESSIONS_FOLDER), { recursive: true });
		const file = sessionFilePath("aaaa1111", "2026-10-25");
		fs.writeFileSync(
			path.join(root, file),
			"---\nsessions-format: 1\ncomputer: aaaa1111\nfuture-key: {a: 1}\nsessions:\n  - id: old\n    start: 2026-10-24T09:00:00+00:00\n    end: 2026-10-24T09:20:00+00:00\n    day: 2026-10-24\n    net: 5\n    chapters: []\n    unreliable: false\n    recovered: false\n    mood: calm\n---\nnote\n",
		);
		const reopened = await Project.open(new NodeFsBackend(root));
		await appendSession(reopened, rec("2026-10-25", "09:00"), "aaaa1111");
		const text = rd(file);
		expect(text).toContain("future-key:");
		expect(text).toContain("mood: calm");
		expect(readSessions(reopened).sessions.map((s) => s.id)).toHaveLength(2);
		expect(readSessions(reopened).sessions[0].extra).toEqual({ mood: "calm" });
	});

	it("a session that crossed midnight keeps its per-day split", async () => {
		const { project } = await open();
		const r = rec("2026-06-10", "23:30", 47, { chapters: [{ path: "aaa/ch-a1.md", net: 47, byDay: { "2026-06-10": 40, "2026-06-11": 7 } }] });
		await appendSession(project, r, "aaaa1111");
		expect(readSessions(project).sessions[0].chapters[0].byDay).toEqual({ "2026-06-10": 40, "2026-06-11": 7 });
	});

	it("entries that aren't sessions are skipped, and the rest of the file still reads", () => {
		expect(fromStored({ id: 1 })).toBeNull();
		expect(fromStored("text")).toBeNull();
		expect(fromStored({ id: "x", start: "yesterday", end: "later", day: "2026-10-25", net: 1, chapters: [] })).toBeNull();
		const good = rec("2026-10-25", "09:00");
		expect(fromStored(toStored(good))).toEqual(good);
	});

	it("opening a project and reading sessions writes nothing", async () => {
		const { root, project } = await open();
		await appendSession(project, rec("2026-10-25", "09:00"), "aaaa1111");
		const before = snapshot(root);
		const reopened = await Project.open(new NodeFsBackend(root));
		readSessions(reopened);
		const diff = diffSnapshots(before, snapshot(root));
		expect([diff.added, diff.changed, diff.removed]).toEqual([[], [], []]);
	});
});
