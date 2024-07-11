import { getLinkpath, MarkdownPostProcessor } from "obsidian";
import { getDefFileManager } from "src/core/def-file-manager";
import { getSettings } from "src/settings";
import { DEF_DECORATION_CLS, getDecorationAttrs } from "./common";
import { getDefinitionPopover } from "./definition-popover";
import { LineScanner, PhraseInfo } from "./definition-search";

const DEF_LINK_DECOR_CLS = "def-link-decoration";

interface Marks {
	el: HTMLElement;
	phraseInfo: PhraseInfo;
}

export const postProcessor: MarkdownPostProcessor = (element, context) => {
	const shouldRunPostProcessor = window.NoteDefinition.settings.enableInReadingView;
	if (!shouldRunPostProcessor) {
		return;
	}

	const popoverSettings = getSettings().defPopoverConfig;

	// Prevent post-processing for definition popover
	const isPopupCtx = element.getAttr("ctx") === "def-popup";
	if (isPopupCtx && !popoverSettings.enableDefinitionLink) {
		return;
	}

	rebuildHTML(element, isPopupCtx);
}

const rebuildHTML = (parent: Node, isPopupCtx: boolean) => {
	for (let i = 0; i < parent.childNodes.length; i++) {
		const childNode = parent.childNodes[i];
		// Replace only if TEXT_NODE
		if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent) {
			if (childNode.textContent === "\n") {
				// Ignore nodes with just a newline char
				continue;
			}
			const lineScanner = new LineScanner();
			const currText = childNode.textContent;
			const phraseInfos = lineScanner.scanLine(currText);
			if (phraseInfos.length === 0) {
				continue;
			}

			// Decorations need to be sorted by 'from' ascending, then 'to' descending
			// This allows us to prefer longer words over shorter ones
			phraseInfos.sort((a, b) => b.to - a.to);
			phraseInfos.sort((a, b) => a.from - b.from);

			let currCursor = 0;
			const newContainer = parent.createSpan();
			const addedMarks: Marks[] = [];

			const popoverSettings = getSettings().defPopoverConfig;

			phraseInfos.forEach(phraseInfo => {
				if (phraseInfo.from < currCursor) {
					// Subset or intersect phrases are ignored
					return;
				}

				newContainer.appendText(currText.slice(currCursor, phraseInfo.from));

				let span: HTMLSpanElement;
				if (isPopupCtx && popoverSettings.enableDefinitionLink) {
					span = getLinkDecorationSpan(newContainer, phraseInfo, currText);
				} else {
					span = getNormalDecorationSpan(newContainer, phraseInfo, currText);
				}

				newContainer.appendChild(span);
				addedMarks.push({
					el: span,
					phraseInfo: phraseInfo,
				})
				currCursor = phraseInfo.to;
			});

			newContainer.appendText(currText.slice(currCursor));
			childNode.replaceWith(newContainer);
		}

		rebuildHTML(childNode, isPopupCtx);
	}
}

function getNormalDecorationSpan(container: HTMLElement, phraseInfo: PhraseInfo, currText: string): HTMLSpanElement {
	const attributes = getDecorationAttrs(phraseInfo.phrase);
	const span = container.createSpan({
		cls: DEF_DECORATION_CLS,
		attr: attributes,
		text: currText.slice(phraseInfo.from, phraseInfo.to),
	});
	return span;
}

function getLinkDecorationSpan(container: HTMLElement, phraseInfo: PhraseInfo, currText: string): HTMLSpanElement {
	const span = container.createSpan({
		cls: DEF_LINK_DECOR_CLS,
		text: currText.slice(phraseInfo.from, phraseInfo.to),
	});
	span.addEventListener("click", (e) => {
		const app = window.NoteDefinition.app;
		const def = getDefFileManager().get(phraseInfo.phrase);
		if (!def) {
			return;
		}
		app.workspace.openLinkText(def.linkText, '');
		// Close definition popover
		const popover = getDefinitionPopover();
		if (popover) {
			popover.close();
		}
	});
	return span;
}
