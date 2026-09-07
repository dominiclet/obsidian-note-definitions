import { App, TFile } from "obsidian";
import { ConsolidatedDefParser } from "src/core/consolidated-def-parser";
import { DefFileType } from "src/core/file-type";
import { DefFileParseConfig } from "src/settings";

const fs = require("node:fs");

// Setup for test file
const consolidatedDefData = fs.readFileSync(
	"src/tests/def-file-samples/consolidated-definitions-test.md",
	"utf8",
);

const caseSensitiveDefData = fs.readFileSync(
	"src/tests/def-file-samples/case-sensitve-definitions-test.md",
	"utf8",
);

const consolidatedTrainingWhitespace = fs.readFileSync(
	"src/tests/def-file-samples/consolidated-trailing-whitespace.md",
	"utf8",
);

const consolidatedStartFileWhitespace = fs.readFileSync(
	"src/tests/def-file-samples/consolidated-start-of-file-whitespace.md",
	"utf8",
);

const consolidatedPersonalNotes = fs.readFileSync(
	"src/tests/def-file-samples/consolidated-personal-notes.md",
	"utf8",
);

const parseSettings: DefFileParseConfig = {
	defaultFileType: DefFileType.Consolidated,
	divider: {
		underscore: true,
		dash: true,
	},
	autoPlurals: false,
	enableCaseSensitive: false,
};

const caseSensitiveParseSettings: DefFileParseConfig = {
	defaultFileType: DefFileType.Consolidated,
	divider: {
		underscore: true,
		dash: true,
	},
	autoPlurals: false,
	enableCaseSensitive: true,
};

const file = {
	path: "src/tests/consolidated-definitions-test.md",
};

const parser = new ConsolidatedDefParser(
	null as unknown as App,
	file as TFile,
	parseSettings,
);

const caseSensitiveParser = new ConsolidatedDefParser(
	null as unknown as App,
	file as TFile,
	caseSensitiveParseSettings,
);

const definitions = parser.directParseFile(consolidatedDefData);
const caseSensitiveDefinitions =
	caseSensitiveParser.directParseFile(caseSensitiveDefData);

describe("Valid definition file can be parsed correctly", () => {
	it("Words of definitions are parsed correctly", async () => {
		expect(definitions.find((def) => def.word === "First")).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Multiple-word definition"),
		).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Alias definition"),
		).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Markdown support"),
		).toBeDefined();
	});

	it("Keys are stored as lowercase of words when case-sensitve disabled", () => {
		expect(definitions.find((def) => def.word === "First")?.key).toBe(
			"first",
		);
		expect(
			definitions.find((def) => def.word === "Multiple-word definition")
				?.key,
		).toBe("multiple-word definition");
		expect(
			definitions.find((def) => def.word === "Alias definition")?.key,
		).toBe("alias definition");
		expect(
			definitions.find((def) => def.word === "Markdown support")?.key,
		).toBe("markdown support");
	});

	it("Definitions are parsed correctly", () => {
		expect(definitions.find((def) => def.key === "first")?.definition).toBe(
			"This is the first definition to test basic functionality.",
		);
		expect(
			definitions.find((def) => def.key === "multiple-word definition")
				?.definition,
		).toBe("This ensures that multiple-word definitions works.");
		expect(
			definitions.find((def) => def.key === "alias definition")
				?.definition,
		).toBe("This tests if the alias function works.");
		expect(
			definitions.find((def) => def.key === "markdown support")
				?.definition,
		).toBe("Markdown syntax _should_ *work*.");
	});

	it("Positions are parsed correctly", () => {
		expect(
			definitions.find((def) => def.key === "first")?.position?.from,
		).toBe(0);
		expect(
			definitions.find((def) => def.key === "first")?.position?.to,
		).toBe(4);
		expect(
			definitions.find((def) => def.key === "multiple-word definition")
				?.position?.from,
		).toBe(6);
		expect(
			definitions.find((def) => def.key === "multiple-word definition")
				?.position?.to,
		).toBe(10);
		expect(
			definitions.find((def) => def.key === "alias definition")?.position
				?.from,
		).toBe(12);
		expect(
			definitions.find((def) => def.key === "alias definition")?.position
				?.to,
		).toBe(18);
		expect(
			definitions.find((def) => def.key === "markdown support")?.position
				?.from,
		).toBe(20);
		expect(
			definitions.find((def) => def.key === "markdown support")?.position
				?.to,
		).toBe(22);
	});

	it("Aliases are parsed correctly", () => {
		expect(
			definitions.find((def) => def.key === "alias definition")?.aliases,
		).toStrictEqual(["Alias1", "Alias2"]);
	});
});

