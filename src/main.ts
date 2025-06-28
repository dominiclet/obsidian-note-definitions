import { Menu, Notice, Plugin, TFolder, WorkspaceWindow, TFile, MarkdownView } from 'obsidian';
import { injectGlobals } from './globals';
import { logDebug } from './util/log';
import { definitionMarker } from './editor/decoration';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DefManager, initDefFileManager } from './core/def-file-manager';
import { Definition } from './core/model';
import { getDefinitionPopover, initDefinitionPopover } from './editor/definition-popover';
import { postProcessor } from './editor/md-postprocessor';
import { DEFAULT_SETTINGS, getSettings, SettingsTab } from './settings';
import { getMarkedWordUnderCursor } from './util/editor';
import { FileExplorerDecoration, initFileExplorerDecoration } from './ui/file-explorer';
import { EditDefinitionModal } from './editor/edit-modal';
import { AddDefinitionModal } from './editor/add-modal';
import { initDefinitionModal } from './editor/mobile/definition-modal';
import { FMSuggestModal } from './editor/frontmatter-suggest-modal';
import { registerDefFile } from './editor/def-file-registration';
import { DefFileType } from './core/file-type';

export default class NoteDefinition extends Plugin {
	activeEditorExtensions: Extension[] = [];
	defManager: DefManager;
	fileExplorerDeco: FileExplorerDecoration;

	async onload() {
		// Settings are injected into global object
		const settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		injectGlobals(settings, this.app, window);

		this.registerEvent(this.app.workspace.on('window-open', (win: WorkspaceWindow, newWindow: Window) => {
			injectGlobals(settings, this.app, newWindow);
		}))

		logDebug("Load note definition plugin");

		initDefinitionPopover(this);
		initDefinitionModal(this.app);
		this.defManager = initDefFileManager(this.app);
		this.fileExplorerDeco = initFileExplorerDecoration(this.app);
		this.registerEditorExtension(this.activeEditorExtensions);
		this.updateEditorExts();

		this.registerCommands();
		this.registerEvents();

		this.addSettingTab(new SettingsTab(this.app, this, this.saveSettings.bind(this)));
		this.registerMarkdownPostProcessor(postProcessor);

		this.fileExplorerDeco.run();
	}

	async saveSettings() {
		await this.saveData(window.NoteDefinition.settings);
		this.fileExplorerDeco.run();
		this.refreshDefinitions();
	}

