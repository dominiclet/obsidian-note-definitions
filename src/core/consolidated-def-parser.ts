import { App, TFile } from "obsidian";
import { BaseDefParser } from "src/core/base-def-parser";
import { DefFileParseConfig } from "src/settings";
import { DefFileType } from "./file-type";
import { Definition, FilePosition } from "./model";


export class ConsolidatedDefParser extends BaseDefParser {
	app: App;
	file: TFile;
	parseSettings: DefFileParseConfig;

	defBuffer: {
		word?: string;
		aliases?: string[];
		definition?: string;
		filePosition?: Partial<FilePosition>;
	};
	inDefinition: boolean;
	definitions: Definition[];

	currLine: number;

	constructor(app: App, file: TFile, parseSettings?: DefFileParseConfig) {
		super(parseSettings);

		this.app = app;
		this.file = file;

		this.parseSettings = parseSettings ? parseSettings : this.getParseSettings();

		this.defBuffer = {};
		this.inDefinition = false;
		this.definitions = [];
	}

	async parseFile(fileContent?: string): Promise<Definition[]> {
		if (!fileContent) {
			fileContent = await this.app.vault.cachedRead(this.file);
		}

		// Ignore frontmatter (properties)
		const fileMetadata = this.app.metadataCache.getFileCache(this.file);
		const fmPos = fileMetadata?.frontmatterPosition;
		if (fmPos) {
			fileContent = fileContent.slice(fmPos.end.offset+1);
		}
		return this.directParseFile(fileContent);
	}

	// Parse from string, no dependency on App
	// For ease of testing
	directParseFile(fileContent: string) {
		const lines = fileContent.split(/\r?\n/);
		this.currLine = -1;

		for (const line of lines) {
			this.currLine++;

			if (this.isEndOfBlock(line)) {
				if (this.bufferValid()) {
					this.commitDefBuffer();
				}
				this.startNewBlock();
				continue
			}
			if (this.inDefinition) {
				this.defBuffer.definition += line + "\n";
				continue
			}

			// If not within definition, ignore empty lines
			if (line == "") {
				continue
			}
			if (this.isWordDeclaration(line)) {
				let from = this.currLine;
				this.defBuffer.filePosition = {
					from: from,
				}
				this.defBuffer.word = this.extractWordDeclaration(line);
				continue
			}
			if (this.isAliasDeclaration(line)) {
				this.defBuffer.aliases = this.extractAliases(line);
				continue
			}
			// Begin definition
			this.inDefinition = true;
			this.defBuffer.definition = line + "\n";
		}
		this.currLine++;
		if (this.bufferValid()) {
			this.commitDefBuffer();
		}
		return this.definitions;
	}

	private commitDefBuffer() {
		const aliases = this.defBuffer.aliases ?? [];
		this.defBuffer.aliases = aliases.concat(this.calculatePlurals([this.defBuffer.word ?? ""].concat(aliases)));

		const definition = (this.defBuffer.definition ?? "").trim();

		// Register word
		this.definitions.push({
			key: this.defBuffer.word?.toLowerCase() ?? "",
			word: this.defBuffer.word ?? "",
			aliases: this.defBuffer.aliases ?? [],
			definition: definition,
			file: this.file,
			linkText: `${this.file.path}${this.defBuffer.word ? '#'+this.defBuffer.word : ''}`,
			fileType: DefFileType.Consolidated,
			position: {
				from: this.defBuffer.filePosition?.from ?? 0, 
				to: this.currLine-1,
			}
		});
		// Register aliases
		if (this.defBuffer.aliases && this.defBuffer.aliases.length > 0) {
			this.defBuffer.aliases.forEach(alias => {
				this.definitions.push({
					key: alias.toLowerCase(),
					word: this.defBuffer.word ?? "",
					aliases: this.defBuffer.aliases ?? [],
					definition: definition,
					file: this.file,
					linkText: `${this.file.path}${this.defBuffer.word ? '#'+this.defBuffer.word : ''}`,
					fileType: DefFileType.Consolidated,
					position: {
						from: this.defBuffer.filePosition?.from ?? 0, 
						to: this.currLine-1,
					}
				});
			});
		}
		this.defBuffer = {};
	}

	private bufferValid(): boolean {
		return !!this.defBuffer.word;
	}

	private isEndOfBlock(line: string): boolean {
		if (this.parseSettings.divider.dash && line.startsWith("---")) {
			return true;
		}
		return this.parseSettings.divider.underscore && line.startsWith("___");
	}

	private isAliasDeclaration(line: string): boolean {
		line = line.trimEnd();
		return !!this.defBuffer.word && line.startsWith("*") && line.endsWith("*");
	}

	private extractAliases(line: string): string[] {{
		line = line.trimEnd().replace(/\*+/g, '');
		const aliases = line.split(/[,|]/);
		return aliases.map(alias => alias.trim())
	}}

	private isWordDeclaration(line: string): boolean {
		return line.startsWith("# ");
	}

	private extractWordDeclaration(line: string): string {
		const sepLine = line.split(" ");
		if (sepLine.length <= 1) {
			// Invalid word
			return "";
		}
		return sepLine.slice(1).join(' ');
	}

	private startNewBlock() {
		this.inDefinition = false;
	}
}
