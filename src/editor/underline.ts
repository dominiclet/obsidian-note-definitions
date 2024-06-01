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
import { LatinWordParser, WordParser } from "./word-parsers/latin-word-parser";

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

		const wordParser = new LatinWordParser(text);
		
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

			if (wordInfo.terminating) {
				// No need to look back anymore if current word is terminating
				wordStack = [];
			}
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

