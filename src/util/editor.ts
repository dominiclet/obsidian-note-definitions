import { Editor } from "obsidian";

export function getWordUnderCursor(editor: Editor) {
	const curWordRange = editor.wordAt(editor.getCursor());
	if (!curWordRange) return;
	let currWord = editor.getRange(curWordRange.from, curWordRange.to);
	if (!currWord) {
		return "";
	}
	return normaliseWord(currWord);
}

export function normaliseWord(word: string) {
	return word.trimStart().trimEnd().toLowerCase();
}
