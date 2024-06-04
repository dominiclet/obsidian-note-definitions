import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { getDefFileManager } from "src/core/def-file-manager";
import { logDebug } from "src/util/log";
import { PTreeTraverser } from "./prefix-tree";

// Information of phrase that can be used to add decorations within the editor
interface PhraseInfo {
	from: number;
	to: number;
	phrase: string;
}

// View plugin to mark definitions
export class DefinitionMarker implements PluginValue {
	readonly cnLangRegex = /\p{Script=Han}/u;
	readonly terminatingCharRegex = /[!@#$%^&*()\+={}[\]:;"'<>,.?\/|\\\r\n ]/;

	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			const start = performance.now();
			this.decorations = this.buildDecorations(update.view);
			const end = performance.now();
			logDebug(`Marked definitions in ${end-start}ms`)
			return
		}
	}

	destroy() {}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const phraseInfos: PhraseInfo[] = [];

		for (let { from, to } of view.visibleRanges) {
			const text = view.state.sliceDoc(from, to);
			phraseInfos.push(...this.scanText(text, from));
		}

		phraseInfos.forEach(wordPos => {
			builder.add(wordPos.from, wordPos.to, Decoration.mark({
				class: 'def-decoration',
				attributes: {
					onmouseenter: `window.NoteDefinition.triggerDefPreview(this)`,
					def: wordPos.phrase
				}
			}));
		});
		return builder.finish();
	}

	// Scan text and return phrases and their positions that require decoration
	private scanText(text: string, offset: number): PhraseInfo[] {
		let phraseInfos: PhraseInfo[] = [];
		const lines = text.split('\n');
		let internalOffset = offset;

		lines.forEach(line => {
			let traversers: PTreeTraverser[] = [];
			const defManager = getDefFileManager();

			for (let i = 0; i < line.length; i++) {
				if (this.isValidStart(line, i)) {
					traversers.push(new PTreeTraverser(defManager.prefixTree));
				}

				const c = line.charAt(i).toLowerCase();
				traversers.forEach(traverser => {
					traverser.gotoNext(c);
					if (traverser.isWordEnd() && this.isValidEnd(line, i)) {
						const phrase = traverser.getWord();
						phraseInfos.push({
							phrase: phrase,
							from: internalOffset + i - phrase.length + 1,
							to: internalOffset + i + 1,
						});
					}
				});
				// Collect garbage traversers that hit a dead-end
				traversers = traversers.filter(traverser => {
					return !!traverser.currPtr;
				});
			}
			// Additional 1 char for \n char
			internalOffset += line.length + 1;
		});

		// Decorations need to be sorted by 'from'
		phraseInfos.sort((a, b) => a.from - b.from);
		return phraseInfos;
	}

	// Check if this character is a valid start of a word depending on the context
	private isValidStart(line: string, ptr: number): boolean {
		const c = line.charAt(ptr).toLowerCase();
		if (c == " ") {
			return false;
		}
		if (ptr === 0 || this.isNonSpacedLanguage(c)) {
			return true;
		}
		// Check if previous character is a terminating character
		return this.terminatingCharRegex.test(line.charAt(ptr-1))
	}

	private isValidEnd(line: string, ptr: number): boolean {
		const c = line.charAt(ptr).toLowerCase();
		if (this.isNonSpacedLanguage(c)) {
			return true;
		}
		// If EOL, then it is a valid end
		if (ptr === line.length - 1) {
			return true;
		}
		// Check if next character is a terminating character
		return this.terminatingCharRegex.test(line.charAt(ptr+1));
	}

	// Check if character is from a non-spaced language
	private isNonSpacedLanguage(c: string): boolean {
		return this.cnLangRegex.test(c);
	}
}

const pluginSpec: PluginSpec<DefinitionMarker> = {
	decorations: (value: DefinitionMarker) => value.decorations,
};

export const definitionMarker = ViewPlugin.fromClass(
	DefinitionMarker,
	pluginSpec
);

