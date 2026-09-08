import { App, Notice } from "obsidian";
import { getSettings } from "src/settings";
import { logError, logWarn } from "src/util/log";
import { getDefFileManager } from "./def-file-manager";
import { NOTE_DELIMITER } from "./consolidated-def-parser";
import { FileParser } from "./file-parser";
import { DefFileType } from "./file-type";
import { FrontmatterBuilder } from "./fm-builder";
import { Definition } from "./model";

export class DefFileUpdater {
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	async updateDefinition(def: Definition) {
		// Ensure that key is case-insensitive
		def.key = def.key.toLowerCase();
		def.definition = def.definition.trim();

		if (def.fileType === DefFileType.Atomic) {
			await this.updateAtomicDefFile(def);
		} else if (def.fileType === DefFileType.Consolidated) {
			await this.updateConsolidatedDefFile(def);
		} else {
			return;
		}
		await getDefFileManager().loadUpdatedFiles();
		new Notice("Definition successfully modified");
	}

	private async updateAtomicDefFile(def: Definition) {
		const file = def.file;
		const fileContent = await this.app.vault.read(file);

		// account for frontmatter, leaving the rest of it unmodified
		const fileMetadata = this.app.metadataCache.getFileCache(file);
		const fmPos = fileMetadata?.frontmatterPosition;
		let fmContent = "";
		if (fmPos) {
			fmContent = fileContent.slice(0, fmPos.end.offset + 1);
		}

		await this.app.vault.modify(file, fmContent + def.definition);

		// Aliases for atomic definitions live in the frontmatter, so keep them in sync
		await this.app.fileManager
			.processFrontMatter(file, (fm) => {
				if (def.aliases.length > 0) {
					fm["aliases"] = def.aliases;
				} else {
					delete fm["aliases"];
				}
			})
			.catch((e) => {
				logError(`Error updating aliases frontmatter: ${e}`);
			});
	}

	private async updateConsolidatedDefFile(def: Definition) {
		const file = def.file;
		const fileContent = await this.app.vault.read(file);

		const fileParser = new FileParser(this.app, file);
		const defs = await fileParser.parseFile(fileContent);

		const fileDef = defs.find((fileDef) => fileDef.key === def.key);
		if (!fileDef) {
			logError("File definition not found, cannot edit");
			return;
		}
		if (!fileDef.position) {
			logError("Position not set, cannot edit");
			return;
		}

		// Replace definition and aliases
		fileDef.definition = def.definition;
		fileDef.aliases = def.aliases;

		// account for frontmatter
		const fileMetadata = this.app.metadataCache.getFileCache(file);
		const fmPos = fileMetadata?.frontmatterPosition;
		let fmContent: string = "";
		if (fmPos) {
			fmContent = fileContent.slice(0, fmPos.end.offset + 1);
		}

		const newContent = this.generateConsDefFile(defs);

		await this.app.vault.modify(file, fmContent + newContent);
	}

	async addDefinition(def: Partial<Definition>, folder?: string) {
		def.word = def.word?.trim();
		def.definition = def.definition?.trim();
		if (!def.fileType) {
			logError("File type missing");
			return;
		}
		if (def.fileType === DefFileType.Consolidated) {
			await this.addConsolidatedFileDefinition(def);
		} else if (def.fileType === DefFileType.Atomic) {
			await this.addAtomicFileDefinition(def, folder);
		}
		await getDefFileManager().loadUpdatedFiles();
		new Notice("Definition succesfully added");
	}

	private async addAtomicFileDefinition(
		def: Partial<Definition>,
		folder?: string,
	) {
		if (!folder) {
			logError("Folder missing for atomic file add");
			return;
		}
		if (!def.definition) {
			logWarn("No definition given");
			return;
		}
		const fmBuilder = new FrontmatterBuilder();
		fmBuilder.add("def-type", "atomic");
		if (def.aliases) {
			const aliases: string[] = [];
			def.aliases.forEach((alias) => {
				aliases.push(`- ${alias}`);
			});
			fmBuilder.add("aliases", "\n" + aliases.join("\n"));
		}
		const fm = fmBuilder.finish();
		const file = await this.app.vault.create(
			`${folder}/${def.word}.md`,
			fm + def.definition,
		);

		getDefFileManager().addDefFile(file);
		getDefFileManager().markDirty(file);
	}

	private async addConsolidatedFileDefinition(def: Partial<Definition>) {
		const file = def.file;
		if (!file) {
			logError("Add definition failed, no file given");
			return;
		}
		const fileContent = await this.app.vault.read(file);
		const fileParser = new FileParser(this.app, file);
		const defs = await fileParser.parseFile(fileContent);

		// @ts-ignore: This is fine as long as word, alias (optional) and definition are present
		// Nothing else is used
		defs.push(def);

		// account for frontmatter
		const fileMetadata = this.app.metadataCache.getFileCache(file);
		const fmPos = fileMetadata?.frontmatterPosition;
		let fmContent: string = "";
		if (fmPos) {
			fmContent = fileContent.slice(0, fmPos.end.offset + 1);
		}

		const newContent = this.generateConsDefFile(defs);

		await this.app.vault.modify(file, fmContent + newContent);
	}

	private addSeparator(lines: string[]) {
		const dividerSettings = getSettings().defFileParseConfig.divider;
		let sepChoice = dividerSettings.underscore ? "___" : "---";
		lines.push("", sepChoice, "");
	}

	private constructLinesFromDef(def: Partial<Definition>): string[] {
		const lines = [`# ${def.word}`];
		if (def.aliases && def.aliases.length > 0) {
			const aliasStr = `*${def.aliases.join(", ")}*`;
			lines.push("", aliasStr);
		}
		const trimmedDef = def.definition
			? def.definition.replace(/\s+$/g, "")
			: "";
		lines.push("", trimmedDef);
		const trimmedNotes = def.notes ? def.notes.replace(/\s+$/g, "") : "";
		if (trimmedNotes) {
			lines.push("", NOTE_DELIMITER, "", trimmedNotes);
		}
		return lines;
	}

	// Given an array of definitions, generate the contents of a consolidated definition file
	// Remember that this does not consider the frontmatter of a file
	private generateConsDefFile(defs: Definition[]): string {
		const lines: string[] = [];
		defs.forEach((def, idx) => {
			const defLines = this.constructLinesFromDef(def);
			lines.push(...defLines);
			if (idx !== defs.length - 1) {
				this.addSeparator(lines);
			}
		});
		return lines.join("\n");
	}
}
