import { App, Notice, parseFrontMatterTags, TFile, TFolder } from "obsidian";
import { PTreeNode } from "src/editor/prefix-tree";
import { DEFAULT_DEF_FOLDER, VALID_DEFINITION_FILE_TYPES } from "src/settings";
import { normaliseWord } from "src/util/editor";
import { logDebug, logError, logWarn } from "src/util/log";
import { useRetry } from "src/util/retry";
import { FileParser } from "./file-parser";
import { DefFileType } from "./file-type";
import { Definition, DuplicateDefinition } from "./model";
import { findDuplicateDefinitions } from "./duplicate-def-detector";
import { getSettings } from "src/settings";

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
	shouldUseLocal: boolean;

	localDefs: DefinitionRepo;

	// Populated on every full load/refresh (loadDefinitions)
	duplicateDefs: DuplicateDefinition[];
	private loadPromise: Promise<void> | null = null;
	private reloadRequested = false;
	private updateRequested = false;

	constructor(app: App) {
		this.app = app;
		this.globalDefs = new DefinitionRepo();
		this.globalDefFiles = new Map<string, TFile>();
		this.globalDefFolders = new Map<string, TFolder>();
		this.globalPrefixTree = new PTreeNode();
		this.consolidatedDefFiles = new Map<string, TFile>();
		this.localDefs = new DefinitionRepo();
		this.duplicateDefs = [];

		this.resetLocalConfigs();
		this.lastUpdate = 0;
		this.markedDirty = [];

		window.NoteDefinition.definitions.global = this.globalDefs;

		this.loadDefinitions().then(this.triggerDuplicateDefWarning.bind(this));
	}

	addDefFile(file: TFile) {
		this.globalDefFiles.set(file.path, file);
	}

	// Get the appropriate prefix tree to use for current active file
	getPrefixTree() {
		if (this.shouldUseLocal) {
			return this.localPrefixTree;
		}
		return this.globalPrefixTree;
	}

	// Updates active file and rebuilds local prefix tree if necessary
	updateActiveFile() {
		this.activeFile = this.app.workspace.getActiveFile();
		this.resetLocalConfigs();

		if (this.activeFile) {
			const metadataCache = this.app.metadataCache.getFileCache(
				this.activeFile,
			);
			if (!metadataCache) {
				return;
			}
			const paths = metadataCache.frontmatter?.[DEF_CTX_FM_KEY];
			if (!paths) {
				// No def-source specified
				return;
			}
			if (!Array.isArray(paths)) {
				logWarn(
					`Unrecognised type for '${DEF_CTX_FM_KEY}' frontmatter`,
				);
				return;
			}
			const flattenedPaths = this.flattenPathList(paths);
			this.buildLocalPrefixTree(flattenedPaths);
			this.buildLocalDefRepo(flattenedPaths);
			this.shouldUseLocal = true;
		}
	}

	// For manually updating definition sources, as metadata cache may not be the latest updated version
	updateDefSources(defSource: string[]) {
		this.resetLocalConfigs();

		if (!defSource || defSource.length === 0) {
			return;
		}
		this.buildLocalPrefixTree(defSource);
		this.buildLocalDefRepo(defSource);
		this.shouldUseLocal = true;
	}

	markDirty(file: TFile) {
		this.markedDirty.push(file);
	}

	private flattenPathList(paths: string[]): string[] {
		const filePaths: string[] = [];
		paths.forEach((path) => {
			if (this.isFolderPath(path)) {
				filePaths.push(...this.flattenFolder(path));
			} else {
				filePaths.push(path);
			}
		});
		return filePaths;
	}

	// Given a folder path, return an array of file paths
	private flattenFolder(path: string): string[] {
		if (path.endsWith("/")) {
			path = path.slice(0, path.length - 1);
		}
		const folder = this.app.vault.getFolderByPath(path);
		if (!folder) {
			return [];
		}
		const childrenFiles = this.getChildrenFiles(folder);
		return childrenFiles.map((file) => file.path);
	}

	private getChildrenFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		folder.children.forEach((abstractFile) => {
			if (abstractFile instanceof TFolder) {
				files.push(...this.getChildrenFiles(abstractFile));
			} else if (abstractFile instanceof TFile) {
				files.push(abstractFile);
			}
		});
		return files;
	}

	private isFolderPath(path: string): boolean {
		return path.endsWith("/");
	}

	// Expects an array of file paths (not directories)
	private buildLocalPrefixTree(filePaths: string[]) {
		const root = new PTreeNode();
		filePaths.forEach((filePath) => {
			const defMap = this.globalDefs.getMapForFile(filePath);
			if (!defMap) {
				logWarn(`Unrecognised file path '${filePath}'`);
				return;
			}
			[...defMap.keys()].forEach((key) => {
				root.add(key, 0);
			});
		});
		this.localPrefixTree = root;
	}

	// Expects an array of file paths (not directories)
	private buildLocalDefRepo(filePaths: string[]) {
		filePaths.forEach((filePath) => {
			const defMap = this.globalDefs.getMapForFile(filePath);
			if (defMap) {
				this.localDefs.fileDefMap.set(filePath, defMap);
			}
		});
	}

	isDefFile(file: TFile): boolean {
		if (
			!VALID_DEFINITION_FILE_TYPES.some((ext) => file.path.endsWith(ext))
		) {
			return false;
		}
		if (file.path.startsWith(this.getGlobalDefFolder())) {
			return true;
		}
		return (
			getSettings().enableTagDefFileDiscovery && this.hasDefFileTag(file)
		);
	}

	private hasDefFileTag(file: TFile): boolean {
		const settings = getSettings();
		if (!settings.defFileTag) {
			return false;
		}
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) {
			return false;
		}
		const tags = parseFrontMatterTags(cache.frontmatter) ?? [];
		return tags.includes(`#${settings.defFileTag}`);
	}

	reset() {
		this.globalPrefixTree = new PTreeNode();
		this.globalDefs.clear();
		this.globalDefFiles = new Map<string, TFile>();
		this.duplicateDefs = [];
	}

	// Duplicate/conflicting definition keys detected during the last full
	// load/refresh. Empty if no conflicts (or if definitions have not yet
	// been loaded).
	getDuplicateDefinitions(): DuplicateDefinition[] {
		return this.duplicateDefs;
	}

	// Load all definitions from registered def folder
	// This will recurse through the def folder, parsing all definition files
	// Expensive operation so use sparingly
	loadDefinitions(): Promise<void> {
		this.reloadRequested = true;
		return this.scheduleDefinitionLoads();
	}

	loadUpdatedFiles(): Promise<void> {
		this.updateRequested = true;
		return this.scheduleDefinitionLoads();
	}

	private scheduleDefinitionLoads(): Promise<void> {
		if (!this.loadPromise) {
			// Publish the shared promise before any work can re-enter this method.
			this.loadPromise = Promise.resolve().then(() =>
				this.runDefinitionLoads(),
			);
		}
		return this.loadPromise;
	}

	private async runDefinitionLoads(): Promise<void> {
		let failed = false;
		let firstError: unknown;
		try {
			while (this.reloadRequested || this.updateRequested) {
				try {
					if (this.reloadRequested) {
						this.reloadRequested = false;
						this.reset();
						await this.loadGlobals();
					} else {
						this.updateRequested = false;
						await this.runUpdatedFileLoad();
					}
					this.updateActiveFile();
				} catch (error) {
					// Drain requests received during a failed pass, but still reject
					// the shared promise so callers can observe the failure.
					if (!failed) firstError = error;
					failed = true;
				}
			}
			if (failed) throw firstError;
		} finally {
			// No await between the final pending-work check and releasing the
			// lock: a request cannot be lost in a promise-settlement gap.
			this.loadPromise = null;
		}
	}

	triggerDuplicateDefWarning() {
		const duplicates = this.getDuplicateDefinitions();
		if (duplicates.length > 0) {
			new Notice(
				`Note Definitions: [WARNING] ${duplicates.length} duplicate definition${duplicates.length === 1 ? "" : "s"} found. Your definitions may not work properly.\n\nRun 'List duplicate definitions' to review and resolve the duplicated definitions.`,
				8000,
			);
		}
	}

	private getDefRepo() {
		return this.shouldUseLocal ? this.localDefs : this.globalDefs;
	}

	get(key: string) {
		return this.getDefRepo().get(normaliseWord(key));
	}

	set(def: Definition) {
		this.globalDefs.set(def);
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

	private async runUpdatedFileLoad() {
		const startedAt = Date.now();
		const definitions: Definition[] = [];
		const dirtyFiles: string[] = [];

		// Consume only the current dirty batch; later additions belong to the
		// next pass and must not be cleared when this one finishes.
		const markedDirty = new Set(this.markedDirty.splice(0));
		const files = new Set([
			...this.globalDefFiles.values(),
			...markedDirty,
		]);

		for (let file of files) {
			if (markedDirty.has(file) || file.stat.mtime >= this.lastUpdate) {
				logDebug(
					`File ${file.path} was updated, reloading definitions...`,
				);
				dirtyFiles.push(file.path);
				try {
					const defs = await this.parseFile(file);
					definitions.push(...defs);
				} catch (e) {
					this.reportParseError(file, e);
				}
			}
		}

		dirtyFiles.forEach((file) => {
			this.globalDefs.clearForFile(file);
		});

		if (definitions.length > 0) {
			definitions.forEach((def) => {
				this.globalDefs.set(def);
			});
		}

		this.buildPrefixTree();
		this.lastUpdate = startedAt;
	}

	// Global configs should always be used by default
	private resetLocalConfigs() {
		this.localPrefixTree = new PTreeNode();
		this.shouldUseLocal = false;
		this.localDefs.clear();
	}

	private async loadGlobals() {
		const startedAt = Date.now();
		const retry = useRetry();
		let globalFolder: TFolder | null = null;
		// Retry is needed here as getFolderByPath may return null when being called on app startup
		await retry.exec(() => {
			globalFolder = this.app.vault.getFolderByPath(
				this.getGlobalDefFolder(),
			);
			if (!globalFolder) {
				retry.setShouldRetry();
			}
		});

		const definitions: Definition[] = [];

		if (globalFolder) {
			// Recursively load files within the global definition folder
			definitions.push(...(await this.parseFolder(globalFolder)));
		} else {
			logWarn(
				"Global definition folder not found, unable to load global definitions",
			);
		}

		if (getSettings().enableTagDefFileDiscovery) {
			definitions.push(...(await this.parseTaggedFiles()));
		}

		definitions.forEach((def) => {
			this.globalDefs.set(def);
		});

		this.duplicateDefs = findDuplicateDefinitions(
			definitions,
			getSettings().defFileParseConfig.enableCaseSensitive,
		);

		this.buildPrefixTree();
		this.lastUpdate = startedAt;
	}

	// Scan the entire vault for markdown files carrying the def file tag
	private async parseTaggedFiles(): Promise<Definition[]> {
		const definitions: Definition[] = [];
		const files = this.app.vault
			.getMarkdownFiles()
			.filter(
				(f) =>
					!this.globalDefFiles.has(f.path) && this.hasDefFileTag(f),
			);
		for (let f of files) {
			try {
				let defs = await this.parseFile(f);
				definitions.push(...defs);
			} catch (e) {
				this.reportParseError(f, e);
			}
		}
		return definitions;
	}

	private async buildPrefixTree() {
		const root = new PTreeNode();
		this.globalDefs.getAllKeys().forEach((key) => {
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
			} else if (f instanceof TFile && this.isDefFile(f)) {
				try {
					let defs = await this.parseFile(f);
					definitions.push(...defs);
				} catch (e) {
					this.reportParseError(f, e);
				}
			}
		}
		return definitions;
	}

	private reportParseError(file: TFile, e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		logError(`Failed to parse definition file '${file.path}': ${msg}`);
		new Notice(
			`Note Definitions: [ERROR] Failed to parse definition file '${file.path}'. Skipping this file.\n\nError: ${msg}`,
			8000,
		);
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

	// Walk the definition directory to find definition files and folders
	getDefFilesAndFolders(): [TFolder[], TFile[]] {
		const parentDefFolder = this.app.vault.getFolderByPath(
			this.getGlobalDefFolder(),
		);
		if (!parentDefFolder) {
			logWarn("Failed to get parent def folder");
		}
		const [folders, files] = parentDefFolder
			? this.walkFolder(parentDefFolder)
			: [[] as TFolder[], [] as TFile[]];

		if (getSettings().enableTagDefFileDiscovery) {
			const existing = new Set(files.map((f) => f.path));
			this.app.vault
				.getMarkdownFiles()
				.filter((f) => !existing.has(f.path) && this.hasDefFileTag(f))
				.forEach((f) => {
					this.globalDefFiles.set(f.path, f);
					files.push(f);
				});
		}

		return [folders, files];
	}

	private walkFolder(folder: TFolder): [TFolder[], TFile[]] {
		this.globalDefFolders.set(folder.path, folder);
		const folders = [folder];
		const files = [];
		for (let f of folder.children) {
			if (f instanceof TFolder) {
				const [childFolders, childFiles] = this.walkFolder(f);
				folders.push(...childFolders);
				files.push(...childFiles);
			} else if (f instanceof TFile && this.isDefFile(f)) {
				this.globalDefFiles.set(f.path, f);
				files.push(f);
			}
		}
		return [folders, files];
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
		});
		return keys;
	}

	set(def: Definition) {
		let defMap = this.fileDefMap.get(def.file.path);
		if (!defMap) {
			defMap = new Map<string, Definition>();
			this.fileDefMap.set(def.file.path, defMap);
		}
		// Prefer the first encounter over subsequent collisions
		if (defMap.has(def.key)) {
			return;
		}
		defMap.set(def.key, def);

		if (def.aliases.length > 0) {
			def.aliases.forEach((alias) => {
				if (
					defMap &&
					getSettings().defFileParseConfig.enableCaseSensitive
				) {
					defMap.set(alias, def);
				} else if (defMap) {
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
