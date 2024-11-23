import { Platform } from "obsidian";
import { getSettings, PopoverEventSettings } from "src/settings";

const triggerFunc = 'event.stopPropagation();activeWindow.NoteDefinition.triggerDefPreview(this);';

export const DEF_DECORATION_CLS = "def-decoration";

// For normal decoration of definitions
export function getDecorationAttrs(phrase: string): { [key: string]: string } {
	let attributes: { [key: string]: string } = {
		def: phrase,
	}
	const settings = getSettings();
	if (Platform.isMobile) {
		attributes.onclick = triggerFunc;
		return attributes;
	}
	if (settings.popoverEvent === PopoverEventSettings.Click) {
		attributes.onclick = triggerFunc;
	} else {
		attributes.onmouseenter = triggerFunc;
	}
	if (!settings.enableSpellcheck) {
		attributes.spellcheck = "false";
	}
	return attributes;
}

