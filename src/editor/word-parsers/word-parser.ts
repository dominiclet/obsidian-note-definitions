export interface WordInfo {
	word: string;
	from: number;
	to: number;
	// a terminating word denotes a word that must terminate a phrase
	// eg. a phrase A B C is impossible if B is terminating, but A B is possible
	terminating: boolean;
}

export abstract class WordParser {
	protected text: string;
	protected textLen: number;

	constructor(text: string) {
		this.text = text;
		this.textLen = text.length;
	}

	abstract nextWord(): WordInfo;
	// Get word separator for the language
	// Some languages may not have any separators, in which case this should return an empty string
	abstract getSeparator(): string;
}
