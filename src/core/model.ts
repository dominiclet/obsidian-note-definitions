import { TFile } from "obsidian";
import { DefFileType } from "./file-type";

export type DisplayMode = 'first-only' | 'all-occurrences';
export type HighlightStyle = 'box' | 'underline';

export interface Definition {
	key: string;
	word: string;
	aliases: string[];
	definition: string;
	file: TFile;
	linkText: string;
	fileType: DefFileType;
	position?: FilePosition;
	displayMode?: DisplayMode;
	highlightStyle?: HighlightStyle;
}

export interface FilePosition {
	from: number;
	to: number;
}
