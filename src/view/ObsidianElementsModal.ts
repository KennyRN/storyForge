import { App, Modal, Setting, SettingGroup, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import { ICON_EYE_DUOTONE, ICON_SETTINGS_ALT } from "../icons";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { HideUiModal } from "./HideUiModal";
import { makeAccessibleActivatable } from "./a11y";

/**
 * Obsidian chrome + storyForge panel reopen shortcuts. Opened from SeriesModal's formatting
 * tab — used to be that tab's sibling "obsidian elements" settings tab.
 */
export class ObsidianElementsModal extends Modal {
	constructor(
		app: App,
		private plugin: StoryForgePlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-obsidian-elements-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderHoverIcon(setting: Setting, icon: string, label: string, onClick: () => void): void {
		const iconEl = setting.controlEl.createSpan({
			cls: "sf-series-modal-settings-icon",
			attr: { role: "button", tabindex: "0", "aria-label": label },
		});
		setIcon(iconEl, icon);
		iconEl.addEventListener("click", onClick);
		makeAccessibleActivatable(iconEl, onClick);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-obsidian-elements-modal");

		const scroll = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });
		const body = scroll.createDiv({ cls: "sf-text-style-tab-body" });
		const plugin = this.plugin;
		const settings = plugin.getSettings();

		const hideUiGroup = new SettingGroup(body);
		hideUiGroup.addSetting((setting) => {
			setting.setName("hide, or show, obsidian's interface elements");
			this.renderHoverIcon(setting, ICON_EYE_DUOTONE, "Choose which Obsidian UI chrome to hide", () =>
				new HideUiModal(this.app, plugin).open(),
			);
		});
		if (settings.hideObsidianSettingsIcon) {
			hideUiGroup.addSetting((setting) => {
				setting.setName("access obsidian's setting window");
				this.renderHoverIcon(setting, ICON_SETTINGS_ALT, "Open Obsidian's settings window", () =>
					plugin.openObsidianSettings(),
				);
			});
		}

		const obsidianSettingsGroup = new SettingGroup(body);
		obsidianSettingsGroup.addSetting((setting) => {
			setting.setName("hide obsidian's standard settings icon").addToggle((toggle) =>
				toggle.setValue(settings.hideObsidianSettingsIcon).onChange((value) => {
					void plugin.updateSetting("hideObsidianSettingsIcon", value).then(() => plugin.applyVisibilityStyles());
					this.render();
				}),
			);
		});
		obsidianSettingsGroup.addSetting((setting) => {
			setting.setName("hide ribbon and use tools panel").addToggle((toggle) =>
				toggle.setValue(settings.useToolsPanel).onChange(async (value) => {
					await plugin.updateSetting("useToolsPanel", value);
					plugin.applyVisibilityStyles();
					if (value) {
						void plugin.activateToolsView();
					} else {
						this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
					}
					this.render();
				}),
			);
		});
		if (settings.useToolsPanel) {
			obsidianSettingsGroup.addSetting((setting) => {
				setting.setName("hide the tools panel").addToggle((toggle) =>
					toggle.setValue(settings.hideToolsPanelIcon).onChange((value) => {
						void plugin.updateSetting("hideToolsPanelIcon", value).then(() => plugin.applyVisibilityStyles());
					}),
				);
			});
		}

		const reopenPanelsGroup = new SettingGroup(body);
		reopenPanelsGroup.setHeading("reopen closed storyforge panels");
		reopenPanelsGroup.addSetting((setting) => {
			setting
				.setName("storyforge")
				.addButton((btn) => btn.setButtonText("reopen").onClick(() => void plugin.activateView()));
		});
		reopenPanelsGroup.addSetting((setting) => {
			setting
				.setName("storytelling mode")
				.addButton((btn) => btn.setButtonText("reopen").onClick(() => void plugin.activateStorytellingView()));
		});
		reopenPanelsGroup.addSetting((setting) => {
			setting
				.setName("tools panel")
				.addButton((btn) => btn.setButtonText("reopen").onClick(() => void plugin.activateToolsView()));
		});
	}
}
