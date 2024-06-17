import { App } from "obsidian";
import { DEFAULT_DEF_FOLDER, getSettings } from "src/settings";
import { FileExplorerView } from "src/types/obsidian";
import { logDebug, logError } from "src/util/log";

let fileExplorerDecoration: FileExplorerDecoration;

const MAX_RETRY = 3;
const RETRY_INTERVAL = 1000;
const DIV_ID = "def-tag-id";

export class FileExplorerDecoration {
	app: App;
	retryCount: number;

	constructor(app: App) {
		this.app = app;
	}

	// Take note: May not be re-entrant
	async run() {
		this.retryCount = 0;

		// Retry required as some views may not be loaded on initial app start
		while (this.retryCount < MAX_RETRY) {
			try {
				this.exec();
			} catch (e) {
				logError(e);
				this.retryCount++;
				await sleep(RETRY_INTERVAL);
				continue;
			}
			return;
		}
	}

	private exec() {
		const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
		const fileExpView = fileExplorer.view as FileExplorerView;

		const settings = getSettings();
		Object.keys(fileExpView.fileItems).forEach(k => {
			const fileItem = fileExpView.fileItems[k];

			// Clear previously added ones (if exist)
			const fileTags = fileItem.selfEl.getElementsByClassName("nav-file-tag");
			for (let i = 0; i < fileTags.length; i++) {
				const fileTag = fileTags[i];
				if (fileTag.id === DIV_ID) {
					fileTag.remove();
				}
			}

			const defFolder = settings.defFolder || DEFAULT_DEF_FOLDER;

			// If def folder is an invalid folder path, then do not add any tags
			if (!fileExpView.fileItems[defFolder]) {
				return;
			}

			if (k.startsWith(defFolder)) {
				this.tagFile(fileExpView, k, "DEF");
			}
		});
	}

	private tagFile(explorer: FileExplorerView, filePath: string, tagContent: string) {
		const el = explorer.fileItems[filePath];
		if (!el) {
			logDebug(`No file item with filepath ${filePath} found`);
			return;
		}

		const fileTags = el.selfEl.getElementsByClassName("nav-file-tag");
		for (let i = 0; i < fileTags.length; i++) {
			const fileTag = fileTags[i];
			fileTag.remove();
		}

		el.selfEl.createDiv({
			cls: "nav-file-tag",
			text: tagContent,
			attr: {
				id: DIV_ID
			}
		})
	}
}

export function initFileExplorerDecoration(app: App): FileExplorerDecoration {
	fileExplorerDecoration = new FileExplorerDecoration(app);
	return fileExplorerDecoration;
}

export function getFileExplorerDecoration(app: App): FileExplorerDecoration {
	if (fileExplorerDecoration) {
		return fileExplorerDecoration;
	}
	return initFileExplorerDecoration(app);
}
