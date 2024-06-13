import { App, PluginSettingTab, Setting } from "obsidian";
import NoteDefinition from "./main";
import { EditorView } from "@codemirror/view";

export enum PopoverEventSettings {
	Hover = "hover",
	Click = "click"
}

export interface Settings {
	enableInReadingView: boolean;
	defFolder: string;
	popoverEvent: PopoverEventSettings;
}

export const DEFAULT_DEF_FOLDER = "definitions"

export const DEFAULT_SETTINGS: Partial<Settings> = {
	enableInReadingView: true,
	popoverEvent: PopoverEventSettings.Hover
}

export class SettingsTab extends PluginSettingTab {
	plugin: NoteDefinition;
	settings: Settings;

	constructor(app: App, plugin: NoteDefinition) {
		super(app, plugin);
		this.plugin = plugin;
		this.settings = window.NoteDefinition.settings;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable in Reading View")
			.setDesc("Allow defined phrases and definition popovers to be shown in Reading View")
			.addToggle((component) => {
				component.setValue(this.settings.enableInReadingView);
				component.onChange(async (val) => {
					this.settings.enableInReadingView = val;
					await this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName("Definitions folder")
			.setDesc("Files within this folder will be parsed to register definitions (specify relative to root of vault)")
			.addText((component) => {
				component.setValue(this.settings.defFolder);
				component.setPlaceholder(DEFAULT_DEF_FOLDER);
				component.onChange(async value => {
					this.settings.defFolder = value;
					await this.plugin.saveSettings();
					this.plugin.refreshDefinitions();
				});
			});
		new Setting(containerEl)
			.setName("Definition popover display event")
			.setDesc("Choose the trigger event for displaying the definition popover")
			.addDropdown((component) => {
				component.addOption(PopoverEventSettings.Hover, "Hover");
				component.addOption(PopoverEventSettings.Click, "Click");
				component.setValue(this.settings.popoverEvent);
				component.onChange(async value => {
					if (value === PopoverEventSettings.Hover || value === PopoverEventSettings.Click) {
						this.settings.popoverEvent = value;
					}
					await this.plugin.saveSettings();
				});
			});
	}
}

export function getSettings(): Settings {
	return window.NoteDefinition.settings;
}
