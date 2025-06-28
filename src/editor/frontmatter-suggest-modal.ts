import { App, FuzzySuggestModal, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import { DEF_CTX_FM_KEY, getDefFileManager } from "src/core/def-file-manager";
import { logError } from "src/util/log";


export class FMSuggestModal extends FuzzySuggestModal<TAbstractFile> {
	file: TFile;

	constructor(app: App, currFile: TFile) {
		super(app)
		this.file = currFile;
	}

	getItems(): TAbstractFile[] {
		const defManager = getDefFileManager();
		return [...defManager.getDefFiles(), ...defManager.getDefFolders()];
	}

	getItemText(item: TAbstractFile): string {
		return this.getPath(item);
	}

	onChooseItem(item: TAbstractFile, evt: MouseEvent | KeyboardEvent) {
		const path = this.getPath(item);
		this.app.fileManager.processFrontMatter(this.file, (fm) => {
			let currDefSource = fm[DEF_CTX_FM_KEY];

			if (!currDefSource || !Array.isArray(currDefSource)) {
				currDefSource = [];
			} else if (currDefSource.includes(path)) {
				new Notice("Definition file source is already included for this file");
				return;
			}
			
			fm[DEF_CTX_FM_KEY] = [...currDefSource, path];
		}).catch(e => {
			logError(`Error writing to frontmatter of file: ${e}`);
		});
	}

	private getPath(file: TAbstractFile): string {
		if (file instanceof TFolder) {
			return file.path + "/";
		}
		return file.path;
	}
}
