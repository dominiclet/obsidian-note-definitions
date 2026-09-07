import { TFile } from "obsidian";
import { DefFileType } from "./file-type";

export interface Definition {
	key: string;
	word: string;
	aliases: string[];
	definition: string;
	// User's personal notes, kept in the def-block after a line containing only
	// the note delimiter. Not shown as part of the definition.
	notes?: string;
	file: TFile;
	linkText: string;
	fileType: DefFileType;
	position?: FilePosition;
}

// Both to and from inclusive
export interface FilePosition {
	from: number;
	to: number;
}
