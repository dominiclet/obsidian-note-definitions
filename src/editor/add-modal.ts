import { App, DropdownComponent, Modal, Notice, Setting } from "obsidian";
import { getDefFileManager } from "src/core/def-file-manager";
import { DefFileUpdater } from "src/core/def-file-updater";
import { DefFileType } from "src/core/file-type";

export class AddDefinitionModal {
	app: App;
	modal: Modal;
	aliases: string;
	definition: string;
	submitting: boolean;

	fileTypePicker: DropdownComponent;
	defFilePickerSetting: Setting;
	defFilePicker: DropdownComponent;

	atomicFolderPickerSetting: Setting;
	atomicFolderPicker: DropdownComponent;

	constructor(app: App) {
		this.app = app;
		this.modal = new Modal(app);
	}

	open(text?: string) {
		this.submitting = false;
		this.modal.setTitle("Add Definition");
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Word/Phrase",
		});
		const phraseText = this.modal.contentEl.createEl("textarea", {
			cls: "edit-modal-aliases",
			attr: {
				placeholder: "Word/phrase to be defined",
			},
			text: text ?? "",
		});
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Aliases",
		});
		const aliasText = this.modal.contentEl.createEl("textarea", {
			cls: "edit-modal-aliases",
			attr: {
				placeholder: "Add comma-separated aliases here",
			},
		});
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Definition",
		});
		const defText = this.modal.contentEl.createEl("textarea", {
			cls: "edit-modal-textarea",
			attr: {
				placeholder: "Add definition here",
			},
		});

		const defManager = getDefFileManager();
		this.defFilePickerSetting = new Setting(this.modal.contentEl)
			.setName("Definition file")
			.addDropdown((component) => {
				const defFiles = defManager.getConsolidatedDefFiles();
				defFiles.forEach((file) => {
					component.addOption(file.path, file.path);
				});
				if (defFiles.length > 0) {
					component.setValue(defFiles[0].path);
				}
				this.defFilePicker = component;
			});

		this.atomicFolderPickerSetting = new Setting(this.modal.contentEl)
			.setName("Add file to folder")
			.addDropdown((component) => {
				const defFolders = defManager.getDefFolders();
				defFolders.forEach((folder) => {
					component.addOption(folder.path, folder.path + "/");
				});
				if (defFolders.length > 0) {
					component.setValue(defFolders[0].path);
				}
				this.atomicFolderPicker = component;
			});

		new Setting(this.modal.contentEl)
			.setName("Definition file type")
			.addDropdown((component) => {
				const handleDefFileTypeChange = (val: string) => {
					if (val === DefFileType.Consolidated) {
						this.atomicFolderPickerSetting.settingEl.hide();
						this.defFilePickerSetting.settingEl.show();
					} else if (val === DefFileType.Atomic) {
						this.defFilePickerSetting.settingEl.hide();
						this.atomicFolderPickerSetting.settingEl.show();
					}
				};

				component.addOption(DefFileType.Consolidated, "Consolidated");
				component.addOption(DefFileType.Atomic, "Atomic");
				component.setValue(
					window.NoteDefinition.settings.defFileParseConfig
						.defaultFileType,
				);
				component.onChange(handleDefFileTypeChange);
				handleDefFileTypeChange(component.getValue());
				this.fileTypePicker = component;
			});

		const button = this.modal.contentEl.createEl("button", {
			text: "Save",
			cls: "edit-modal-save-button",
		});
		button.addEventListener("click", () => {
			if (this.submitting) {
				return;
			}
			if (!phraseText.value || !defText.value) {
				new Notice("Please fill in a definition value");
				return;
			}

			const fileType = this.fileTypePicker.getValue();
			let selectedPath = "";
			let definitionFile;

			if (fileType === DefFileType.Consolidated) {
				selectedPath = this.defFilePicker.getValue();
				if (!selectedPath) {
					new Notice(
						"Please choose a definition file. If you do not have any definition files, please create one.",
					);
					return;
				}
				const defFileManager = getDefFileManager();
				definitionFile =
					defFileManager.globalDefFiles.get(selectedPath);
			} else if (fileType === DefFileType.Atomic) {
				selectedPath = this.atomicFolderPicker.getValue();
				if (!selectedPath) {
					new Notice(
						"Please choose a folder for the atomic definition.",
					);
					return;
				}
				definitionFile = undefined;
			} else {
				new Notice("Invalid file type selected.");
				return;
			}

			const updated = new DefFileUpdater(this.app);
			updated.addDefinition(
				{
					fileType: fileType as DefFileType,
					key: phraseText.value.toLowerCase(),
					word: phraseText.value,
					aliases: aliasText.value
						? aliasText.value
								.split(",")
								.map((alias) => alias.trim())
						: [],
					definition: defText.value,
					file: definitionFile,
				},
				selectedPath,
			);
			this.modal.close();
		});

		this.modal.open();
	}
}