describe("Consolidated definition file has odd formatting, but still valid syntax", () => {
	it("Extra end of file whitespace characters should be ignored", () => {
		const file = {
			path: "src/tests/consolidated-trailing-whitespace.md",
		};
		const parser = new ConsolidatedDefParser(
			null as unknown as App,
			file as TFile,
			parseSettings,
		);

		const definitions = parser.directParseFile(
			consolidatedTrainingWhitespace,
		);
		expect(definitions.find((def) => def.word === "First")).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Multiple-word definition"),
		).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Alias definition"),
		).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Markdown support"),
		).toBeDefined();
	});

	it("Start of file whitespace should be ignored", () => {
		const file = {
			path: "src/tests/consolidated-start-of-file-whitespace.md",
		};
		const parser = new ConsolidatedDefParser(
			null as unknown as App,
			file as TFile,
			parseSettings,
		);
		const definitions = parser.directParseFile(
			consolidatedStartFileWhitespace,
		);
		expect(definitions.find((def) => def.word === "First")).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Multiple-word definition"),
		).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Alias definition"),
		).toBeDefined();
		expect(
			definitions.find((def) => def.word === "Markdown support"),
		).toBeDefined();
	});
});

describe("Personal notes after %%END%% marker are excluded from the definition", () => {
	const file = {
		path: "src/tests/consolidated-personal-notes.md",
	};
	const notesParser = new ConsolidatedDefParser(
		null as unknown as App,
		file as TFile,
		parseSettings,
	);
	const notesDefs = notesParser.directParseFile(consolidatedPersonalNotes);

	it("Definition excludes lines after the %%END%% marker", () => {
		expect(notesDefs.find((def) => def.key === "first")?.definition).toBe(
			"This is the first definition to test basic functionality.",
		);
	});

	it("Personal notes are captured separately", () => {
		expect(notesDefs.find((def) => def.key === "first")?.notes).toBe(
			"These are my personal notes for the first definition.\nThey should not be part of the definition.",
		);
	});

	it("Def-blocks without a marker have no notes", () => {
		expect(notesDefs.find((def) => def.key === "second")?.definition).toBe(
			"This is the second definition.",
		);
		expect(notesDefs.find((def) => def.key === "second")?.notes).toBe("");
	});

	it("Subsequent def-blocks are still parsed after a marker", () => {
		expect(notesDefs.find((def) => def.key === "third")?.definition).toBe(
			"This definition has notes with what looks like a delimiter inside.",
		);
		expect(notesDefs.find((def) => def.key === "third")?.notes).toBe(
			"Personal note line one.",
		);
	});
});

describe("Valid definition file can be parsed correctly when case-sensitive enabled", () => {
	it("Keys are stored with correct case when case-sensitive enabled", () => {
		expect(
			caseSensitiveDefinitions.find((def) => def.word === "First")?.key,
		).toBe("First");
		expect(
			caseSensitiveDefinitions.find((def) => def.word === "first")?.key,
		).toBe("first");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.word === "Multiple-word definition",
			)?.key,
		).toBe("Multiple-word definition");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.word === "Multiple-word Definition",
			)?.key,
		).toBe("Multiple-word Definition");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.word === "Alias definition",
			)?.key,
		).toBe("Alias definition");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.word === "alias definition",
			)?.key,
		).toBeUndefined;
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.word === "Markdown support",
			)?.key,
		).toBe("Markdown support");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.word === "markdown support",
			)?.key,
		).toBeUndefined;
	});

	it("Definitions are parsed correctly when case-sensitive enabled", () => {
		expect(
			caseSensitiveDefinitions.find((def) => def.key === "first")
				?.definition,
		).toBe("This is the first definition to test basic functionality.");
		expect(
			caseSensitiveDefinitions.find((def) => def.key === "First")
				?.definition,
		).toBe("This is a different definition than the first.");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.key === "Multiple-word definition",
			)?.definition,
		).toBe("This ensures that multiple-word definitions works.");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.key === "Multiple-word Definition",
			)?.definition,
		).toBe("This ensures that case matters in multiple word definitions.");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.key === "Alias definition",
			)?.definition,
		).toBe("This tests if the alias function works.");
		expect(
			caseSensitiveDefinitions.find(
				(def) => def.key === "Markdown support",
			)?.definition,
		).toBe("Markdown syntax _should_ *work*.");
	});
});
