import { App, TFile } from "obsidian";
import { DefFileParseConfig, getSettings } from "src/settings";

var pluralize = require('pluralize');

export class BaseDefParser {
    app: App;
	file: TFile;
    
    constructor(app: App, file: TFile) {
		this.app = app;
		this.file = file;
	}

    calculatePlurals(aliases: string[]) {
        let plurals: string[] = [];

        if (this.getParseSettings().autoPlurals)
        {
            aliases.forEach(alias => {
                let pl = pluralize(alias);
                if (pl !== alias)
                {
                    plurals.push(pl)
                }
            })
        }

		return plurals;
    }
    
    getParseSettings(): DefFileParseConfig {
		return getSettings().defFileParseConfig;
	}
}