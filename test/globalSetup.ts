import { available, buildBridge } from "./helpers/rustBridge";

/**
 * Builds the Rust test bridge once. Without a Rust toolchain the Rust-backed suites skip on a developer's machine, but
 * on CI a missing bridge is a failure on every platform: the safety suites must actually run (Brief 22, ruling 0).
 */
export default function setup(): void {
	let failure: unknown = null;
	try {
		buildBridge();
	} catch (err) {
		failure = err;
	}
	if (available()) return;
	if (process.env.CI) throw new Error(`storyForge: the Rust bridge (sf-bridge) is not built, so the safety suites would be skipped. That fails CI.\n${String(failure ?? "")}`);
	console.warn("storyForge: could not build the Rust bridge, the Tauri backend contract suite will be skipped.\n", failure ?? "");
}
