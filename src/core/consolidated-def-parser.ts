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
    position: FilePosition;
}

const EOF = '';

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

		this.parseSettings = parseSettings ? parseSettings : this.getParseSettings();

        this.fileContent = '';
        this.currLine = 0;
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
	directParseFile(fileContent: string): Definition[] {
        this.fileContent = fileContent;
        this.currLine = 0;
        this.cursor = 0;
        const doc = this.parseDoc();
        return doc.blocks.map(blk => this.defBlockToDefinition(blk));
	}

    private parseDoc(): DocAST {
        const blocks = [];
        while (this.cursor < this.fileContent.length) {
            blocks.push(this.parseDefBlock());
        }
        return {
            blocks
        };
    }

    private parseDefBlock(): DefblockAST {
        const posStart = this.currLine;
        let header = this.parseHeader();
        let aliases = this.parseAliases();
        let def = this.parseDef();
        const posEnd = this.currLine - 1;
        return {
            header,
            aliases,
            body: def,
            position: {
                from: posStart,
                to: posEnd
            }
        };
    }

    private parseHeader(): string {
        // Ignore leading newlines
        let h;
        do {
            h = this.consumeChar();
        } while (h == "\n")

        if (h != "#") {
            throw new Error(`Parse Header for ${this.file.path}: Unexpected character '${h}', expected '#'`);
        }
        let s = this.consumeChar();
        if (s != " ") {
            throw new Error(`Parse Header for ${this.file.path}: Unexpected character '${s}', expected SPACE`);
        }

        let header = [];
        while (true) {
            let c = this.consumeChar();
            if (c == "\n") {
                break;
            }
            header.push(c);
        }
        return header.join('')
    }

    private parseAliases(): string[] {
        let asterisk;
        do {
            asterisk = this.consumeChar();
        } while (asterisk == "\n")

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

		return aliases.map(alias => alias.trim())
    }

    private parseDef(): string {
        let defStr = '';

        while (true) {
            let c = this.consumeChar();
            if (c === EOF) {
                // On EOF, treat all preceding chars as definition
                return defStr;
            }
            defStr += c;
            if (defStr.length >= 5) {
                if (this.checkDelimiter(defStr.slice(defStr.length-5))) {
                    return defStr.slice(0, defStr.length-5);
                }
            }
        }
    }

    private checkDelimiter(d: string) {
        return d === "\n---\n" || d === "\n___\n";
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

    private defBlockToDefinition(blk: DefblockAST): Definition {
        return {
            key: blk.header.toLowerCase(),
            word: blk.header,
            aliases: blk.aliases.concat(this.calculatePlurals([blk.header].concat(blk.aliases))),
            definition: blk.body.trim(),
            file: this.file,
			linkText: `${this.file.path}${blk.header ? '#' + blk.header : ''}`,
			fileType: DefFileType.Consolidated,
            position: {
                from: blk.position.from,
                to: blk.position.to
            }
        };
    }
}
