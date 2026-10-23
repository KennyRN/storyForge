import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./theme/index.css";
import { startApp } from "./app";

// The window's only routes to the outside: this app's own commands and events (capabilities/main.json).
void startApp(
	{
		invoke: (cmd, args) => invoke(cmd, args as Record<string, unknown> | undefined),
		listen: (event, handler) => listen(event, (e) => handler(e.payload)),
	},
	document.getElementById("app") as HTMLElement,
);
