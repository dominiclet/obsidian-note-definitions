import { MarkdownPostProcessor } from "obsidian";
import { LineScanner, PhraseInfo } from "./definition-search";

const spanTagEnd = "</span>"

export const postProcessor: MarkdownPostProcessor = (element, context) => {
	const shouldRunPostProcessor = window.NoteDefinition.settings.enableInReadingView;
	if (!shouldRunPostProcessor) {
		return;
	}

	// Prevent post-processing for definition popover
	if (element.getAttr("ctx") === "def-popup") {
		return;
	}

	const lineScanner = new LineScanner(true);

	const phraseInfos = lineScanner.scanLine(element.innerHTML);
	phraseInfos.sort((a, b) => a.from - b.from);

	phraseInfos.forEach(phraseInfo => {
		element.innerHTML = markDefinedPhrases(element.innerHTML, phraseInfo);
	});
}

const markDefinedPhrases = (text: string, phraseInfo: PhraseInfo) => {
	return text.slice(0, resolveHtmlCharPosition(text, phraseInfo.from)) + makeSpanStart(phraseInfo.phrase) + 
		text.slice(resolveHtmlCharPosition(text, phraseInfo.from), resolveHtmlCharPosition(text, phraseInfo.to)) + 
		spanTagEnd + text.slice(resolveHtmlCharPosition(text, phraseInfo.to));
}

// HTML position ignores tags
// This will give the char's actual position
const resolveHtmlCharPosition = (html: string, htmlPosition: number): number => {
	// Short circuit if htmlPosition is greater than length of string
	if (htmlPosition >= html.length) {
		return html.length;
	}

	let htmlCursor = 0;

	let withinTag = false;
	for (let i = 0; i < html.length; i++) {
		const c = html.charAt(i);
		if (!withinTag && c === '<') {
			withinTag = true;
			continue;
		}
		if (c === '>') {
			withinTag = false;
			continue;
		}
		if (withinTag) {
			continue;
		}
		if (htmlCursor === htmlPosition) {
			return i
		}
		htmlCursor++;
	}
	return html.length;
}

const makeSpanStart = (word: string): string => {
	return `<span class='def-decoration' onmouseenter='window.NoteDefinition.triggerDefPreview(this)' def='${word}'>`
}
