import { WordInfo, WordParser } from "./word-parser";


export class ZhWordParser extends WordParser {
	// Pointer to next char to read
	private charPtr: number;

	readonly cnCharRegex = /\p{Script=Han}/u;

	constructor(text: string) {
		super(text);
		this.charPtr = 0;
	}

	nextWord(): WordInfo {
		while (true) {
			if (this.charPtr > this.textLen - 1) {
				break;
			}
			const currPtr = this.charPtr;
			const c = this.text.charAt(this.charPtr++);
			if (this.cnCharRegex.test(c)) {
				return {
					word: c,
					from: currPtr,
					to: currPtr,
					terminating: !this.cnCharRegex.test(this.text.charAt(this.charPtr)),
				}
			}
		}
		throw new Error("End of text chunk");
	}

	getSeparator(): string {
		return '';
	}
}
