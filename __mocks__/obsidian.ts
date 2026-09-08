export class App {
	vault: Vault;
	metadataCache: MetadataCache;
	fileManager: FileManager;

	constructor() {
		this.vault = new Vault();
		this.metadataCache = new MetadataCache();
		this.fileManager = new FileManager();
	}
}

export class FileManager {
	async processFrontMatter(
		file: TFile,
		fn: (fm: Record<string, any>) => void,
	): Promise<void> {
		fn({});
	}
}

export class TFile {
	basename: string;
	extension: string;

	// Ignore other properties
}

export class PluginSettingTab {}

export class Vault {
	modify(file: TFile, data: string) {}
	read(file: TFile): Promise<string> {
		return Promise.resolve("");
	}
}

export class MetadataCache {
	getFileCache(file: TFile) {
		return null;
	}
}

export class Notice {}
