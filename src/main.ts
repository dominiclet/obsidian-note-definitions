import { Menu, Plugin } from 'obsidian';
import { injectGlobals } from './globals';
import { logDebug } from './util/log';
import { definitionUnderline } from './editor/underline';
import { getDefinitionDropdown, initDefinitionDropdown } from './editor/definition-dropdown';
import { Extension } from '@codemirror/state';
import { DefManager, initDefFileManager } from './core/def-file-manager';
import { getWordUnderCursor } from './util/editor';
import { Definition } from './core/model';

export default class NoteDefinition extends Plugin {
	activeEditorExtensions: Extension[] = [];
	defManager: DefManager;

	async onload() {
		injectGlobals();
		logDebug("Load note definition plugin");

		this.defManager = initDefFileManager(this.app);

		this.registerCommands();
		this.registerEvents();
		this.registerEditorExtension(this.activeEditorExtensions);
	}

	registerCommands() {
		this.addCommand({
			id: "cursor-lookup",
			name: "Cursor Lookup",
			editorCallback: (editor) => {
				const curWord = getWordUnderCursor(editor);
				if (!curWord) return;
				const def = window.NoteDefinition.definitions.global.get(curWord);
				if (!def) return;
				getDefinitionDropdown().open(def);
			}
		});

		this.addCommand({
			id: "goto-definition",
			name: "Go to definition",
			editorCallback: (editor) => {
				const currWord = getWordUnderCursor(editor);
				if (!currWord) return;
				const def = this.defManager.get(currWord);
				if (!def) return;
				this.app.workspace.openLinkText(def.linkText, '');
			}
		})
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
			const curWord = getWordUnderCursor(editor);
			if (!curWord) return;
			const def = this.defManager.get(curWord);
			if (!def) return;
			this.registerMenuItems(menu, def);
		}));

	}

	registerMenuItems(menu: Menu, def: Definition) {
		menu.addItem((item) => {
			item.setTitle("Preview definition")
				.setIcon("book-open-text")
				.onClick(() => {
					getDefinitionDropdown().open(def);
				});
		});

		menu.addItem((item) => {
			item.setTitle("Go to definition")
				.setIcon("arrow-left-from-line")
				.onClick(() => {
					this.app.workspace.openLinkText(def.linkText, '');
				});
		})
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
