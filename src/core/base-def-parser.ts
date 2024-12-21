import { DefFileParseConfig, getSettings } from "src/settings";

var pluralize = require('pluralize');

export class BaseDefParser {

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
