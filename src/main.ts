import { App, Modal, Plugin } from 'obsidian';
import { FileParser } from './file-parser';
import { Definition } from './model';
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

let definitionCache: Map<string, Definition>;

export default class NoteDefinition extends Plugin {

	async onload() {
		definitionCache = new Map<string, Definition>();
		const file = this.app.vault.getFileByPath("definitions/Definition.md")
		if (file) {
			let parser = new FileParser(this.app, file);
			parser.parseFile().then(defs => {
				defs.forEach(def => {
					definitionCache.set(def.key, def);
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
				new DefinitionModal(this.app, curWord, definitionCache.get(curWord)).open();
			}
		});

		this.registerEditorExtension(viewPlugin)

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

class DefStylePlugin implements PluginValue {
	decorations: DecorationSet;
	alphabetRegex = /^[a-zA-Z]+$/;
	terminatingChars = new Set([' ', '\n', '\r']);

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		for (let { from, to } of view.visibleRanges) {
			const text = view.state.sliceDoc(from, to);
			let wordBuf = [];
			let word = '';
			for (let i = 0; i < text.length; i++) {
				let c = text.charAt(i);
				if (wordBuf.length == 0 && this.alphabetRegex.test(c)) {
					// start of word
					wordBuf.push(c);
					continue
				}
				if (wordBuf.length > 0 && this.terminatingChars.has(c)) {
					word = wordBuf.join('');
					if (definitionCache.has(word.toLowerCase())) {
						builder.add(from + i - word.length, from + i, Decoration.mark({
							attributes: {
								style: 'text-decoration:underline yellow dotted',
							}
						}));
					}
					wordBuf = [];
					word = '';
					continue
				}
				if (wordBuf.length > 0) {
					wordBuf.push(c);
				}
			}
		}
		return builder.finish();
	}
}

const pluginSpec: PluginSpec<DefStylePlugin> = {
	decorations: (value: DefStylePlugin) => value.decorations,
};

export const viewPlugin = ViewPlugin.fromClass(
	DefStylePlugin,
	pluginSpec
);

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
