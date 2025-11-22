import { TFile } from "obsidian";
import { DefFileType } from "./file-type";

export enum DisplayMode {
	FirstOnly = "first-only",
	AllOccurrences = "all-occurrences"
}

export enum HighlightStyle {
	Underline = "underline",
	Box = "box"
}

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
