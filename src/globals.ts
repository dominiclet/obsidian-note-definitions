import { Definition } from "./core/model";
import { LogLevel } from "./util/log";

export {}

declare global {
	interface Window { NoteDefinition: GlobalVars; }
}

export interface GlobalVars {
	LOG_LEVEL: LogLevel;
	definitions: {
		global: Map<string, Definition>;
	}
}

// Initialise and inject globals
export function injectGlobals() {
	window.NoteDefinition = {
		LOG_LEVEL: window.NoteDefinition?.LOG_LEVEL || LogLevel.Error,
		definitions: {
			global: new Map<string, Definition>(),
		}
	}
}
