import { App, Notice } from "obsidian";
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
		const newLines = this.replaceDefinition(fileDef.position, def, lines);
		const newContent = newLines.join("\n");

		await this.app.vault.modify(file, newContent);
		await getDefFileManager().loadUpdatedFiles();
		new Notice("Definition successfully modified");
	}

	private replaceDefinition(position: FilePosition, def: Definition, lines: string[]) {
		const before = lines.slice(0, position.from);
		const after = lines.slice(position.to+1);
		const newLines = this.constructLinesFromDef(def);
		return before.concat(newLines, after)
	}

	private constructLinesFromDef(def: Definition): string[] {
		const lines = [`# ${def.word}`];
		if (def.aliases.length > 0) {
			const aliasStr = `*${def.aliases.join(", ")}*`;
			lines.push('', aliasStr);
		}
		const trimmedDef = def.definition.replace(/\s+$/g, '');
		lines.push('', trimmedDef, '');
		return lines;
	}
}
