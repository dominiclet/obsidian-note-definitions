import { BaseDefParser } from "./base-def-parser";
import { App, TFile } from "obsidian";
import { Definition } from "./model";
import { DefFileType } from "./file-type";


export class AtomicDefParser extends BaseDefParser {
	app: App;
	file: TFile;

	constructor(app: App, file: TFile) {
		super();

		this.app = app;
		this.file = file;
	}

	async parseFile(fileContent?: string): Promise<Definition[]> {
		if (!fileContent) {
			fileContent = await this.app.vault.cachedRead(this.file);
		}

		const fileMetadata = this.app.metadataCache.getFileCache(this.file);
		let aliases = [];
		const fmData = fileMetadata?.frontmatter;
		if (fmData) {
			const fmAlias = fmData["aliases"];
			if (Array.isArray(fmAlias)) {
				aliases = fmAlias;
			}
		}
		const fmPos = fileMetadata?.frontmatterPosition;
		if (fmPos) {
			fileContent = fileContent.slice(fmPos.end.offset+1);
		}

		aliases = aliases.concat(this.calculatePlurals([this.file.basename].concat(aliases)));

		const def = {
			key: this.file.basename.toLowerCase(),
			word: this.file.basename,
			aliases: aliases,
			definition: fileContent,
			file: this.file,
			linkText: `${this.file.path}`,
			fileType: DefFileType.Atomic,
		}
		return [def];
	}
}
