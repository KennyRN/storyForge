import { available, buildBridge } from "./helpers/rustBridge";

/** Builds the Rust test bridge once, if there is a Rust toolchain. Without one, the Rust-backed suites skip. */
export default function setup(): void {
	try {
		buildBridge();
	} catch (err) {
		console.warn("storyForge: could not build the Rust bridge, the Tauri backend contract suite will be skipped.\n", err);
	}
	void available;
}
