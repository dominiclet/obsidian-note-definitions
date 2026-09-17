import { CachedMetadata, getFrontMatterInfo, parseYaml } from "obsidian";

export interface FileFrontmatter {
	data: Record<string, unknown> | undefined;
	contentStart: number;
}

/**
 * Read frontmatter from the metadata cache when available, and fall back to
 * the file contents while Obsidian is still warming the cache at startup.
 */
export function readFileFrontmatter(
	fileContent: string,
	cache: CachedMetadata | null,
): FileFrontmatter {
	const info = getFrontMatterInfo(fileContent);
	let data = cache?.frontmatter;
	if (data == null && info.exists) {
		data = parseYaml(info.frontmatter);
	}

	let contentStart = 0;
	if (cache?.frontmatterPosition) {
		contentStart = cache.frontmatterPosition.end.offset + 1;
	} else if (info.exists) {
		contentStart = info.contentStart;
	}

	return { data, contentStart };
}
