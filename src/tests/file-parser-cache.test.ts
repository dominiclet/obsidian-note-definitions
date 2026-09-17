import { App, TFile } from "obsidian";
import { FileParser } from "src/core/file-parser";
import { DefFileType } from "src/core/file-type";

jest.mock("src/settings", () => ({
	getSettings: () => ({
		defFileParseConfig: {
			defaultFileType: DefFileType.Atomic,
			divider: { dash: true, underscore: false },
			autoPlurals: false,
			enableCaseSensitive: false,
		},
	}),
}));

describe("FileParser while the metadata cache is warming", () => {
	it("uses file frontmatter without waiting for a cache entry", async () => {
		const app = new App();
		const file = {
			path: "definitions/Alpha.md",
			basename: "Alpha",
		} as TFile;
		const content = [
			"---",
			"def-type: consolidated",
			"---",
			"",
			"# Alpha",
			"",
			"A definition.",
		].join("\n");
		jest.spyOn(app.vault, "cachedRead").mockResolvedValue(content);
		jest.spyOn(app.metadataCache, "getFileCache").mockReturnValue(null);

		const definitions = await new FileParser(app, file).parseFile();

		expect(definitions).toHaveLength(1);
		expect(definitions[0].word).toBe("Alpha");
		expect(definitions[0].definition.trim()).toBe("A definition.");
	});

	it("reads atomic aliases and strips frontmatter without a cache entry", async () => {
		const app = new App();
		const file = {
			path: "definitions/Beta.md",
			basename: "Beta",
		} as TFile;
		const content = [
			"---",
			"def-type: atomic",
			"aliases:",
			"  - Second",
			"---",
			"Beta definition.",
		].join("\n");
		jest.spyOn(app.vault, "cachedRead").mockResolvedValue(content);
		jest.spyOn(app.metadataCache, "getFileCache").mockReturnValue(null);

		const definitions = await new FileParser(app, file).parseFile();

		expect(definitions[0].aliases).toContain("Second");
		expect(definitions[0].definition.trim()).toBe("Beta definition.");
	});
});
