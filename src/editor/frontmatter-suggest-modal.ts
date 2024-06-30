import { App, FuzzySuggestModal, Notice, TFile } from "obsidian";
import { DEF_CTX_FM_KEY, getDefFileManager } from "src/core/def-file-manager";
import { logError } from "src/util/log";


export class FMSuggestModal extends FuzzySuggestModal<TFile> {
	file: TFile;

	constructor(app: App, currFile: TFile) {
		super(app)
		this.file = currFile;
	}

	getItems(): TFile[] {
		const defManager = getDefFileManager();
		return defManager.getDefFiles();
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent) {
		this.app.fileManager.processFrontMatter(this.file, (fm) => {
			let currDefSource = fm[DEF_CTX_FM_KEY];
			if (!currDefSource || !Array.isArray(currDefSource)) {
				fm[DEF_CTX_FM_KEY] = [item.path];
				return;
			}
			// Check if file is already added
			if (currDefSource.includes(item.path)) {
				new Notice("Definition file source is already included for this file");
				return;
			}
			fm[DEF_CTX_FM_KEY] = [...currDefSource, item.path];

			// Reload internals
			getDefFileManager().updateDefSources([...currDefSource, item.path]);
		}).catch(e => {
			logError(`Error writing to frontmatter of file: ${e}`);
		});
	}
}
