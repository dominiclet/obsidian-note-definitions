import { App, Modal, Plugin } from 'obsidian';
import { FileParser } from './file-parser';
import { Definition } from './model';


export default class NoteDefinition extends Plugin {
	definitionCache: Map<string, Definition>;

	async onload() {
		this.definitionCache = new Map<string, Definition>();
		const file = this.app.vault.getFileByPath("definitions/Definition.md")
		if (file) {
			let parser = new FileParser(this.app, file);
			parser.parseFile().then(defs => {
				defs.forEach(def => {
					this.definitionCache.set(def.key, def);
				});
			});
		}

		this.addCommand({
			id: "cursor-lookup",
			name: "Cursor Lookup",
			editorCallback: (editor) => {
				const curWordRange = editor.wordAt(editor.getCursor());
				if (!curWordRange) return;
				let curWord = editor.getRange(curWordRange.from, curWordRange.to);
				curWord = curWord.trimStart().trimEnd().toLowerCase();
				new DefinitionModal(this.app, curWord, this.definitionCache.get(curWord)).open();
			}
		});

		// For testing purposes
		this.addCommand({
			id: "print-cache",
			name: "Print cache",
			callback: () => {
			}
		});
	}

	onunload() {

	}
}

class DefinitionModal extends Modal {
	word: string;
	definition?: Definition;

	constructor(app: App, word: string, definition?: Definition) {
		super(app);
		this.word = word;
		this.definition = definition;
	}

	onOpen() {
		const { contentEl } = this;
		if (!this.definition) {
			contentEl.setText(`No definition for ${this.word} found`);
			return
		}
		contentEl.createEl("h2", { text: this.definition.word });
		if (this.definition.fullName != "") {
			contentEl.createEl("i", { text: this.definition.fullName });
		}
		contentEl.createEl("p", { text: this.definition.definition });
	}

	onClose() {
		this.contentEl.empty();
	}
}
