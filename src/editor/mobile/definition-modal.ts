import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import { Definition } from "src/core/model";

let defModal: DefinitionModal;

export class DefinitionModal extends Component {
	app: App;
	modal: Modal;

	constructor(app: App) {
		super()
		this.app = app;
		this.modal = new Modal(app);
	}

	open(definition: Definition) {
		this.modal.contentEl.empty();
		this.modal.contentEl.createEl("h1", {
			text: definition.word
		});
		this.modal.contentEl.createEl("i", {
			text: definition.aliases.join(", ")
		});
		const defContent = this.modal.contentEl.createEl("div", {
			attr: {
				ctx: "def-popup"
			}
		});
		MarkdownRenderer.render(this.app, definition.definition, defContent,
			this.app.workspace.getActiveFile()?.path ?? '', this);
		this.modal.open();
	}
}

export function initDefinitionModal(app: App) {
	defModal = new DefinitionModal(app);
	return defModal;
}

export function getDefinitionModal() {
	return defModal;
}
