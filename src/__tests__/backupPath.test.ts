import { describe, expect, it } from "vitest";
import { isPathInsideVault } from "../backup";

describe("isPathInsideVault", () => {
	it("treats the vault root itself as inside", () => {
		expect(isPathInsideVault("/home/ubuntu/vault", "/home/ubuntu/vault")).toBe(true);
	});

	it("treats a nested folder as inside", () => {
		expect(isPathInsideVault("/home/ubuntu/vault", "/home/ubuntu/vault/backups")).toBe(true);
	});

	it("does not treat a sibling prefix path as inside (classic startsWith bug)", () => {
		expect(isPathInsideVault("/home/ubuntu/vault", "/home/ubuntu/vault-backups")).toBe(false);
		expect(isPathInsideVault("/home/ubuntu/vault", "/home/ubuntu/vault2")).toBe(false);
		expect(isPathInsideVault("/data/v", "/data/vault")).toBe(false);
	});

	it("resolves .. before comparing", () => {
		expect(isPathInsideVault("/home/ubuntu/vault", "/home/ubuntu/vault/../vault-evil")).toBe(false);
		expect(isPathInsideVault("/home/ubuntu/vault", "/home/ubuntu/vault/sub/../backups")).toBe(true);
	});
});
