import { App, TFile } from "obsidian";
import { getDefFileManager } from "src/core/def-file-manager";
import { DEF_TYPE_FM } from "src/core/file-parser";
import { DefFileType } from "src/core/file-type";
import { logError } from "src/util/log";


export function registerDefFile(app: App, file: TFile, fileType: DefFileType) {
	app.fileManager.processFrontMatter(file, fm => {
		fm[DEF_TYPE_FM] = fileType; 
		getDefFileManager().loadDefinitions();
	}).catch(e => {
		logError(`Err writing to frontmatter of file: ${e}`);
	});
}
