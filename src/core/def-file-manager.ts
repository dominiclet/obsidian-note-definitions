import { App, TFile, TFolder } from "obsidian";
import { PTreeNode } from "src/editor/prefix-tree";
import { DEFAULT_DEF_FOLDER } from "src/settings";
import { normaliseWord } from "src/util/editor";
import { logDebug, logWarn } from "src/util/log";
import { useRetry } from "src/util/retry";
import { FileParser } from "./file-parser";
import { Definition } from "./model";

let defFileManager: DefManager;

export const DEF_CTX_FM_KEY = "def-context";

export class DefManager {
	app: App;
	globalDefs: DefinitionRepo;
	globalDefFiles: Map<string, TFile>;
	globalPrefixTree: PTreeNode;
	lastUpdate: number;

	activeFile: TFile | null;
	localPrefixTree: PTreeNode;
	shouldUseLocalPTree: boolean;

	constructor(app: App) {
		this.app = app;
		this.globalDefs = new DefinitionRepo();
		this.globalDefFiles = new Map<string, TFile>();
		this.globalPrefixTree = new PTreeNode();
		this.resetLocalConfigs()
		this.lastUpdate = 0;

		window.NoteDefinition.definitions.global = this.globalDefs;

		this.loadDefinitions();
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
			const fmCache = metadataCache.frontmatter?.[DEF_CTX_FM_KEY];
			if (!fmCache) {
				// No def-source specified
				return;
			}
			if (!Array.isArray(fmCache)) {
				logWarn("Unrecognised type for 'def-source' frontmatter");
				return;
			}
			this.buildLocalPrefixTree(fmCache);
			this.shouldUseLocalPTree = true;
		}
	}

	// For manually updating definition sources, as metadata cache may not be the latest updated version
	updateDefSources(defSource: string[]) {
		this.resetLocalConfigs();
		this.buildLocalPrefixTree(defSource);
		this.shouldUseLocalPTree = true;
	}

	private buildLocalPrefixTree(fmCache: string[]) {
		const root = new PTreeNode();
		fmCache.forEach(filePath => {
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

	loadDefinitions() {
		this.reset();
		this.loadGlobals();
	}

	get(key: string) {
		return this.globalDefs.get(normaliseWord(key));
	}

	getDefFiles(): TFile[] {
		return [...this.globalDefFiles.values()]
	}

	async loadUpdatedFiles() {
		const definitions: Definition[] = [];
		const dirtyFiles: string[] = [];

		for (let file of this.globalDefFiles.values()) {
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
		this.buildPrefixTree();
		this.lastUpdate = Date.now();
	}

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
		return parser.parseFile();
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
