import { getDefFileManager } from "./core/def-file-manager";
import { Definition } from "./core/model";
import { getDefinitionPopover } from "./editor/definition-popover";
import { Settings } from "./settings";
import { LogLevel } from "./util/log";

export {}

declare global {
	interface Window { NoteDefinition: GlobalVars; }
}

export interface GlobalVars {
	LOG_LEVEL: LogLevel;
	definitions: {
		global: Map<string, Definition>;
	};
	triggerDefPreview: (el: any) => void;
	settings: Settings;
}

// Initialise and inject globals
export function injectGlobals(settings: Settings) {
	window.NoteDefinition = {
		LOG_LEVEL: window.NoteDefinition?.LOG_LEVEL || LogLevel.Error,
		definitions: {
			global: new Map<string, Definition>(),
		},
		triggerDefPreview: (el: HTMLElement) => {
			const word = el.getAttr('def');

			if (!word) return;

			const def = getDefFileManager().get(word);
			if (!def) return;

			const defPopover = getDefinitionPopover();
			let isOpen = false;

			const openPopover = setTimeout(() => {
				defPopover.openAtCoords(def, el.getBoundingClientRect());
			}, 200);

			el.onmouseleave = () => {
				if (!isOpen) {
					clearTimeout(openPopover);
				}
			}
		},
		settings,
	}
}
