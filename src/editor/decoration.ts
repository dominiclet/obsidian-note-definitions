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
import { getDefFileManager } from "src/core/def-file-manager";
import { getSettings } from "src/settings";

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
		const settings = getSettings();
		const defManager = getDefFileManager();

		for (let { from, to } of view.visibleRanges) {
			const text = view.state.sliceDoc(from, to);
			phraseInfos.push(...scanText(text, from));
		}

		const filteredPhrases: PhraseInfo[] = [];

		phraseInfos.forEach(wordPos => {
			const def = defManager.get(wordPos.phrase);
			if (!def) return;

			// Skip if word is in known words list
			if (settings.knownWords.includes(def.key)) {
				return;
			}

			// Check first-occurrence mode
			if (def.displayMode === 'first-only') {
				const tracking = settings.firstOccurrenceTracking[def.key];
				if (tracking) {
					// Already shown before, skip it
					return;
				} else {
					// First occurrence! Track it
					const activeFile = window.NoteDefinition.app.workspace.getActiveFile();
					settings.firstOccurrenceTracking[def.key] = {
						file: activeFile?.path || '',
						position: wordPos.from
					};
					// Note: Settings will be saved on plugin unload or settings change
				}
			}

			// Determine CSS class based on highlight style
			let cssClass = DEF_DECORATION_CLS;
			if (def.highlightStyle === 'box') {
				cssClass = 'def-decoration-box';
			}

			const attributes = getDecorationAttrs(wordPos.phrase);
			builder.add(wordPos.from, wordPos.to, Decoration.mark({
				class: cssClass,
				attributes: attributes,
			}));

			filteredPhrases.push(wordPos);
		});

		markedPhrases = filteredPhrases;
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

