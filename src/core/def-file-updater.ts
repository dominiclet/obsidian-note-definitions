import { App, Notice } from "obsidian";
import { getSettings } from "src/settings";
import { logError } from "src/util/log";
import { getDefFileManager } from "./def-file-manager";
import { FileParser } from "./file-parser";
import { Definition, FilePosition } from "./model";


export class DefFileUpdater {
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	async updateDefinition(def: Definition) {
		const file = def.file;
		const fileContent = await this.app.vault.read(file);

		const fileParser = new FileParser(this.app, file);
		const defs = await fileParser.parseFile(fileContent);
		const lines = fileContent.split("\n");

		const fileDef = defs.find(fileDef => fileDef.key === def.key);
		if (!fileDef) {
			logError("File definition not found, cannot edit");
			return;
		}
		// TODO: Handle atomic def file update
		if (fileDef.position) {
			const newLines = this.replaceDefinition(fileDef.position, def, lines);
			const newContent = newLines.join("\n");

			await this.app.vault.modify(file, newContent);
		}
		await getDefFileManager().loadUpdatedFiles();
		new Notice("Definition successfully modified");
	}

	async addDefinition(def: Partial<Definition>) {
		const file = def.file;
		if (!file) {
			logError("Add definition failed, no file given");
			return;
		}
		const fileContent = await this.app.vault.read(file);
		let lines = fileContent.split("\n");
		lines = this.removeTrailingBlankNewlines(lines);
		if (!this.checkEndedWithSeparator(lines)) {
			this.addSeparator(lines);
		}
		const addedLines = this.constructLinesFromDef(def);
		const newLines = lines.concat(addedLines);
		const newContent = newLines.join("\n");

		await this.app.vault.modify(file, newContent);
		await getDefFileManager().loadUpdatedFiles();
		new Notice("Definition succesfully added");
	}

	private addSeparator(lines: string[]) {
		const dividerSettings = getSettings().defFileParseConfig.divider;
		let sepChoice = dividerSettings.underscore ? "___" : "---";
		lines.push('', sepChoice);
	}
	
	private checkEndedWithSeparator(lines: string[]): boolean {
		const settings = getSettings();
		if (settings.defFileParseConfig.divider.dash && lines[lines.length-1].startsWith("---")) {
			return true;
		}
		if (settings.defFileParseConfig.divider.underscore && lines[lines.length-1].startsWith("___")) {
			return true;
		}
		return false;
	}

	private removeTrailingBlankNewlines(lines: string[]): string[] {
		let blankLines = 0;
		for (let i = 0; i < lines.length; i++) {
			const currLine = lines[lines.length - 1 - i];
			if (/\S/.test(currLine)) {
				blankLines = i;
				break;
			}
		}
		return lines.slice(0, lines.length - blankLines);
	}

	private replaceDefinition(position: FilePosition, def: Definition, lines: string[]) {
		const before = lines.slice(0, position.from);
		const after = lines.slice(position.to+1);
		const newLines = this.constructLinesFromDef(def);
		return before.concat(newLines, after)
	}

	private constructLinesFromDef(def: Partial<Definition>): string[] {
		const lines = [`# ${def.word}`];
		if (def.aliases && def.aliases.length > 0) {
			const aliasStr = `*${def.aliases.join(", ")}*`;
			lines.push('', aliasStr);
		}
		const trimmedDef = def.definition ? def.definition.replace(/\s+$/g, '') : '';
		lines.push('', trimmedDef, '');
		return lines;
	}
}
