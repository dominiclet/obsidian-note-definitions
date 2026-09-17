import { parse } from "yaml";

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
	cachedRead(file: TFile): Promise<string> {
		return Promise.resolve("");
	}
}

export class MetadataCache {
	getFileCache(file: TFile) {
		return null;
	}
}

export class Notice {}

export function getFrontMatterInfo(content: string) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) {
		return {
			exists: false,
			frontmatter: "",
			from: 0,
			to: 0,
			contentStart: 0,
		};
	}
	const openingLength = match[0].indexOf(match[1]);
	return {
		exists: true,
		frontmatter: match[1],
		from: openingLength,
		to: openingLength + match[1].length,
		contentStart: match[0].length,
	};
}

export function parseYaml(yaml: string): Record<string, unknown> {
	return parse(yaml);
}
