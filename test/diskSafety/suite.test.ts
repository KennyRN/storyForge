import { afterEach, describe, it } from "vitest";
import { checkOperation } from "../helpers/diskSafety";
import { cleanupFixtures } from "../helpers/fixtures";
import { OPS } from "./ops";

afterEach(cleanupFixtures);

describe("disk safety: every mutating data-layer operation on the series fixture", () => {
	it.each(OPS.map((op) => [op.name, op] as const))("%s", async (_name, op) => {
		await checkOperation(op);
	});
});
