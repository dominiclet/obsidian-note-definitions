import { Plugin } from 'obsidian';
import { FileParser } from './core/file-parser';
import { injectGlobals } from './globals';
import { logDebug } from './util/log';
import { definitionUnderline } from './editor/underline';
import { getDefinitionDropdown, initDefinitionDropdown } from './editor/definition-dropdown';

export default class NoteDefinition extends Plugin {

	async onload() {
		injectGlobals();

		logDebug("Load note definition plugin");

		this.addCommand({
			id: "cursor-lookup",
			name: "Cursor Lookup",
			editorCallback: (editor) => {
				const curWordRange = editor.wordAt(editor.getCursor());
				if (!curWordRange) return;
				let curWord = editor.getRange(curWordRange.from, curWordRange.to);
				curWord = curWord.trimStart().trimEnd().toLowerCase();
				// new DefinitionModal(this.app, curWord, window.NoteDefinition.definitions.global.get(curWord)).open();

				const def = window.NoteDefinition.definitions.global.get(curWord);
				if (!def) return;
				getDefinitionDropdown().open(def);
			}
		});

		this.initEvents();

		this.registerEditorExtension(definitionUnderline);
	}

	initEvents() {
		this.app.workspace.on("active-leaf-change", async (leaf) => {
			if (!leaf) return;
			initDefinitionDropdown(this);
			this.loadDefinitions();
		});

		// Add editor menu option to preview definition
		this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
			const curWordRange = editor?.wordAt(editor.getCursor());
			if (!curWordRange) return
			let curWord = editor?.getRange(curWordRange.from, curWordRange.to);
			curWord = curWord?.trimStart().trimEnd().toLowerCase();
			if (!curWord) return;
			const def = window.NoteDefinition.definitions.global.get(curWord);
			if (!def) return;

			menu.addItem((item) => {
				item.setTitle("Preview definition")
					.setIcon("book-open-text")
					.onClick(() => {
						getDefinitionDropdown().open(def);
					});
			})
		}));

	}

	loadDefinitions() {
		const file = this.app.vault.getFileByPath("definitions/Definition.md")
		if (file) {
			let parser = new FileParser(this.app, file);
			parser.parseFile().then(defs => {
				defs.forEach(def => {
					window.NoteDefinition.definitions.global.set(def.key, def);
				});
			});
		}
	}

	onunload() {
		logDebug("Unload note definition plugin");
		getDefinitionDropdown().cleanUp();
	}
}
