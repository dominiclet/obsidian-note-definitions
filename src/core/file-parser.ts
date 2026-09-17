import { App, TFile } from "obsidian";
import { getSettings } from "src/settings";
import { readFileFrontmatter } from "src/util/frontmatter";
import { AtomicDefParser } from "./atomic-def-parser";
import { ConsolidatedDefParser } from "./consolidated-def-parser";
import { DefFileType } from "./file-type";
import { Definition } from "./model";

export const DEF_TYPE_FM = "def-type";

export class FileParser {
	app: App;
	file: TFile;
	defFileType?: DefFileType;

	constructor(app: App, file: TFile) {
		this.app = app;
		this.file = file;
	}

	// Optional argument used when file cache may not be updated
	// and we know the new contents of the file
	async parseFile(fileContent?: string): Promise<Definition[]> {
		const content =
			fileContent ?? (await this.app.vault.cachedRead(this.file));
		this.defFileType = this.getDefFileType(content);

		switch (this.defFileType) {
			case DefFileType.Consolidated:
				const defParser = new ConsolidatedDefParser(
					this.app,
					this.file,
				);
				return defParser.parseFile(content);
			case DefFileType.Atomic:
				const atomicParser = new AtomicDefParser(this.app, this.file);
				return atomicParser.parseFile(content);
		}
	}

	private getDefFileType(fileContent: string): DefFileType {
		const cache = this.app.metadataCache.getFileCache(this.file);
		const frontmatter = readFileFrontmatter(fileContent, cache).data;
		const fmFileType = frontmatter?.[DEF_TYPE_FM];
		if (
			fmFileType &&
			(fmFileType === DefFileType.Consolidated ||
				fmFileType === DefFileType.Atomic)
		) {
			return fmFileType;
		}

		// Fallback to configured default
		const parserSettings = getSettings().defFileParseConfig;

		if (parserSettings.defaultFileType) {
			return parserSettings.defaultFileType;
		}
		return DefFileType.Consolidated;
	}
}