	registerCommands() {
		this.addCommand({
			id: "preview-definition",
			name: "Preview definition",
			editorCallback: (editor) => {
				const curWord = getMarkedWordUnderCursor(editor);
				if (!curWord) return;
				const def = window.NoteDefinition.definitions.global.get(curWord);
				if (!def) return;
				getDefinitionPopover().openAtCursor(def);
			}
		});

		this.addCommand({
			id: "goto-definition",
			name: "Go to definition",
			editorCallback: (editor) => {
				const currWord = getMarkedWordUnderCursor(editor);
				if (!currWord) return;
				const def = this.defManager.get(currWord);
				if (!def) return;
				this.app.workspace.openLinkText(def.linkText, '');
			}
		});

		this.addCommand({
			id: "add-definition",
			name: "Add definition",
			editorCallback: (editor) => {
				const selectedText = editor.getSelection();
				const addModal = new AddDefinitionModal(this.app);
				addModal.open(selectedText);
			}
		});

		this.addCommand({
			id: "add-def-context",
			name: "Add definition context",
			editorCallback: (editor) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("Command must be used within an active opened file");
					return;
				}
				const suggestModal = new FMSuggestModal(this.app, activeFile);
				suggestModal.open();
			}
		});

		this.addCommand({
			id: "refresh-definitions",
			name: "Refresh definitions",
			callback: () => {
				this.fileExplorerDeco.run();
				this.defManager.loadDefinitions();
			}
		});

		this.addCommand({
			id: "register-consolidated-def-file",
			name: "Register consolidated definition file",
			editorCallback: (_) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("Command must be used within an active opened file");
					return;
				}
				registerDefFile(this.app, activeFile, DefFileType.Consolidated);
			}
		});

		this.addCommand({
			id: "register-atomic-def-file",
			name: "Register atomic definition file",
			editorCallback: (_) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("Command must be used within an active opened file");
					return;
				}
				registerDefFile(this.app, activeFile, DefFileType.Atomic);
			}
		})
	}

	registerEvents() {
		this.registerEvent(this.app.workspace.on("active-leaf-change", async (leaf) => {
			if (!leaf) return;
			this.reloadUpdatedDefinitions();
			this.updateEditorExts();
			this.defManager.updateActiveFile();
		}));

		this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
			const defPopover = getDefinitionPopover();
			if (defPopover) {
				defPopover.close();
			}

			const curWord = getMarkedWordUnderCursor(editor);
			if (!curWord) {
				if (editor.getSelection()) {
					menu.addItem(item => {
						item.setTitle("Add definition")
						item.setIcon("plus")
						.onClick(() => {
								const addModal = new AddDefinitionModal(this.app);
								addModal.open(editor.getSelection());
						});
					});
				}
				return;
			};
			const def = this.defManager.get(curWord);
			if (!def) {
				return;
			};
			this.registerMenuForMarkedWords(menu, def);
		}));

		// Add file menu options
		this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source) => {
			if (file instanceof TFolder) {
				menu.addItem(item => {
					item.setTitle("Set definition folder")
						.setIcon("book-a")
						.onClick(() => {
							const settings = getSettings();
							settings.defFolder = file.path;
							this.saveSettings();
						});
				});
			}
		}));

		// Creating files under def folder should register file as definition file
		this.registerEvent(this.app.vault.on('create', (file) => {
			const settings = getSettings();
			if (file.path.startsWith(settings.defFolder)) {
				this.fileExplorerDeco.run();
				this.refreshDefinitions();
			}
		}));

		this.registerEvent(this.app.metadataCache.on('changed', (file: TFile) => {
			const currFile = this.app.workspace.getActiveFile();
			
			if (currFile && currFile.path === file.path) {
				this.defManager.updateActiveFile();

				let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

				if(activeView) {
					// @ts-expect-error, not typed
					const view = activeView.editor.cm as EditorView;
					const plugin = view.plugin(definitionMarker);
					
					if (plugin) {
						plugin.forceUpdate();
					}
				}
			}
		}));
	}

	registerMenuForMarkedWords(menu: Menu, def: Definition) {
		menu.addItem((item) => {
			item.setTitle("Go to definition")
				.setIcon("arrow-left-from-line")
				.onClick(() => {
					this.app.workspace.openLinkText(def.linkText, '');
				});
		})

		menu.addItem(item => {
			item.setTitle("Edit definition")
				.setIcon("pencil")
				.onClick(() => {
					const editModal = new EditDefinitionModal(this.app);
					editModal.open(def);
				});
		});
	}

	refreshDefinitions() {
		this.defManager.loadDefinitions();
	}

	reloadUpdatedDefinitions() {
		this.defManager.loadUpdatedFiles();
	}

	updateEditorExts() {
		const currFile = this.app.workspace.getActiveFile();
		if (currFile && this.defManager.isDefFile(currFile)) {
			// TODO: Editor extension for definition file
			this.setActiveEditorExtensions([]);
		} else {
			this.setActiveEditorExtensions(definitionMarker);
		}
	}

	private setActiveEditorExtensions(...ext: Extension[]) {
		this.activeEditorExtensions.length = 0;
		this.activeEditorExtensions.push(...ext);
		this.app.workspace.updateOptions();
	}

	onunload() {
		logDebug("Unload note definition plugin");
		getDefinitionPopover().cleanUp();
	}
}
