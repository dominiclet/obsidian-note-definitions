import { Definition, DefinitionOccurrence, DuplicateDefinition } from "./model";

const normaliseKey = (text: string, caseSensitive: boolean): string => {
	const trimmed = text.trim();
	return caseSensitive ? trimmed : trimmed.toLowerCase();
};

// Detect lookup keys (phrases or aliases) that are declared by more than one
// definition. This mirrors how the definition repo resolves keys at lookup
// time (respecting the case-sensitivity setting), so the reported conflicts are
// exactly the ones that cause a definition to silently shadow another.
//
// Notes:
//   - A key declared multiple times within a single definition (e.g. an alias
//     equal to the phrase, or a generated plural colliding with another alias)
//     is only counted once, so we report genuine cross-entry duplicates.
//   - Auto-generated plurals are included: two distinct words that pluralise to
//     the same term is itself a real collision worth surfacing.
export function findDuplicateDefinitions(
	definitions: Definition[],
	caseSensitive: boolean,
): DuplicateDefinition[] {
	const occurrenceMap = new Map<string, DefinitionOccurrence[]>();

	const register = (key: string, occurrence: DefinitionOccurrence) => {
		const existing = occurrenceMap.get(key);
		if (existing) {
			existing.push(occurrence);
		} else {
			occurrenceMap.set(key, [occurrence]);
		}
	};

	definitions.forEach((def) => {
		const seenKeys = new Set<string>();

		const phraseKey = normaliseKey(def.word, caseSensitive);
		seenKeys.add(phraseKey);
		register(phraseKey, {
			key: phraseKey,
			text: def.word,
			role: "phrase",
			filePath: def.file.path,
			linkText: def.linkText,
			fileType: def.fileType,
			position: def.position,
		});

		def.aliases.forEach((alias) => {
			const aliasKey = normaliseKey(alias, caseSensitive);
			if (!aliasKey || seenKeys.has(aliasKey)) {
				return;
			}
			seenKeys.add(aliasKey);
			register(aliasKey, {
				key: aliasKey,
				text: alias,
				role: "alias",
				filePath: def.file.path,
				linkText: def.linkText,
				fileType: def.fileType,
				position: def.position,
			});
		});
	});

	const duplicates: DuplicateDefinition[] = [];
	occurrenceMap.forEach((occurrences, key) => {
		if (occurrences.length > 1) {
			duplicates.push({ key, occurrences });
		}
	});

	// Stable, predictable ordering for display
	duplicates.sort((a, b) => a.key.localeCompare(b.key));
	return duplicates;
}
