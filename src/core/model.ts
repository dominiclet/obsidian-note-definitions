import { TFile } from "obsidian";
import { DefFileType } from "./file-type";

export interface Definition {
	key: string;
	word: string;
	aliases: string[];
	definition: string;
	file: TFile;
	linkText: string;
	fileType: DefFileType;
	position?: FilePosition;
}

export interface FilePosition {
	from: number;
	to: number;
}
