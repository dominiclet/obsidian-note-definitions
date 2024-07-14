import { TFile } from "obsidian";

export interface Definition {
	key: string;
	word: string;
	aliases: string[];
	definition: string;
	file: TFile;
	linkText: string;
	position?: FilePosition;
}

export interface FilePosition {
	from: number;
	to: number;
}
