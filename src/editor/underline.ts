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

// Underline definitions view plugin
export class DefinitionUnderline implements PluginValue {
	decorations: DecorationSet;

	alphabetRegex = /^[a-zA-Z]+$/;
	terminatingChars = new Set([' ', '\n', '\r']);

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
					if (window.NoteDefinition.definitions.global.has(word.toLowerCase())) {
						builder.add(from + i - word.length, from + i, Decoration.mark({
							class: 'def-decoration',
							attributes: {
								onmouseenter: `window.NoteDefinition.triggerDefPreview(this)`,
								def: word
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

const pluginSpec: PluginSpec<DefinitionUnderline> = {
	decorations: (value: DefinitionUnderline) => value.decorations,
};

export const definitionUnderline = ViewPlugin.fromClass(
	DefinitionUnderline,
	pluginSpec
);


