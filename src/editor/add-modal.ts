import { App, DropdownComponent, Modal, Notice, Setting } from "obsidian";
import { getDefFileManager } from "src/core/def-file-manager";
import { DefFileUpdater } from "src/core/def-file-updater";


export class AddDefinitionModal {
	app: App;
	modal: Modal;
	aliases: string;
	definition: string;
	submitting: boolean;

	constructor(app: App) {
		this.app = app;
		this.modal = new Modal(app);
	}

	open(text?: string) {
		this.submitting = false;
		this.modal.setTitle("Add Definition");
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Word/Phrase"
		})
		const phraseText = this.modal.contentEl.createEl("textarea", {
			cls: 'edit-modal-aliases',
			attr: {
				placeholder: "Word/phrase to be defined"
			},
			text: text ?? ''
		});
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Aliases"
		})
		const aliasText = this.modal.contentEl.createEl("textarea", {
			cls: 'edit-modal-aliases',
			attr: {
				placeholder: "Add comma-separated aliases here"
			},
		});
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Definition"
		});
		const defText = this.modal.contentEl.createEl("textarea", {
			cls: 'edit-modal-textarea',
			attr: {
				placeholder: "Add definition here"
			},
		});

		const defManager = getDefFileManager();
		let defFileSettings: DropdownComponent;
		new Setting(this.modal.contentEl)
			.setName("Definition file")
			.addDropdown(component => {
				const defFiles = defManager.globalDefFiles;
				[...defFiles.keys()].forEach(file => {
					component.addOption(file, file);
				});
				defFileSettings = component;
			});

		const button = this.modal.contentEl.createEl("button", {
			text: "Save",
			cls: 'edit-modal-save-button',
		});
		button.addEventListener('click', () => {
			if (this.submitting) {
				return;
			}
			if (!phraseText.value || !defText.value) {
				new Notice("Please fill in a definition value");
				return;
			}
			if (!defFileSettings.getValue()) {
				new Notice("Please choose a definition file. If you do not have any definition files, please create one.")
				return;
			}
			const defFileManager = getDefFileManager();
			const definitionFile = defFileManager.globalDefFiles.get(defFileSettings.getValue());
			const updated = new DefFileUpdater(this.app);
			updated.addDefinition({
				key: phraseText.value,
				word: phraseText.value,
				aliases: aliasText.value? aliasText.value.split(",").map(alias => alias.trim()) : [],
				definition: defText.value,
				file: definitionFile,
			});
			this.modal.close();
		});

		this.modal.open();
	}
}
