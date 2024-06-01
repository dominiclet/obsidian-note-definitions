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

const PHRASE_MAX_WORDS = 5;

// Information of phrase that can be used to add decorations within the editor
interface PhraseInfo {
	from: number;
	to: number;
	phrase: string;
}

// View plugin to mark definitions
export class DefinitionMarker implements PluginValue {
	decorations: DecorationSet;

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
		let wordStack: WordInfo[] = [];

		const wordParser = new WordParser(text);
		
		while (true) {
			let wordInfo;
			try {
				wordInfo = wordParser.nextWord();
			} catch (e) {
				// End of text
				break;
			}

			wordStack.push(wordInfo);
			if (wordStack.length > PHRASE_MAX_WORDS) {
				wordStack.shift();
			}

			phraseInfos.push(...this.getMatchedPhrases(wordStack, offset));
		}
		return phraseInfos;
	}

	private getMatchedPhrases(wordStack: WordInfo[], offset: number): PhraseInfo[] {
		const phraseInfos: PhraseInfo[] = [];
		const defManager = getDefFileManager();
		for (let i = 0; i < wordStack.length; i++) {
			const window = wordStack.slice(i);
			const phrase = window.map(wordInfo => wordInfo.word).join(' ');
			const def = defManager.get(phrase);
			if (def) {
				phraseInfos.push({
					from: offset + window[0].from,
					to: offset + window[window.length - 1].to,
					phrase: phrase,
				});
			}
		}
		return phraseInfos;
	}
}

const pluginSpec: PluginSpec<DefinitionMarker> = {
	decorations: (value: DefinitionMarker) => value.decorations,
};

export const definitionMarker = ViewPlugin.fromClass(
	DefinitionMarker,
	pluginSpec
);

interface WordInfo {
	word: string;
	from: number;
	to: number;
}

class WordParser {
	private text: string;
	// Pointer to next char to read
	private charPtr: number;
	private textLen: number;

	readonly alphabetRegex = /^[a-zA-Z]+$/;
	// terminating chars mark the end of a word
	readonly terminatingCharRegex = /[!@#$%^&*()\+={}[\]:;"'<>,.?\/|\\\r\n ]/;

	constructor(text: string) {
		this.text = text;
		this.textLen = text.length;
		this.charPtr = 0;
	}

	nextWord(): WordInfo {
		let wordBuf: string[] = [];
		let startPtr: number = 0;

		while (true) {
			if (this.charPtr > this.textLen - 1) {
				break;
			}
			const currPtr = this.charPtr;
			const c = this.text.charAt(this.charPtr++);
			if (wordBuf.length === 0 && this.alphabetRegex.test(c)) {
				// start of word
				startPtr = currPtr;
				wordBuf.push(c);
				continue;
			}
			if (wordBuf.length > 0 && this.terminatingCharRegex.test(c)) {
				// word found
				const word = wordBuf.join('');
				return {
					word: word,
					from: startPtr,
					to: startPtr + word.length,
				};
			}
			if (wordBuf.length > 0) {
				wordBuf.push(c);
			}
		}
		if (wordBuf.length > 0) {
			const word = wordBuf.join('');
			return {
				word: word,
				from: startPtr,
				to: startPtr + word.length,
			}
		}
		throw new Error("No more next word");
	}
}
