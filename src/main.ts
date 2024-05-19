import { Plugin } from 'obsidian';
import { FileParser } from './core/file-parser';
import { injectGlobals } from './globals';
import { logDebug } from './util/log';
import { definitionUnderline } from './editor/underline';
import { getDefinitionDropdown, initDefinitionDropdown } from './editor/definition-dropdown';
import { Extension } from '@codemirror/state';
import { DefManager, initDefFileManager } from './core/def-file-manager';

export default class NoteDefinition extends Plugin {
	activeEditorExtensions: Extension[] = [];
	defManager: DefManager;

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

		this.defManager = initDefFileManager(this.app);

		this.registerEvents();

		this.registerEditorExtension(this.activeEditorExtensions);
	}

	registerEvents() {
		this.registerEvent(this.app.workspace.on("active-leaf-change", async (leaf) => {
			if (!leaf) return;
			const currFile = this.app.workspace.getActiveFile();
			if (currFile && this.defManager.isDefFile(currFile)) {
				// TODO: Editor extension for definition file
				this.setActiveEditorExtensions([]);
			} else {
				this.setActiveEditorExtensions(definitionUnderline);
			}
			initDefinitionDropdown(this);
			this.defManager.loadDefinitions();
		}));

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

	setActiveEditorExtensions(...ext: Extension[]) {
		this.activeEditorExtensions.length = 0;
		this.activeEditorExtensions.push(...ext);
		this.app.workspace.updateOptions();
	}

	onunload() {
		logDebug("Unload note definition plugin");
		getDefinitionDropdown().cleanUp();
	}
}
