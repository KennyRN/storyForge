import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./theme/index.css";
import { startApp } from "./app";

// Decision 56: the fallback candidates, in a local H2 build only (VITE_SF_FONT_CANDIDATES=1); compiled out of every other build.
if (import.meta.env.VITE_SF_FONT_CANDIDATES === "1") void import("./dev/fontCandidates").then((m) => m.mountFontCandidates());

// The window's only routes to the outside: this app's own commands and events (capabilities/main.json).
void startApp(
	{
		invoke: (cmd, args) => invoke(cmd, args as Record<string, unknown> | undefined),
		listen: (event, handler) => listen(event, (e) => handler(e.payload)),
	},
	document.getElementById("app") as HTMLElement,
);
