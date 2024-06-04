import { App, TFile, TFolder } from "obsidian";
import { PTreeNode } from "src/editor/prefix-tree";
import { normaliseWord } from "src/util/editor";
import { logWarn } from "src/util/log";
import { FileParser } from "./file-parser";
import { Definition } from "./model";

const DEFAULT_DEF_FOLDER = "definitions"

let defFileManager: DefManager;

export class DefManager {
	app: App;
	globalDefs: Map<string, Definition>;
	globalDefFiles: TFile[];
	prefixTree: PTreeNode;

	constructor(app: App) {
		this.app = app;
		this.globalDefs = new Map<string, Definition>;
		this.globalDefFiles = [];
		window.NoteDefinition.definitions.global = this.globalDefs;
		this.prefixTree = new PTreeNode();
	}

	isDefFile(file: TFile): boolean {
		return file.path.startsWith(this.getGlobalDefFolder())
	}

	reset() {
		this.globalDefs.clear();
		this.globalDefFiles = [];
	}

	loadDefinitions() {
		this.reset();
		this.loadGlobals();
	}

	get(key: string) {
		return this.globalDefs.get(normaliseWord(key));
	}

	has(key: string) {
		return this.globalDefs.has(normaliseWord(key));
	}

	private async loadGlobals() {
		const globalFolder = this.app.vault.getFolderByPath(this.getGlobalDefFolder());
		if (!globalFolder) {
			logWarn("Global definition folder not found, unable to load global definitions");
			return
		}

		// Recursively load files within the global definition folder
		const definitions = await this.parseFolder(globalFolder);
		definitions.forEach(def => {
			this.globalDefs.set(def.key, def);
		});

		// Build prefix tree
		const root = new PTreeNode();
		this.globalDefs.forEach((_, key) => {
			root.add(key, 0);
		});
		this.prefixTree = root;
	}

	private async parseFolder(folder: TFolder): Promise<Definition[]> {
		const definitions: Definition[] = [];
		for (let f of folder.children) {
			if (f instanceof TFolder) {
				let defs = await this.parseFolder(f);
				definitions.push(...defs);
			} else if (f instanceof TFile) {
				let defs = await this.parseFile(f);
				definitions.push(...defs);
			}
		}
		return definitions;
	}

	private async parseFile(file: TFile): Promise<Definition[]> {
		this.globalDefFiles.push(file);
		let parser = new FileParser(this.app, file);
		return parser.parseFile();
	}

	// Here for extensibility
	getGlobalDefFolder() {
		return DEFAULT_DEF_FOLDER;
	}
}

export function initDefFileManager(app: App): DefManager {
	defFileManager = new DefManager(app);
	return defFileManager;
}

export function getDefFileManager(): DefManager {
	return defFileManager;
}
