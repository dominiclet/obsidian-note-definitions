import { TFile } from "obsidian";

export interface Definition {
	key: string;
	word: string;
	fullName: string;
	definition: string;
	file: TFile;
	linkText: string;
}
