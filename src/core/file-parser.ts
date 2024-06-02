import { App, TFile, Vault } from "obsidian";
import { Definition } from "./model";


export class FileParser {
	app: App;
	vault: Vault;
	file: TFile;
	defBuffer: {
		word?: string;
		fullName?: string;
		definition?: string;
	};
	inDefinition: boolean;
	definitions: Definition[];

	constructor(app: App, file: TFile) {
		this.app = app;
		this.vault = app.vault;
		this.file = file;
		this.defBuffer = {};
		this.inDefinition = false;
		this.definitions = [];
	}

	async parseFile(): Promise<Definition[]> {
		const fileContent = await this.vault.cachedRead(this.file)
		const lines = fileContent.split('\n');

		for (const line of lines) {
			if (line == "") {
				continue
			}
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
			if (this.isWordDeclaration(line)) {
				this.defBuffer.word = this.extractWordDeclaration(line);
				continue
			}
			if (this.isFullNameDeclaration(line)) {
				this.defBuffer.fullName = this.extractFullName(line);
				continue
			}
			// Begin definition
			this.inDefinition = true;
			this.defBuffer.definition = line + "\n";

		}
		if (this.bufferValid()) {
			this.commitDefBuffer();
		}
		return this.definitions;
	}

	private commitDefBuffer() {
		this.definitions.push({
			key: this.defBuffer.word?.toLowerCase() ?? "",
			word: this.defBuffer.word ?? "",
			fullName: this.defBuffer.fullName ?? "",
			definition: this.defBuffer.definition ?? "",
			file: this.file,
			linkText: `${this.file.path}${this.defBuffer.word ? '#'+this.defBuffer.word : ''}`,
		});
		this.defBuffer = {};
	}

	private bufferValid(): boolean {
		return !!this.defBuffer.word;
	}

	private isEndOfBlock(line: string): boolean {
		return line.startsWith("---");
	}

	private isFullNameDeclaration(line: string): boolean {
		line = line.trimEnd();
		return !!this.defBuffer.word && line.startsWith("*") && line.endsWith("*");
	}

	private extractFullName(line: string): string {
		line = line.trimEnd();
		return line.slice(1, line.length-1);
	}

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
		this.defBuffer = {};
	}
}
