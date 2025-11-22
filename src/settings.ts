import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, setTooltip } from "obsidian";
import { DefFileType } from "./core/file-type";

export enum PopoverEventSettings {
	Hover = "hover",
	Click = "click"
}

export enum PopoverDismissType {
	Click = "click",
	MouseExit = "mouse_exit"
}

export interface DividerSettings {
	dash: boolean;
	underscore: boolean;
}

export interface DefFileParseConfig {
	defaultFileType: DefFileType;
	divider: DividerSettings;
	autoPlurals: boolean;
}

export interface DefinitionPopoverConfig {
	displayAliases: boolean;
	displayDefFileName: boolean;
	enableCustomSize: boolean;
	maxWidth: number;
	maxHeight: number;
	popoverDismissEvent: PopoverDismissType;
	enableDefinitionLink: boolean;
	backgroundColour?: string;
}

export interface FirstOccurrenceInfo {
	file: string;
	position: number;
}

export interface Settings {
	enableInReadingView: boolean;
	enableSpellcheck: boolean;
	defFolder: string;
	popoverEvent: PopoverEventSettings;
	defFileParseConfig: DefFileParseConfig;
	defPopoverConfig: DefinitionPopoverConfig;
	knownWords: string[];
	firstOccurrenceTracking: Record<string, FirstOccurrenceInfo>;
}

export const VALID_DEFINITION_FILE_TYPES = [ ".md" ]

export const DEFAULT_DEF_FOLDER = "definitions"

export const DEFAULT_SETTINGS: Partial<Settings> = {
	enableInReadingView: true,
	enableSpellcheck: true,
	popoverEvent: PopoverEventSettings.Hover,
	defFileParseConfig: {
		defaultFileType: DefFileType.Consolidated,
		divider: {
			dash: true,
			underscore: false
		},
		autoPlurals: false
	},
	defPopoverConfig: {
		displayAliases: true,
		displayDefFileName: false,
		enableCustomSize: false,
		maxWidth: 150,
		maxHeight: 150,
		popoverDismissEvent: PopoverDismissType.Click,
		enableDefinitionLink: false,
	},
	knownWords: [],
	firstOccurrenceTracking: {}
}

export class SettingsTab extends PluginSettingTab {
	plugin: Plugin;
	settings: Settings;
	saveCallback: () => Promise<void>;

