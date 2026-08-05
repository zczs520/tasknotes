import { FilterUtils } from "./FilterUtils";
import type { HideIdentifyingTagsMode } from "../types/settings";

interface TaskTagFilteringSettings {
	taskIdentificationMethod: string;
	taskTag: string;
	hideIdentifyingTagsInCards?: boolean;
	hideIdentifyingTagsMode?: HideIdentifyingTagsMode;
}

export function normalizeTagName(tag: string): string {
	const trimmed = tag.trim();
	return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
}

/**
 * Merge the task index's tags with Obsidian's vault-wide tag index.
 *
 * The task index only contains tags already used by TaskNotes tasks, while
 * MetadataCache#getTags also contains tags from ordinary Markdown notes. The
 * latter uses leading hashes, which task form values intentionally omit.
 */
export function mergeTaskModalTagSuggestionSources(
	taskTags: readonly string[],
	vaultTagCounts: Readonly<Record<string, number>> = {}
): string[] {
	const mergedTags = new Map<string, string>();

	const addTag = (tag: string): void => {
		const normalized = normalizeTagName(tag);
		if (!normalized) return;

		const dedupeKey = normalized.toLocaleLowerCase();
		if (!mergedTags.has(dedupeKey)) {
			mergedTags.set(dedupeKey, normalized);
		}
	};

	for (const tag of taskTags) {
		if (typeof tag === "string") addTag(tag);
	}
	for (const tag of Object.keys(vaultTagCounts)) {
		addTag(tag);
	}

	return Array.from(mergedTags.values());
}

export function isExactTaskIdentificationTag(tag: string, taskTag: string): boolean {
	const normalizedTag = normalizeTagName(tag);
	const normalizedTaskTag = normalizeTagName(taskTag);
	if (!normalizedTag || !normalizedTaskTag) return false;
	return normalizedTag.toLowerCase() === normalizedTaskTag.toLowerCase();
}

export function isTaskIdentificationTag(
	tag: string,
	taskTag: string,
	mode: HideIdentifyingTagsMode = "all"
): boolean {
	const normalizedTag = normalizeTagName(tag);
	const normalizedTaskTag = normalizeTagName(taskTag);
	if (mode === "exact-only") {
		return isExactTaskIdentificationTag(normalizedTag, normalizedTaskTag);
	}
	return FilterUtils.matchesHierarchicalTagExact(normalizedTag, normalizedTaskTag);
}

export function filterTaskIdentificationTags(
	tags: readonly string[],
	taskTag: string,
	mode: HideIdentifyingTagsMode = "all"
): string[] {
	return tags.filter((tag) => !isTaskIdentificationTag(tag, taskTag, mode));
}

export function shouldHideTaskIdentificationTags(settings: TaskTagFilteringSettings): boolean {
	return (
		settings.taskIdentificationMethod === "tag" &&
		Boolean(settings.hideIdentifyingTagsInCards) &&
		Boolean(settings.taskTag)
	);
}

export function filterTagsForTaskModalSuggestions(
	tags: readonly string[],
	settings: TaskTagFilteringSettings
): string[] {
	if (!shouldHideTaskIdentificationTags(settings)) {
		return [...tags];
	}

	return filterTaskIdentificationTags(tags, settings.taskTag, settings.hideIdentifyingTagsMode);
}

export function appendMissingTaskIdentificationTags(
	tags: readonly string[],
	existingTags: readonly string[],
	taskTag: string,
	mode: HideIdentifyingTagsMode = "all"
): string[] {
	const nextTags = [...tags];
	const identifyingTags = existingTags
		.filter((tag) => isTaskIdentificationTag(tag, taskTag, mode))
		.map(normalizeTagName);
	const tagsToPreserve = identifyingTags.length > 0 ? identifyingTags : [normalizeTagName(taskTag)];

	for (const tag of tagsToPreserve) {
		if (!tag) continue;
		if (!nextTags.some((existingTag) => normalizeTagName(existingTag) === tag)) {
			nextTags.push(tag);
		}
	}

	return nextTags;
}
