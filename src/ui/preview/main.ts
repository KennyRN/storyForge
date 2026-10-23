import "../theme/index.css";
import { startApp } from "../app";
import { createPreviewHost, type PreviewApi } from "./host";

declare global {
	interface Window {
		__preview: PreviewApi;
		__app: Awaited<ReturnType<typeof startApp>>;
	}
}

const host = createPreviewHost();
window.__preview = host.api;
void startApp(host, document.getElementById("app") as HTMLElement).then((model) => {
	window.__app = model;
	document.documentElement.dataset.ready = "true";
});
