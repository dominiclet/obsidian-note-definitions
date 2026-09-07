import { TFile } from "obsidian";
import { findDuplicateDefinitions } from "src/core/duplicate-def-detector";
import { DefFileType } from "src/core/file-type";
import { Definition } from "src/core/model";

const makeDef = (over: Partial<Definition>): Definition => ({
	key: "",
	word: "",
	aliases: [],
	definition: "",
	file: { path: "a.md" } as TFile,
	linkText: "",
	fileType: DefFileType.Consolidated,
	...over,
});

describe("findDuplicateDefinitions", () => {
	it("returns nothing when every key is unique", () => {
		const defs = [
			makeDef({ word: "Apple", aliases: ["Fruit"] }),
			makeDef({ word: "Banana" }),
		];
		expect(findDuplicateDefinitions(defs, false)).toEqual([]);
	});

	it("flags the same phrase declared in two different files", () => {
		const defs = [
			makeDef({ word: "API", file: { path: "a.md" } as TFile }),
			makeDef({ word: "API", file: { path: "b.md" } as TFile }),
		];
		const dups = findDuplicateDefinitions(defs, false);
		expect(dups).toHaveLength(1);
		expect(dups[0].key).toBe("api");
		expect(dups[0].occurrences.map((o) => o.filePath)).toEqual([
			"a.md",
			"b.md",
		]);
	});

	it("treats case-variant terms as a conflict only when case-insensitive", () => {
		const defs = [makeDef({ word: "API" }), makeDef({ word: "api" })];
		expect(findDuplicateDefinitions(defs, false)).toHaveLength(1);
		expect(findDuplicateDefinitions(defs, true)).toEqual([]);
	});

	it("detects a term that is a phrase in one entry and an alias in another", () => {
		const defs = [
			makeDef({ word: "ML" }),
			makeDef({ word: "Machine Learning", aliases: ["ML"] }),
		];
		const dups = findDuplicateDefinitions(defs, false);
		expect(dups).toHaveLength(1);
		expect(dups[0].occurrences.map((o) => o.role)).toEqual([
			"phrase",
			"alias",
		]);
	});

	it("does not flag a definition whose alias repeats its own phrase", () => {
		const defs = [makeDef({ word: "Cat", aliases: ["cat", "Cat"] })];
		expect(findDuplicateDefinitions(defs, false)).toEqual([]);
	});

	it("marks occurrences within a single file", () => {
		const defs = [
			makeDef({ word: "Term", file: { path: "same.md" } as TFile }),
			makeDef({
				word: "Other",
				aliases: ["Term"],
				file: { path: "same.md" } as TFile,
			}),
		];
		const dups = findDuplicateDefinitions(defs, false);
		expect(dups).toHaveLength(1);
		expect(dups[0].occurrences.every((o) => o.filePath === "same.md")).toBe(
			true,
		);
	});
});
