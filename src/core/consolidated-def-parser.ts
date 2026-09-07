import { App, TFile } from "obsidian";
import { BaseDefParser } from "src/core/base-def-parser";
import { DefFileParseConfig } from "src/settings";
import { DefFileType } from "./file-type";
import { Definition, FilePosition } from "./model";

interface DocAST {
	blocks: DefblockAST[];
}

interface DefblockAST {
	header: string;
	aliases: string[];
	body: string;
	notes: string;
	position: FilePosition;
}

const EOF = "";

// When a line contains only this marker, the remaining lines of the def-block
// (up to the delimiter) are treated as the user's personal notes rather than
// part of the definition.
export const NOTE_DELIMITER = "%%END%%";

export class ConsolidatedDefParser extends BaseDefParser {
	app: App;
	file: TFile;
	parseSettings: DefFileParseConfig;

	fileContent: string;
	cursor: number;
	currLine: number;

	constructor(app: App, file: TFile, parseSettings?: DefFileParseConfig) {
		super(parseSettings);

		this.app = app;
		this.file = file;

		this.parseSettings = parseSettings
			? parseSettings
			: this.getParseSettings();

		this.fileContent = "";
		this.currLine = 0;
	}

	async parseFile(fileContent?: string): Promise<Definition[]> {
		if (fileContent === "") {
			return [];
		}
		if (!fileContent) {
			fileContent = await this.app.vault.cachedRead(this.file);
		}

		// Ignore frontmatter (properties)
		const fileMetadata = this.app.metadataCache.getFileCache(this.file);
		const fmPos = fileMetadata?.frontmatterPosition;
		if (fmPos) {
			fileContent = fileContent.slice(fmPos.end.offset + 1);
		}
		return this.directParseFile(fileContent);
	}

	// Parse from string, no dependency on App
	// For ease of testing
	directParseFile(fileContent: string): Definition[] {
		this.fileContent = fileContent;
		this.currLine = 0;
		this.cursor = 0;
		const doc = this.parseDoc();
		return doc.blocks.map((blk) => this.defBlockToDefinition(blk));
	}

	private parseDoc(): DocAST {
		const blocks = [];
		while (this.cursor < this.fileContent.length) {
			// Ignore leading newlines (and whitespace)
			let c;
			do {
				c = this.consumeChar();
			} while (/\s/.test(c));

			// If EOF encountered, just return
			if (c === EOF) {
				return {
					blocks,
				};
			}
			// otherwise return character to def block
			this.spitChar();

			blocks.push(this.parseDefBlock());
		}
		return {
			blocks,
		};
	}

	private parseDefBlock(): DefblockAST {
		const posStart = this.currLine;
		let header = this.parseHeader();
		let aliases = this.parseAliases();
		let { def, notes } = this.parseDef();
		const posEnd = this.currLine - 1;
		return {
			header,
			aliases,
			body: def,
			notes,
			position: {
				from: posStart,
				to: posEnd,
			},
		};
	}

	private parseHeader(): string {
		const h = this.consumeChar();

		if (h != "#") {
			throw new Error(
				`Parse Header for ${this.file.path} (at line ${this.currLine}): Unexpected character '${h}', expected '#'`,
			);
		}
		let s = this.consumeChar();
		if (s != " ") {
			throw new Error(
				`Parse Header for ${this.file.path} (at line ${this.currLine}): Unexpected character '${s}', expected SPACE`,
			);
		}

		let header = [];
		while (true) {
			let c = this.consumeChar();
			if (c == "\n") {
				break;
			}
			header.push(c);
		}
		return header.join("");
	}

	private parseAliases(): string[] {
		let asterisk;
		do {
			asterisk = this.consumeChar();
		} while (asterisk == "\n");

		if (asterisk != "*") {
			// aliases optional, so backtrack
			this.spitChar();
			return [];
		}

		// Consume until reach ASTERISK
		let aliasStart = this.cursor;
		let aliasEnd = aliasStart;
		while (true) {
			let c = this.consumeChar();
			if (c == "\n") {
				// If we encounter a newline before a '*',
				// then determine that there is no alias declaration
				this.cursor = aliasStart - 1;
				return [];
			}
			if (c == "*") {
				break;
			}
			aliasEnd++;
		}
		let aliasStr = this.fileContent.slice(aliasStart, aliasEnd);
		const aliases = aliasStr.split(/[,|]/);

		// Continue consuming until newline (but all chars after the closing ASTERISK are ignored)
		while (this.consumeChar() != "\n") {}

		return aliases.map((alias) => alias.trim());
	}

	private parseDef(): { def: string; notes: string } {
		let defStr = "";

		while (true) {
			let c = this.consumeChar();
			if (c === EOF) {
				// On EOF, treat all preceding chars as definition
				return this.splitNotes(defStr);
			}
			defStr += c;
			if (
				defStr.length >= 5 &&
				this.checkDelimiter(defStr.slice(defStr.length - 5))
			) {
				return this.splitNotes(defStr.slice(0, defStr.length - 5));
			}
		}
	}

	// If a line contains only the NOTE_DELIMITER, everything after that line is
	// the user's personal notes and is excluded from the definition body.
	private splitNotes(raw: string): { def: string; notes: string } {
		const lines = raw.split("\n");
		const endIdx = lines.findIndex(
			(line) => line.trim() === NOTE_DELIMITER,
		);
		if (endIdx < 0) {
			return { def: raw, notes: "" };
		}
		return {
			def: lines.slice(0, endIdx).join("\n"),
			notes: lines.slice(endIdx + 1).join("\n"),
		};
	}

	private checkDelimiter(d: string) {
		const r = /\n *((---)|(___)) *\n/;
		return r.test(d);
	}

	// For backtracking, used for optional grammars rules
	private spitChar(count?: number) {
		if (!count) {
			count = 1;
		}
		for (let i = 0; i < count; i++) {
			this.cursor--;
		}
	}

	private consumeChar(): string {
		if (this.cursor >= this.fileContent.length) {
			return EOF;
		}
		const c = this.fileContent[this.cursor++];
		if (c === "\n") {
			this.currLine++;
		}
		return c;
	}

	private headerToKey(key: string): string {
		return this.parseSettings.enableCaseSensitive ? key : key.toLowerCase();
	}

	private defBlockToDefinition(blk: DefblockAST): Definition {
		return {
			key: this.headerToKey(blk.header),
			word: blk.header,
			aliases: blk.aliases.concat(
				this.calculatePlurals([blk.header].concat(blk.aliases)),
			),
			definition: blk.body.trim(),
			notes: blk.notes.trim(),
			file: this.file,
			linkText: `${this.file.path}${blk.header ? "#" + blk.header : ""}`,
			fileType: DefFileType.Consolidated,
			position: {
				from: blk.position.from,
				to: blk.position.to,
			},
		};
	}
}
