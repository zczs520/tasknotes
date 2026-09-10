import type { TaskInfo } from "../../types";
import type { TaskNotesSettings } from "../../types/settings";
import { getCurrentDateString, getCurrentTimestamp } from "../../utils/dateUtils";
import { stringifyUnknownArray } from "../../utils/stringUtils";

type CurrentNoteConversionSettings = Pick<
	TaskNotesSettings,
	"defaultTaskStatus" | "defaultTaskPriority"
>;

export interface CurrentNoteConversionInput {
	path: string;
	basename: string;
	content: string;
	frontmatter?: Record<string, unknown>;
	documentTags?: readonly string[];
	inlineTagRanges?: readonly MarkdownSourceRange[];
	settings: CurrentNoteConversionSettings;
	now?: string;
	today?: string;
}

export interface MarkdownSourceRange {
	start: number;
	end: number;
}

export function buildCurrentNoteConversionTaskInfo({
	path,
	basename,
	content,
	frontmatter = {},
	documentTags = [],
	inlineTagRanges = [],
	settings,
	now = getCurrentTimestamp(),
	today = getCurrentDateString(),
}: CurrentNoteConversionInput): TaskInfo {
	return {
		path,
		title: frontmatterString(frontmatter.title) || basename,
		status: frontmatterString(frontmatter.status) ?? settings.defaultTaskStatus,
		priority: frontmatterString(frontmatter.priority) ?? settings.defaultTaskPriority,
		archived: false,
		due: frontmatterString(frontmatter.due),
		scheduled: frontmatterString(frontmatter.scheduled) || today,
		contexts: frontmatterStringArray(frontmatter.contexts),
		projects: frontmatterStringArray(frontmatter.projects),
		tags: mergeUniqueStrings(frontmatterStringArray(frontmatter.tags), documentTags),
		timeEstimate: frontmatterNumber(frontmatter.timeEstimate),
		recurrence: frontmatterString(frontmatter.recurrence),
		dateCreated: frontmatterString(frontmatter.dateCreated) || now,
		dateModified: now,
		details: extractMarkdownBodyAfterFrontmatter(
			removeMarkdownSourceRanges(content, inlineTagRanges)
		),
	};
}

function mergeUniqueStrings(
	frontmatterValues: string[] | undefined,
	documentValues: readonly string[]
): string[] {
	return [...new Set([...(frontmatterValues ?? []), ...documentValues].filter(Boolean))];
}

export function removeMarkdownSourceRanges(
	content: string,
	ranges: readonly MarkdownSourceRange[]
): string {
	let result = content;
	const validRanges = ranges
		.filter(
			(range) =>
				Number.isInteger(range.start) &&
				Number.isInteger(range.end) &&
				range.start >= 0 &&
				range.end > range.start &&
				range.end <= content.length
		)
		.sort((left, right) => right.start - left.start);

	for (const range of validRanges) {
		result = result.slice(0, range.start) + result.slice(range.end);
	}

	return result;
}

export function extractMarkdownBodyAfterFrontmatter(content: string): string {
	const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n*/);
	if (frontmatterMatch) {
		return content.slice(frontmatterMatch[0].length).trim();
	}

	return content.trim();
}

function frontmatterString(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function frontmatterStringArray(value: unknown): string[] | undefined {
	if (value === null || value === undefined) return undefined;
	return stringifyUnknownArray(value);
}

function frontmatterNumber(value: unknown): number | undefined {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}
