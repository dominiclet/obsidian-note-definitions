import { App, TFile, TFolder } from "obsidian";
import { PTreeNode } from "src/editor/prefix-tree";
import { DEFAULT_DEF_FOLDER } from "src/settings";
import { normaliseWord } from "src/util/editor";
import { logDebug, logWarn } from "src/util/log";
import { useRetry } from "src/util/retry";
import { DefFileType, FileParser } from "./file-parser";
import { Definition } from "./model";

let defFileManager: DefManager;

export const DEF_CTX_FM_KEY = "def-context";

export class DefManager {
	app: App;
	globalDefs: DefinitionRepo;
	globalDefFolders: Map<string, TFolder>;
	globalDefFiles: Map<string, TFile>;
	globalPrefixTree: PTreeNode;
	lastUpdate: number;

	markedDirty: TFile[];

	consolidatedDefFiles: Map<string, TFile>;

	activeFile: TFile | null;
	localPrefixTree: PTreeNode;
	shouldUseLocalPTree: boolean;

	constructor(app: App) {
		this.app = app;
		this.globalDefs = new DefinitionRepo();
		this.globalDefFiles = new Map<string, TFile>();
		this.globalDefFolders = new Map<string, TFolder>();
		this.globalPrefixTree = new PTreeNode();
		this.consolidatedDefFiles = new Map<string, TFile>();
		this.resetLocalConfigs()
		this.lastUpdate = 0;
		this.markedDirty = [];

		activeWindow.NoteDefinition.definitions.global = this.globalDefs;

		this.loadDefinitions();
	}

	addDefFile(file: TFile) {
		this.globalDefFiles.set(file.path, file);
	}

	// Get the appropriate prefix tree to use for current active file
	getPrefixTree() {
		if (this.shouldUseLocalPTree) {
			return this.localPrefixTree;
		}
		return this.globalPrefixTree;
	}

	// Updates active file and rebuilds local prefix tree if necessary
	updateActiveFile() {
		this.activeFile = this.app.workspace.getActiveFile();
		this.resetLocalConfigs()
		if (this.activeFile) {
			const metadataCache = this.app.metadataCache.getFileCache(this.activeFile);
			if (!metadataCache) {
				return;
			}
			const paths = metadataCache.frontmatter?.[DEF_CTX_FM_KEY];
			if (!paths) {
				// No def-source specified
				return;
			}
			if (!Array.isArray(paths)) {
				logWarn("Unrecognised type for 'def-source' frontmatter");
				return;
			}
			const flattenedPaths = this.flattenPathList(paths);
			this.buildLocalPrefixTree(flattenedPaths);
			this.shouldUseLocalPTree = true;
		}
	}

	// For manually updating definition sources, as metadata cache may not be the latest updated version
	updateDefSources(defSource: string[]) {
		this.resetLocalConfigs();
		this.buildLocalPrefixTree(defSource);
		this.shouldUseLocalPTree = true;
	}

	markDirty(file: TFile) {
		this.markedDirty.push(file);
	}

	private flattenPathList(paths: string[]): string[] {
		const filePaths: string[] = [];
		paths.forEach(path => {
			if (this.isFolderPath(path)) {
				filePaths.push(...this.flattenFolder(path));
			} else {
				filePaths.push(path);
			}
		})
		return filePaths;
	}

	// Given a folder path, return an array of file paths
	private flattenFolder(path: string): string[] {
		if (path.endsWith("/")) {
			path = path.slice(0, path.length - 1);
		}
		const folder = this.app.vault.getFolderByPath(path)
		if (!folder) {
			return [];
		}
		const childrenFiles = this.getChildrenFiles(folder);
		return childrenFiles.map(file => file.path);
	}

