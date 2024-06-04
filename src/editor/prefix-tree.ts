
// Prefix tree node
export class PTreeNode {
	children: Map<string, PTreeNode>;
	wordEnd: boolean;

	constructor() {
		this.children = new Map<string, PTreeNode>();
		this.wordEnd = false;
	}

	add(word: string, ptr: number) {
		if (ptr === word.length) {
			this.wordEnd = true;
			return;
		}
		const currChar = word.charAt(ptr);
		let nextNode;
		nextNode = this.children.get(currChar);
		if (!nextNode) {
			nextNode = new PTreeNode();
			this.children.set(currChar, nextNode);
		}
		nextNode.add(word, ++ptr);
	}
}

// A traverser implementation to traverse the prefix tree and keep track of states
export class PTreeTraverser {
	currPtr?: PTreeNode;
	wordBuf: Array<string>;

	constructor(root: PTreeNode) {
		this.currPtr = root;
		this.wordBuf = [];
	}

	gotoNext(c: string) {
		if (!this.currPtr) {
			return;
		}
		const nextNode = this.currPtr.children.get(c);
		// This will set currPtr to undefined if there is no next node
		// This marks the traverser as garbage to be collected
		this.currPtr = nextNode;
		this.wordBuf.push(c);
	}

	isWordEnd() {
		if (!this.currPtr) {
			return false;
		}
		return this.currPtr.wordEnd;
	}

	getWord() {
		return this.wordBuf.join('');
	}
}

