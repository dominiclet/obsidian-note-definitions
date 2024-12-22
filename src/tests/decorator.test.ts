import { scanText } from "src/editor/decoration";
import { PhraseInfo } from "src/editor/definition-search";
import { PTreeNode } from "src/editor/prefix-tree";


const pTree = new PTreeNode();
pTree.add("word1");
pTree.add("word2");
pTree.add("a phrase");
pTree.add("a long phrase");
pTree.add("long");

test('Defined words are correctly detected in a simple sentence', () => {
	const text = 'Hi this is a simple sentence with word1, word2 and a phrase defined.';
	const phraseInfo = scanText(text, 0, pTree);
	const expectedPhraseInfo: PhraseInfo[] = [
		{
			from: 34,
			to: 39,
			phrase: 'word1'
		},
		{
			from: 41,
			to: 46,
			phrase: 'word2'
		},
		{
			from: 51,
			to: 59,
			phrase: 'a phrase'
		}
	];
	expect(phraseInfo).toStrictEqual(expectedPhraseInfo);
});

test('Defined words are correctly detected in a paragraph', () => {
	const text = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
Ut enim ad minim veniam, word1 quis nostrud exercitation ullamco laboris nisi word2 ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in a phrase voluptate velit esse cillum dolore eu fugiat nulla pariatur. 
Excepteur sint occaecat cupidatat non proident, sunt word2 in culpa qui officia deserunt mollit anim id word1 est laborum`;

	const phraseInfo = scanText(text, 0, pTree);
	const expectedPhraseInfo = [
		{ phrase: 'word1', from: 150, to: 155 },
		{ phrase: 'word2', from: 203, to: 208 },
		{ phrase: 'a phrase', from: 287, to: 295 },
		{ phrase: 'word2', from: 411, to: 416 },
		{ phrase: 'word1', from: 462, to: 467 }
	];

	expect(phraseInfo).toStrictEqual(expectedPhraseInfo);
});

test('Offset is correctly added to positions', () => {
	const text = 'Hi this is a simple sentence with word1, word2 and a phrase defined.';
	const phraseInfo = scanText(text, 2, pTree);
	const expectedPhraseInfo: PhraseInfo[] = [
		{
			from: 36,
			to: 41,
			phrase: 'word1'
		},
		{
			from: 43,
			to: 48,
			phrase: 'word2'
		},
		{
			from: 53,
			to: 61,
			phrase: 'a phrase'
		}
	];
	expect(phraseInfo).toStrictEqual(expectedPhraseInfo);
});

test('Definitions that are a subset of another are detected correctly. The longer definition is preferred.', () => {
	const text = 'Although longer definitions are preferred in a long phrase. The long word should still be normally detected';
	const phraseInfo = scanText(text, 0, pTree);
	const expectedPhraseInfo = [
		{ phrase: 'a long phrase', from: 45, to: 58 },
		{ phrase: 'long', from: 64, to: 68 }
	];
	expect(phraseInfo).toStrictEqual(expectedPhraseInfo);
});
