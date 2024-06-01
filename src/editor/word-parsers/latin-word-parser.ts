import { WordInfo, WordParser } from "./word-parser";


// Word parser for languages using latin characters
// Only tested on English (not guaranteed to work properly with other languages)
export class LatinWordParser extends WordParser {
	// Pointer to next char to read
	private charPtr: number;

	readonly alphabetRegex = /^[a-zA-Z]+$/;
	// terminating chars mark the end of a word
	readonly terminatingCharRegex = /[!@#$%^&*()\+={}[\]:;"'<>,.?\/|\\\r\n ]/;

	constructor(text: string) {
		super(text);
		this.charPtr = 0;
	}

	nextWord(): WordInfo {
		let wordBuf: string[] = [];
		let startPtr: number = 0;

		while (true) {
			if (this.charPtr > this.textLen - 1) {
				break;
			}
			const currPtr = this.charPtr;
			const c = this.text.charAt(this.charPtr++);
			if (wordBuf.length === 0 && this.alphabetRegex.test(c)) {
				// start of word
				startPtr = currPtr;
				wordBuf.push(c);
				continue;
			}
			if (wordBuf.length > 0 && this.terminatingCharRegex.test(c)) {
				// word found
				const word = wordBuf.join('');

				return {
					word: word,
					from: startPtr,
					to: startPtr + word.length,
					terminating: c !== ' ' || !this.alphabetRegex.test(this.text.charAt(this.charPtr)),
				};
			}
			if (wordBuf.length > 0) {
				wordBuf.push(c);
			}
		}

		// This is the final word of the text chunk
		if (wordBuf.length > 0) {
			const word = wordBuf.join('');
			return {
				word: word,
				from: startPtr,
				to: startPtr + word.length,
				terminating: true
			}
		}
		throw new Error("End of text chunk");
	}

	getSeparator(): string {
		return ' ';
	}
}