	private getChildrenFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		folder.children.forEach(abstractFile => {
			if (abstractFile instanceof TFolder) {
				files.push(...this.getChildrenFiles(abstractFile));
			} else if (abstractFile instanceof TFile) {
				files.push(abstractFile);
			}
		})
		return files;
	}

	private isFolderPath(path: string): boolean {
		return path.endsWith("/");
	}

	// Expects an array of file paths (not directories)
	private buildLocalPrefixTree(filePaths: string[]) {
		const root = new PTreeNode();
		filePaths.forEach(filePath => {
			const defMap = this.globalDefs.getMapForFile(filePath);
			if (!defMap) {
				logWarn(`Unrecognised file path '${filePath}'`)
				return;
			}
			[...defMap.keys()].forEach(key => {
				root.add(key, 0);
			});
		});
		this.localPrefixTree = root;
	}

	isDefFile(file: TFile): boolean {
		return file.path.startsWith(this.getGlobalDefFolder())
	}

	reset() {
		this.globalPrefixTree = new PTreeNode();
		this.globalDefs.clear();
		this.globalDefFiles = new Map<string, TFile>();
	}

	// Load all definitions from registered def folder
	// This will recurse through the def folder, parsing all definition files
	// Expensive operation so use sparingly
	loadDefinitions() {
		this.reset();
		this.loadGlobals();
	}

	get(key: string) {
		return this.globalDefs.get(normaliseWord(key));
	}

	set(def: Definition) {
		this.globalDefs.set(def)
	}

	getDefFiles(): TFile[] {
		return [...this.globalDefFiles.values()];
	}

	getConsolidatedDefFiles(): TFile[] {
		return [...this.consolidatedDefFiles.values()];
	}

	getDefFolders(): TFolder[] {
		return [...this.globalDefFolders.values()];
	}

	async loadUpdatedFiles() {
		const definitions: Definition[] = [];
		const dirtyFiles: string[] = [];

		const files = [...this.globalDefFiles.values(), ...this.markedDirty];

		for (let file of files) {
			if (file.stat.mtime > this.lastUpdate) {
				logDebug(`File ${file.path} was updated, reloading definitions...`);
				dirtyFiles.push(file.path);
				const defs = await this.parseFile(file);
				definitions.push(...defs);
			}
		}

		dirtyFiles.forEach(file => {
			this.globalDefs.clearForFile(file);
		});

		if (definitions.length > 0) {
			definitions.forEach(def => {
				this.globalDefs.set(def);
			});
		}

		this.markedDirty = [];
		this.buildPrefixTree();
		this.lastUpdate = Date.now();
	}

	// Global configs should always be used by default
	private resetLocalConfigs() {
		this.localPrefixTree = new PTreeNode();
		this.shouldUseLocalPTree = false;
	}

	private async loadGlobals() {
		const retry = useRetry();
		let globalFolder: TFolder | null = null;
		// Retry is needed here as getFolderByPath may return null when being called on app startup
		await retry.exec(() => {
			globalFolder = this.app.vault.getFolderByPath(this.getGlobalDefFolder());
			if (!globalFolder) {
				retry.setShouldRetry();
			}
		});

		if (!globalFolder) {
			logWarn("Global definition folder not found, unable to load global definitions");
			return
		}

		// Recursively load files within the global definition folder
		const definitions = await this.parseFolder(globalFolder);
		definitions.forEach(def => {
			this.globalDefs.set(def);
		});

		this.buildPrefixTree();
		this.lastUpdate = Date.now();
	}

	private async buildPrefixTree() {
		const root = new PTreeNode();
		this.globalDefs.getAllKeys().forEach(key => {
			root.add(key, 0);
		});
		this.globalPrefixTree = root;
	}

	private async parseFolder(folder: TFolder): Promise<Definition[]> {
		this.globalDefFolders.set(folder.path, folder);
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
		this.globalDefFiles.set(file.path, file);
		let parser = new FileParser(this.app, file);
		const def = await parser.parseFile();
		if (parser.defFileType === DefFileType.Consolidated) {
			this.consolidatedDefFiles.set(file.path, file);
		}
		return def;
	}

	getGlobalDefFolder() {
		return window.NoteDefinition.settings.defFolder || DEFAULT_DEF_FOLDER;
	}
}

export class DefinitionRepo {
	// file name -> {definition-key -> definition}
	fileDefMap: Map<string, Map<string, Definition>>;

	constructor() {
		this.fileDefMap = new Map<string, Map<string, Definition>>();
	}

	getMapForFile(filePath: string) {
		return this.fileDefMap.get(filePath);
	}

	get(key: string) {
		for (let [_, defMap] of this.fileDefMap) {
			const def = defMap.get(key);
			if (def) {
				return def;
			}
		}
	}

	getAllKeys(): string[] {
		const keys: string[] = [];
		this.fileDefMap.forEach((defMap, _) => {
			keys.push(...defMap.keys());
		})
		return keys;
	}

	set(def: Definition) {
		let defMap = this.fileDefMap.get(def.file.path);
		if (!defMap) {
			defMap = new Map<string, Definition>;
			this.fileDefMap.set(def.file.path, defMap);
		}
		// Prefer the first encounter over subsequent collisions
		if (defMap.has(def.key)) {
			return;
		}
		defMap.set(def.key, def);

		if (def.aliases.length > 0) {
			def.aliases.forEach(alias => {
				if (defMap) {
					defMap.set(alias.toLowerCase(), def);
				}
			});
		}
	}

	clearForFile(filePath: string) {
		const defMap = this.fileDefMap.get(filePath);
		if (defMap) {
			defMap.clear();
		}
	}

	clear() {
		this.fileDefMap.clear();
	}
}

export function initDefFileManager(app: App): DefManager {
	defFileManager = new DefManager(app);
	return defFileManager;
}

export function getDefFileManager(): DefManager {
	return defFileManager;
}
