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

export enum PopoverDisplayMode {
	Full = "full",
	Minimal = "minimal"
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
	displayMode: PopoverDisplayMode;
	showOutboundLinks: boolean;
	hoverDelay: number;
	previewLineLimit: number;
	showQuickActions: boolean;
	showBacklinksCount: boolean;
}

export interface Settings {
	enableDefinitions: boolean;
	enableInReadingView: boolean;
	enableSpellcheck: boolean;
	defFolder: string;
	popoverEvent: PopoverEventSettings;
	defFileParseConfig: DefFileParseConfig;
	defPopoverConfig: DefinitionPopoverConfig;
}

export const VALID_DEFINITION_FILE_TYPES = [ ".md" ]

export const DEFAULT_DEF_FOLDER = "definitions"

export const DEFAULT_SETTINGS: Partial<Settings> = {
	enableDefinitions: true,
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
		displayMode: PopoverDisplayMode.Full,
		showOutboundLinks: true,
		hoverDelay: 200,
		previewLineLimit: 0,
		showQuickActions: false,
		showBacklinksCount: false,
	}
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
			.setName("Enable definitions")
			.setDesc("Master toggle to enable or disable all definition highlighting and popovers")
			.addToggle((component) => {
				component.setValue(this.settings.enableDefinitions);
				component.onChange(async (val) => {
					this.settings.enableDefinitions = val;
					await this.saveCallback();
					this.display();
				});
			});

		if (!this.settings.enableDefinitions) {
			return;
		}

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
			.setName("Popover display mode")
			.setDesc("Full: Show complete definition content. Minimal: Show only the term name with links for quick navigation.")
			.addDropdown((component) => {
				component.addOption(PopoverDisplayMode.Full, "Full");
				component.addOption(PopoverDisplayMode.Minimal, "Minimal");
				component.setValue(this.settings.defPopoverConfig.displayMode ?? PopoverDisplayMode.Full);
				component.onChange(async value => {
					if (value === PopoverDisplayMode.Full || value === PopoverDisplayMode.Minimal) {
						this.settings.defPopoverConfig.displayMode = value;
					}
					await this.saveCallback();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName("Show outbound links in popover")
			.setDesc("Display internal links ([[...]]) found in the definition for quick navigation to related notes")
			.addToggle((component) => {
				component.setValue(this.settings.defPopoverConfig.showOutboundLinks ?? true);
				component.onChange(async (val) => {
					this.settings.defPopoverConfig.showOutboundLinks = val;
					await this.saveCallback();
				});
			});

		if (this.settings.defPopoverConfig.displayMode === PopoverDisplayMode.Full) {
			new Setting(containerEl)
				.setName("Preview line limit")
				.setDesc("Limit definition preview to first N lines (0 = show all). Adds 'Read more...' link when truncated.")
				.addSlider(component => {
					component.setLimits(0, 50, 1);
					component.setValue(this.settings.defPopoverConfig.previewLineLimit ?? 0);
					component.setDynamicTooltip();
					component.onChange(async val => {
						this.settings.defPopoverConfig.previewLineLimit = val;
						await this.saveCallback();
					});
				});
		}

		new Setting(containerEl)
			.setName("Show quick actions")
			.setDesc("Display action buttons (Edit, Open in new pane) in the popover")
			.addToggle((component) => {
				component.setValue(this.settings.defPopoverConfig.showQuickActions ?? false);
				component.onChange(async (val) => {
					this.settings.defPopoverConfig.showQuickActions = val;
					await this.saveCallback();
				});
			});

		new Setting(containerEl)
			.setName("Show backlinks count")
			.setDesc("Display the number of notes that reference this definition")
			.addToggle((component) => {
				component.setValue(this.settings.defPopoverConfig.showBacklinksCount ?? false);
				component.onChange(async (val) => {
					this.settings.defPopoverConfig.showBacklinksCount = val;
					await this.saveCallback();
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

			new Setting(containerEl)
				.setName("Hover delay (ms)")
				.setDesc("Time to wait before showing the popover when hovering over a definition")
				.addSlider(component => {
					component.setLimits(0, 1000, 50);
					component.setValue(this.settings.defPopoverConfig.hoverDelay ?? 200);
					component.setDynamicTooltip();
					component.onChange(async val => {
						this.settings.defPopoverConfig.hoverDelay = val;
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
	}
}

export function getSettings(): Settings {
	return window.NoteDefinition.settings;
}