	constructor(app: App, plugin: Plugin, saveCallback: () => Promise<void>) {
		super(app, plugin);
		this.plugin = plugin;
		this.settings = window.NoteDefinition.settings;
		this.saveCallback = saveCallback;
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
					await this.saveCallback();
				});
			});
		new Setting(containerEl)
			.setName("Enable spellcheck for defined words")
			.setDesc("Allow defined words and phrases to be spellchecked")
			.addToggle((component) => {
				component.setValue(this.settings.enableSpellcheck);
				component.onChange(async (val) => {
					this.settings.enableSpellcheck = val;
					await this.saveCallback();
				});
			});

		new Setting(containerEl)
			.setName("Definitions folder")
			.setDesc("Files within this folder will be parsed to register definitions")
			.addText((component) => {
				component.setValue(this.settings.defFolder);
				component.setPlaceholder(DEFAULT_DEF_FOLDER);
				component.setDisabled(true)
				setTooltip(component.inputEl,
					"In the file explorer, right-click on the desired folder and click on 'Set definition folder' to change the definition folder",
					{
						delay: 100
					});
			});

		new Setting(containerEl)
			.setName("Definition file format settings")
			.setDesc("Customise parsing rules for definition files")
			.addExtraButton(component => {
				component.onClick(() => {
					const modal = new Modal(this.app);
					modal.setTitle("Definition file format settings")
					new Setting(modal.contentEl)
						.setName("Divider")
						.setHeading()
					new Setting(modal.contentEl)
						.setName("Dash")
						.setDesc("Use triple dash (---) as divider")
						.addToggle((component) => {
							component.setValue(this.settings.defFileParseConfig.divider.dash);
							component.onChange(async value => {
								if (!value && !this.settings.defFileParseConfig.divider.underscore) {
									new Notice("At least one divider must be chosen", 2000);
									component.setValue(this.settings.defFileParseConfig.divider.dash);
									return;
								}
								this.settings.defFileParseConfig.divider.dash = value;
								await this.saveCallback();
							});
						});
					new Setting(modal.contentEl)
						.setName("Underscore")
						.setDesc("Use triple underscore (___) as divider")
						.addToggle((component) => {
							component.setValue(this.settings.defFileParseConfig.divider.underscore);
							component.onChange(async value => {
								if (!value && !this.settings.defFileParseConfig.divider.dash) {
									new Notice("At least one divider must be chosen", 2000);
									component.setValue(this.settings.defFileParseConfig.divider.underscore);
									return;
								}
								this.settings.defFileParseConfig.divider.underscore = value;
								await this.saveCallback();
							});
						});
					modal.open();
				})
			});

		new Setting(containerEl)
			.setName("Default definition file type")
			.setDesc("When the 'def-type' frontmatter is not specified, the definition file will be treated as this configured default file type.")
			.addDropdown(component => {
				component.addOption(DefFileType.Consolidated, "consolidated");
				component.addOption(DefFileType.Atomic, "atomic");
				component.setValue(this.settings.defFileParseConfig.defaultFileType ?? DefFileType.Consolidated);
				component.onChange(async val => {
					this.settings.defFileParseConfig.defaultFileType = val as DefFileType;
					await this.saveCallback();
				});
			});

		new Setting(containerEl)
			.setName("Automatically detect plurals -- English only")
			.setDesc("Attempt to automatically generate aliases for words using English pluralisation rules")
			.addToggle((component) => {
				component.setValue(this.settings.defFileParseConfig.autoPlurals);
				component.onChange(async (val) => {
					this.settings.defFileParseConfig.autoPlurals = val;
					await this.saveCallback();
				});
			});

		new Setting(containerEl)
			.setHeading()
			.setName("Definition Popover Settings");

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
					if (this.settings.popoverEvent === PopoverEventSettings.Click) {
						this.settings.defPopoverConfig.popoverDismissEvent = PopoverDismissType.Click;
					}
					await this.saveCallback();
					this.display();
				});
			});

		if (this.settings.popoverEvent === PopoverEventSettings.Hover) {
			new Setting(containerEl)
				.setName("Definition popover dismiss event")
				.setDesc("Configure the manner in which you would like to close/dismiss the definition popover.")
				.addDropdown(component => {
					component.addOption(PopoverDismissType.Click, "Click");
					component.addOption(PopoverDismissType.MouseExit, "Mouse exit")
					if (!this.settings.defPopoverConfig.popoverDismissEvent) {
						this.settings.defPopoverConfig.popoverDismissEvent = PopoverDismissType.Click;
						this.saveCallback();
					}
					component.setValue(this.settings.defPopoverConfig.popoverDismissEvent);
					component.onChange(async value => {
						if (value === PopoverDismissType.MouseExit || value === PopoverDismissType.Click) {
							this.settings.defPopoverConfig.popoverDismissEvent = value;
						}
						await this.saveCallback();
					});
				});
		}

		new Setting(containerEl)
			.setName("Display aliases")
			.setDesc("Display the list of aliases configured for the definition")
			.addToggle(component => {
				component.setValue(this.settings.defPopoverConfig.displayAliases);
				component.onChange(async value => {
					this.settings.defPopoverConfig.displayAliases = value;
					await this.saveCallback();
				});
			});


		new Setting(containerEl)
			.setName("Display definition source file")
			.setDesc("Display the title of the definition's source file")
			.addToggle(component => {
				component.setValue(this.settings.defPopoverConfig.displayDefFileName);
				component.onChange(async value => {
					this.settings.defPopoverConfig.displayDefFileName = value;
					await this.saveCallback();
				});
			});

		new Setting(containerEl)
			.setName("Custom popover size")
			.setDesc("Customise the maximum popover size. This is not recommended as it prevents dynamic sizing of the popover based on your viewport.")
			.addToggle(component => {
				component.setValue(this.settings.defPopoverConfig.enableCustomSize);
				component.onChange(async value => {
					this.settings.defPopoverConfig.enableCustomSize = value;
					await this.saveCallback();
					this.display();
				});
			});

		if (this.settings.defPopoverConfig.enableCustomSize) {
			new Setting(containerEl)
				.setName("Popover width (px)")
				.setDesc("Maximum width of the definition popover")
				.addSlider(component => {
					component.setLimits(150, window.innerWidth, 1);
					component.setValue(this.settings.defPopoverConfig.maxWidth);
					component.setDynamicTooltip()
					component.onChange(async val => {
						this.settings.defPopoverConfig.maxWidth = val;
						await this.saveCallback();
					});
				});

			new Setting(containerEl)
				.setName("Popover height (px)")
				.setDesc("Maximum height of the definition popover")
				.addSlider(component => {
					component.setLimits(150, window.innerHeight, 1);
					component.setValue(this.settings.defPopoverConfig.maxHeight);
					component.setDynamicTooltip();
					component.onChange(async val => {
						this.settings.defPopoverConfig.maxHeight = val;
						await this.saveCallback();
					});
				});
		}

		new Setting(containerEl)
			.setName("Enable definition links")
			.setDesc("Definitions within popovers will be marked and can be clicked to go to definition.")
			.addToggle(component => {
				component.setValue(this.settings.defPopoverConfig.enableDefinitionLink);
				component.onChange(async val => {
					this.settings.defPopoverConfig.enableDefinitionLink = val;
					await this.saveCallback();
				});
			});

		new Setting(containerEl)
			.setName("Background colour")
			.setDesc("Customise the background colour of the definition popover")
			.addExtraButton(component => {
				component.setIcon("rotate-ccw");
				component.setTooltip("Reset to default colour set by theme");
				component.onClick(async () => {
					this.settings.defPopoverConfig.backgroundColour = undefined;
					await this.saveCallback();
					this.display();
				});
			})
			.addColorPicker(component => {
				if (this.settings.defPopoverConfig.backgroundColour) {
					component.setValue(this.settings.defPopoverConfig.backgroundColour);
				}
				component.onChange(async val => {
					this.settings.defPopoverConfig.backgroundColour = val;
					await this.saveCallback();
				})
			});

		new Setting(containerEl)
			.setHeading()
			.setName("Known Words");

		new Setting(containerEl)
			.setName("Manage known words")
			.setDesc("Words you've marked as 'known' will not be highlighted. Right-click on any highlighted word to mark it as known or unknown.")
			.addExtraButton(component => {
				component.setIcon("list");
				component.setTooltip("View and manage known words");
				component.onClick(() => {
					const modal = new Modal(this.app);
					modal.setTitle("Known Words");

					const description = modal.contentEl.createEl("p", {
						text: "These words have been marked as known and will not be highlighted. Click the X to remove a word from this list."
					});
					description.style.marginBottom = "1em";

					if (this.settings.knownWords.length === 0) {
						modal.contentEl.createEl("p", {
							text: "No known words yet. Right-click on any highlighted word in your notes to mark it as known.",
							cls: "mod-muted"
						});
					} else {
						const listContainer = modal.contentEl.createDiv({ cls: "known-words-list" });
						listContainer.style.maxHeight = "400px";
						listContainer.style.overflowY = "auto";
						listContainer.style.border = "1px solid var(--background-modifier-border)";
						listContainer.style.borderRadius = "4px";
						listContainer.style.padding = "0.5em";

						this.settings.knownWords.forEach((word, index) => {
							const wordItem = listContainer.createDiv({ cls: "known-word-item" });
							wordItem.style.display = "flex";
							wordItem.style.justifyContent = "space-between";
							wordItem.style.alignItems = "center";
							wordItem.style.padding = "0.25em 0.5em";
							wordItem.style.marginBottom = "0.25em";
							wordItem.style.borderRadius = "4px";
							wordItem.style.backgroundColor = "var(--background-secondary)";

							const wordText = wordItem.createSpan({ text: word });
							wordText.style.flex = "1";

							const removeBtn = wordItem.createEl("button", { text: "×" });
							removeBtn.style.cursor = "pointer";
							removeBtn.style.padding = "0 0.5em";
							removeBtn.style.fontSize = "1.5em";
							removeBtn.style.border = "none";
							removeBtn.style.background = "transparent";
							removeBtn.style.color = "var(--text-muted)";
							removeBtn.addEventListener("click", async () => {
								this.settings.knownWords.splice(index, 1);
								await this.saveCallback();
								wordItem.remove();
								new Notice("Word removed from known words list");
							});
						});

						const clearAllBtn = modal.contentEl.createEl("button", { text: "Clear all known words" });
						clearAllBtn.style.marginTop = "1em";
						clearAllBtn.style.width = "100%";
						clearAllBtn.addEventListener("click", async () => {
							this.settings.knownWords = [];
							await this.saveCallback();
							modal.close();
							new Notice("All known words cleared");
						});
					}

					modal.open();
				});
			});

		new Setting(containerEl)
			.setName("First occurrence tracking")
			.setDesc("When a word's definition file has 'display-mode: first-only' in its frontmatter, the word will only be highlighted on its first occurrence in your vault. Note: If you read documents out of order, the first occurrence may not be where you expect. You can mark words as 'known' to hide them completely.");
	}
}

export function getSettings(): Settings {
	return window.NoteDefinition.settings;
}
