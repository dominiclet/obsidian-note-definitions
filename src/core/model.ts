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

export type DefinitionRole = "phrase" | "alias";

// A single place where a lookup key is declared - either as the main phrase of
// a definition or as one of its aliases.
export interface DefinitionOccurrence {
	key: string;
	// The text as it was declared (before normalisation)
	text: string;
	role: DefinitionRole;
	filePath: string;
	linkText: string;
	fileType: DefFileType;
	position?: FilePosition;
}

// A lookup key that is declared by more than one definition occurrence.
export interface DuplicateDefinition {
	key: string;
	occurrences: DefinitionOccurrence[];
}
