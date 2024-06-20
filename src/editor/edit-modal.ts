import { App, Modal } from "obsidian";
import { DefFileUpdater } from "src/core/def-file-updater";
import { Definition } from "src/core/model";


export class EditDefinitionModal {
	app: App;
	modal: Modal;
	aliases: string;
	definition: string;
	submitting: boolean;

	constructor(app: App) {
		this.app = app;
		this.modal = new Modal(app);
	}

	open(def: Definition) {
		this.submitting = false;
		this.modal.setTitle(`Edit definition for '${def.word}'`);
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Aliases"
		})
		const aliasText = this.modal.contentEl.createEl("textarea", {
			cls: 'edit-modal-aliases',
			attr: {
				placeholder: "Add comma-separated aliases here"
			},
			text: def.aliases.join(", ")
		});
		this.modal.contentEl.createDiv({
			cls: "edit-modal-section-header",
			text: "Definition"
		})
		const defText = this.modal.contentEl.createEl("textarea", {
			cls: 'edit-modal-textarea',
			attr: {
				placeholder: "Add definition here"
			},
			text: def.definition
		})
		const button = this.modal.contentEl.createEl("button", {
			text: "Save",
			cls: 'edit-modal-save-button',
		});
		button.addEventListener('click', () => {
			if (this.submitting) {
				return;
			}
			const updater = new DefFileUpdater(this.app);
			updater.updateDefinition({
				...def,
				aliases: aliasText.value ? aliasText.value.split(",").map(alias => alias.trim()) : [],
				definition: defText.value
			});
			this.modal.close();
		});

		this.modal.open();
	}
}
