/**
 * Minimal runtime stand-in for the "obsidian" package, used only under test
 * (see the "obsidian" alias in vitest.config.ts). The real package ships type
 * declarations only — Obsidian's app supplies the actual module at runtime.
 * Extend this as more tests need more of the surface.
 *
 * Constructors take 0 args to match obsidian.d.ts; tests assign `path` afterwards.
 */

/** Enough of the Obsidian UI surface for modules that `extends Modal` / `Plugin` under vitest. */
export class App {}
export class Plugin {
	app: App;
	manifest: Record<string, unknown>;
	constructor(app?: App, manifest?: Record<string, unknown>) {
		this.app = app ?? new App();
		this.manifest = manifest ?? {};
	}
	async loadData(): Promise<unknown> {
		return null;
	}
	async saveData(_data: unknown): Promise<void> {}
	registerView() {}
	registerEvent() {}
	registerEditorExtension() {}
	addCommand() {}
	addSettingTab() {}
	addRibbonIcon() {}
}
export class Modal {
	app: App;
	modalEl: HTMLElement;
	contentEl: HTMLElement;
	titleEl: HTMLElement;
	constructor(app: App) {
		this.app = app;
		this.modalEl = { addClass() {}, removeClass() {} } as unknown as HTMLElement;
		this.contentEl = { empty() {}, addClass() {}, createDiv() { return this; }, createEl() { return this; } } as unknown as HTMLElement;
		this.titleEl = { remove() {}, setText() {} } as unknown as HTMLElement;
	}
	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}
export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}
	refreshDomState(): void {}
	getControlValue(_key: string): unknown {
		return undefined;
	}
	async setControlValue(_key: string, _value: unknown): Promise<void> {}
}
export class Setting {
	setName() { return this; }
	setDesc() { return this; }
	addText() { return this; }
	addToggle() { return this; }
	addDropdown() { return this; }
	addButton() { return this; }
	addSlider() { return this; }
	addExtraButton() { return this; }
	settingEl = { toggleClass() {} };
}
export class SettingGroup {
	setHeading() { return this; }
	addSetting(cb: (s: Setting) => void) { cb(new Setting()); return this; }
}
export class Notice {
	constructor(_message?: string) {}
}
export class WorkspaceLeaf {}
export class TFile {
	path = "";
	name = "";
	extension = "";
	basename = "";
}

export class TFolder {
	path = "";
	name = "";
	children: Array<TFile | TFolder> = [];
}

function applyPath(obj: { path: string; name: string }, path: string): void {
	obj.path = path;
	obj.name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
}

export function makeTFile(path: string): TFile {
	const file = new TFile();
	applyPath(file, path);
	const base = file.name;
	file.extension = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
	file.basename = file.extension ? base.slice(0, -(file.extension.length + 1)) : base;
	return file;
}

export function makeTFolder(path: string): TFolder {
	const folder = new TFolder();
	applyPath(folder, path);
	return folder;
}

// Not real YAML — just a round-trip-consistent stand-in, sufficient for tests
// that only care about the parsed structure, not the on-disk text format.
export function parseYaml(raw: string): unknown {
	return raw ? JSON.parse(raw) : null;
}

export function stringifyYaml(data: unknown): string {
	return JSON.stringify(data);
}

export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}
