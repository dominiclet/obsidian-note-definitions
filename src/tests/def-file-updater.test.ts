import { App, TFile } from "obsidian";
import { DefFileUpdater } from "src/core/def-file-updater";
import { DefFileType } from "src/core/file-type";
import { DefManager } from "__mocks__/internals";

jest.mock("src/core/def-file-manager", () => {
	return {
		getDefFileManager: () => new DefManager(),
	};
});

jest.mock("src/settings", () => ({
	getSettings: jest.fn(() => ({
		defFileParseConfig: {
			divider: {
				dash: true,
				underscore: false,
			},
		},
	})),
}));

jest.mock("src/util/log");

const app = new App();
const defFileUpdater = new DefFileUpdater(app);

const vaultModify = jest.spyOn(app.vault, "modify");

afterEach(() => {
	jest.clearAllMocks();
});

test("Update atomic definition", async () => {
	const file = {
		basename: "atomic",
		extension: "md",
	} as TFile;
	await defFileUpdater.updateDefinition({
		key: "atomic",
		word: "atomic",
		aliases: [],
		definition: "this is a test definition",
		file: file,
		linkText: "",
		fileType: DefFileType.Atomic,
	});
	expect(vaultModify).toHaveBeenCalledWith(file, "this is a test definition");
});

describe("Test modifying consolidated file", () => {
	it("Update consolidated definition", async () => {
		const file = {
			basename: "consolidated",
			extension: "md",
		} as TFile;

		const oldContent = `# oldWord

*oldAlias*

oldDefinition

---

# Another Definition

anotherDefValue

---

# Yet another def

Yet another definition`;
		const newDefinitionText = "This is a definition, blah blah blah.";
		const expectedNewContent = `# oldWord

*oldAlias*

This is a definition, blah blah blah.

---

# Another Definition

anotherDefValue

---

# Yet another def

Yet another definition`;

		jest.spyOn(app.vault, "read").mockResolvedValue(oldContent);
		jest.spyOn(app.metadataCache, "getFileCache").mockReturnValue({});

		await defFileUpdater.updateDefinition({
			key: "oldword",
			word: "oldWord",
			aliases: ["oldAlias"],
			definition: newDefinitionText,
			file: file,
			linkText: "",
			fileType: DefFileType.Consolidated,
		});

		expect(vaultModify).toHaveBeenCalledWith(file, expectedNewContent);
	});

	it("Update consolidated definition preserves personal notes", async () => {
		const file = {
			basename: "consolidated",
			extension: "md",
		} as TFile;

		const oldContent = `# oldWord

oldDefinition

%%END%%

my personal notes

---

# Another Definition

anotherDefValue`;
		const expectedNewContent = `# oldWord

Updated definition.

%%END%%

my personal notes

---

# Another Definition

anotherDefValue`;

		jest.spyOn(app.vault, "read").mockResolvedValue(oldContent);
		jest.spyOn(app.metadataCache, "getFileCache").mockReturnValue({});

		await defFileUpdater.updateDefinition({
			key: "oldword",
			word: "oldWord",
			aliases: [],
			definition: "Updated definition.",
			file: file,
			linkText: "",
			fileType: DefFileType.Consolidated,
		});

		expect(vaultModify).toHaveBeenCalledWith(file, expectedNewContent);
	});

	it("Add definition to consolidated file", async () => {
		const file = {
			basename: "consolidated",
			extension: "md",
		} as TFile;

		const oldContent = `---
def-type: consolidated
---

# Existing Def
Existing definition.
`;
		const newDef = {
			word: "New Def",
			aliases: ["New Alias"],
			definition: "This is a new definition.",
			file: file,
			fileType: DefFileType.Consolidated,
		};
		const expectedNewContent = `---
def-type: consolidated
---
# Existing Def

Existing definition.

---

# New Def

*New Alias*

This is a new definition.`;

		jest.spyOn(app.vault, "read").mockResolvedValue(oldContent);
		jest.spyOn(app.metadataCache, "getFileCache").mockReturnValue({
			frontmatterPosition: {
				start: {
					line: 0,
					col: 0,
					offset: 0,
				},
				end: {
					line: 2,
					col: 3,
					offset: 30,
				},
			},
		});

		await defFileUpdater.addDefinition(newDef);

		expect(vaultModify).toHaveBeenCalledWith(file, expectedNewContent);
	});

	it("Add definition to empty file", async () => {
		const file = {
			basename: "consolidated",
			extension: "md",
		} as TFile;

		const oldContent = ``;
		const newDef = {
			word: "New Def",
			aliases: ["New Alias"],
			definition: "This is a new definition.",
			file: file,
			fileType: DefFileType.Consolidated,
		};
		const expectedNewContent = `# New Def

*New Alias*

This is a new definition.`;

		jest.spyOn(app.vault, "read").mockResolvedValue(oldContent);

		await defFileUpdater.addDefinition(newDef);

		expect(vaultModify).toHaveBeenCalledWith(file, expectedNewContent);
	});
});
