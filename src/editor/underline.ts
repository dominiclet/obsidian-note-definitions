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

interface WordPosition {
	from: number;
	to: number;
	word: string;
}

// View plugin to mark definitions
export class DefinitionMarker implements PluginValue {
	decorations: DecorationSet;

	alphabetRegex = /^[a-zA-Z]+$/;
	// terminating chars mark the end of a word
	terminatingCharRegex = /[!@#$%^&*()\-+={}[\]:;"'<>,.?\/|\\\r\n ]/;

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
			return
		}
	}

	destroy() {}

	buildDecorations(view: EditorView): DecorationSet {
		logDebug("Rebuild definition underline decorations");

		const builder = new RangeSetBuilder<Decoration>();
		const wordPositions: WordPosition[] = [];

		for (let { from, to } of view.visibleRanges) {
			const text = view.state.sliceDoc(from, to);
			wordPositions.push(...this.scanText(text, from));
		}

		wordPositions.forEach(wordPos => {
			builder.add(wordPos.from, wordPos.to, Decoration.mark({
				class: 'def-decoration',
				attributes: {
					onmouseenter: `window.NoteDefinition.triggerDefPreview(this)`,
					def: wordPos.word
				}
			}));
		});
		return builder.finish();
	}

	// Scan text and return words and their positions that require decoration
	private scanText(text: string, offset: number): WordPosition[] {
		const defManager = getDefFileManager();
		let wordPositions: WordPosition[] = [];
		let wordBuf = [];
		let word = '';
		for (let i = 0; i < text.length; i++) {
			let c = text.charAt(i);
			if (wordBuf.length == 0 && this.alphabetRegex.test(c)) {
				// start of word
				wordBuf.push(c);
				continue
			}
			if (wordBuf.length > 0 && this.terminatingCharRegex.test(c)) {
				word = wordBuf.join('');
				if (defManager.has(word.toLowerCase())) {
					wordPositions.push({
						from: offset + i - word.length,
						to: offset + i,
						word: word,
					});
				}
				wordBuf = [];
				word = '';
				continue
			}
			if (wordBuf.length > 0) {
				wordBuf.push(c);
			}
		}
		return wordPositions;
	}
}

const pluginSpec: PluginSpec<DefinitionMarker> = {
	decorations: (value: DefinitionMarker) => value.decorations,
};

export const definitionMarker = ViewPlugin.fromClass(
	DefinitionMarker,
	pluginSpec
);


