import { App, TFile } from "obsidian";
import { Definition } from "./model";


export class AtomicDefParser {
	app: App;
	file: TFile;

	constructor(app: App, file: TFile) {
		this.app = app;
		this.file = file;
	}

	async parseFile(fileContent?: string): Promise<Definition[]> {
		if (!fileContent) {
			fileContent = await this.app.vault.cachedRead(this.file);
		}

		const fileMetadata = this.app.metadataCache.getFileCache(this.file);
		const fmPos = fileMetadata?.frontmatterPosition;
		if (fmPos) {
			fileContent = fileContent.slice(fmPos.end.offset+1);
		}

		const def = {
			key: this.file.basename.toLowerCase(),
			word: this.file.basename,
			aliases: [], // TODO
			definition: fileContent,
			file: this.file,
			linkText: `${this.file.path}`,
		}
		return [def];
	}
}
