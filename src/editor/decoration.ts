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
import { logDebug } from "src/util/log";
import { DEF_DECORATION_CLS, getDecorationAttrs } from "./common";
import { LineScanner } from "./definition-search";
import { PTreeNode } from "./prefix-tree";

// Information of phrase that can be used to add decorations within the editor
interface PhraseInfo {
	from: number;
	to: number;
	phrase: string;
}

let markedPhrases: PhraseInfo[] = [];

export function getMarkedPhrases(): PhraseInfo[] {
	return markedPhrases;
}

// View plugin to mark definitions
export class DefinitionMarker implements PluginValue {
	decorations: DecorationSet;
	editorView: EditorView;

	constructor(view: EditorView) {
		this.editorView = view;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged || update.focusChanged) {
			const start = performance.now();
			this.decorations = this.buildDecorations(update.view);
			const end = performance.now();
			logDebug(`Marked definitions in ${end-start}ms`)
			return
		}
	}

	public forceUpdate() {
		const start = performance.now();
		this.decorations = this.buildDecorations(this.editorView);
		const end = performance.now();
		logDebug(`Marked definitions in ${end - start}ms`)
		return;
	}

	destroy() {}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const phraseInfos: PhraseInfo[] = [];

		for (let { from, to } of view.visibleRanges) {
			const text = view.state.sliceDoc(from, to);
			phraseInfos.push(...scanText(text, from));
		}

		phraseInfos.forEach(wordPos => {
			const attributes = getDecorationAttrs(wordPos.phrase);
			builder.add(wordPos.from, wordPos.to, Decoration.mark({
				class: DEF_DECORATION_CLS,
				attributes: attributes,
			}));
		});

		markedPhrases = phraseInfos;
		return builder.finish();
	}
}

// Scan text and return phrases and their positions that require decoration
export function scanText(text: string, offset: number, pTree?: PTreeNode): PhraseInfo[] {
	let phraseInfos: PhraseInfo[] = [];
	const lines = text.split(/\r?\n/);
	let internalOffset = offset;
	const lineScanner = new LineScanner(pTree);

	lines.forEach(line => {
		phraseInfos.push(...lineScanner.scanLine(line, internalOffset));
		// Additional 1 char for \n char
		internalOffset += line.length + 1;
	});

	// Decorations need to be sorted by 'from' ascending, then 'to' descending
	// This allows us to prefer longer words over shorter ones
	phraseInfos.sort((a, b) => b.to - a.to);
	phraseInfos.sort((a, b) => a.from - b.from);
	return removeSubsetsAndIntersects(phraseInfos)
}

function removeSubsetsAndIntersects(phraseInfos: PhraseInfo[]): PhraseInfo[] {
	let cursor = 0;
	return phraseInfos.filter(phraseInfo => {
		if (phraseInfo.from >= cursor) {
			cursor = phraseInfo.to;
			return true;
		}
		return false;
	});
}

const pluginSpec: PluginSpec<DefinitionMarker> = {
	decorations: (value: DefinitionMarker) => value.decorations,
};

export const definitionMarker = ViewPlugin.fromClass(
	DefinitionMarker,
	pluginSpec
);

