import { CachedMetadata } from "obsidian";
import { readFileFrontmatter } from "src/util/frontmatter";

describe("readFileFrontmatter", () => {
	it("parses YAML flow arrays, quoted colons and multiline values without a cache", () => {
		const content =
			'---\naliases: ["one: two", second]\ndescription: |\n  first line\n  second line\n---\nBody';
		const result = readFileFrontmatter(content, null);
		expect(result.data).toEqual({
			aliases: ["one: two", "second"],
			description: "first line\nsecond line\n",
		});
		expect(content.slice(result.contentStart)).toBe("Body");
	});

	it("prefers cached data and cached offsets", () => {
		const cache = {
			frontmatter: { aliases: ["cached"] },
			frontmatterPosition: {
				start: { line: 0, col: 0, offset: 0 },
				end: { line: 1, col: 0, offset: 6 },
			},
		} as CachedMetadata;
		expect(
			readFileFrontmatter("---\naliases: [file]\n---\nBody", cache),
		).toEqual({ data: cache.frontmatter, contentStart: 7 });
	});

	it("leaves plain markdown intact", () => {
		expect(readFileFrontmatter("Body", null)).toEqual({
			data: undefined,
			contentStart: 0,
		});
	});

	it("supports CRLF frontmatter", () => {
		const content = "---\r\ndef-type: atomic\r\n---\r\nBody";
		const result = readFileFrontmatter(content, null);
		expect(result.data).toEqual({ "def-type": "atomic" });
		expect(content.slice(result.contentStart)).toBe("Body");
	});

	it("surfaces malformed YAML", () => {
		expect(() =>
			readFileFrontmatter("---\naliases: [unterminated\n---\nBody", null),
		).toThrow();
	});
});
