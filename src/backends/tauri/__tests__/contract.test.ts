import { describeBackendContract } from "../../../../test/backendContract";
import { RustBridge, available } from "../../../../test/helpers/rustBridge";
import { TauriBackend } from "../index";

// The Tauri backend, over the real Rust file-system code (src-tauri/fs, through sf-bridge).
describeBackendContract(
	"tauri (Rust)",
	async (root) => {
		const bridge = await RustBridge.open(root);
		return { backend: new TauriBackend(bridge.invoke), close: () => bridge.close() };
	},
	{ skip: !available() },
);
