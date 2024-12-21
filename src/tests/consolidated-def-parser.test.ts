import { App, TFile } from "obsidian";
import { ConsolidatedDefParser } from "src/core/consolidated-def-parser";
import { DefFileType } from "src/core/file-type";
import { DefFileParseConfig } from "src/settings";

jest.mock('./obsidian');
const fs = require("node:fs");

test('Test consolidated definition parser', async () => {
	const data = fs.readFileSync('src/tests/consolidated-definitions-test.md', 'utf8');
	const parseSettings: DefFileParseConfig = {
		defaultFileType: DefFileType.Consolidated,
		divider: {
			underscore: true,
			dash: true
		},
		autoPlurals: true
	}

	const file = {
		path: "src/tests/consolidated-definitions-test.md"
	};
	const parser = new ConsolidatedDefParser(null as unknown as App, file as TFile, parseSettings);
	const definitions = parser.directParseFile(data);

	const firstDef = definitions.find(def => def.word === "First");
	expect(firstDef).toBeDefined();
	expect(firstDef?.definition).toBe("This is the first definition to test basic functionality.")
});
