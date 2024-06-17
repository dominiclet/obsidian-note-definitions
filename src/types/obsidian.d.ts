import { View } from "obsidian";

interface FileExplorerView extends View {
	fileItems: { [key: string]: FileItem };
}


interface FileItem {
	selfEl: HTMLElement;
	innerEl: HTMLElement;
}
