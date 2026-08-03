import type { TaskInfo } from "../types";

export type KanbanTimeFilterField = "scheduled" | "created" | "completed";
export type KanbanTimeFilterPreset = "this-week" | "last-week" | "all" | "custom";

export interface KanbanTimeFilterState {
	field: KanbanTimeFilterField;
	preset: KanbanTimeFilterPreset;
	customStart?: string;
	customEnd?: string;
}

export interface KanbanTimeRange {
	start: Date | null;
	endExclusive: Date | null;
}

export type TaskCreatedTimeFallback = (task: TaskInfo) => Date | null;

export const KANBAN_TIME_FILTER_CONFIG_KEYS = {
	field: "timeFilterField",
	preset: "timeFilterPreset",
	customStart: "timeFilterStart",
	customEnd: "timeFilterEnd",
} as const;

export const KANBAN_TIME_FILTER_LEGACY_CONFIG_KEYS = {
	preset: "createdTimeFilterPreset",
	customStart: "createdTimeFilterStart",
	customEnd: "createdTimeFilterEnd",
} as const;

export function normalizeKanbanTimeFilterField(value: unknown): KanbanTimeFilterField {
	return value === "created" || value === "completed" ? value : "scheduled";
}

export function normalizeKanbanTimeFilterPreset(value: unknown): KanbanTimeFilterPreset {
	return value === "last-week" || value === "all" || value === "custom" ? value : "this-week";
}

function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

function startOfLocalWeek(date: Date): Date {
	const start = startOfLocalDay(date);
	const daysSinceMonday = (start.getDay() + 6) % 7;
	return addLocalDays(start, -daysSinceMonday);
}

export function parseLocalDateInput(value: string | undefined): Date | null {
	if (!value) return null;
	const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;

	const year = Number(match[1]);
	const monthIndex = Number(match[2]) - 1;
	const day = Number(match[3]);
	const parsed = new Date(year, monthIndex, day);
	if (
		parsed.getFullYear() !== year ||
		parsed.getMonth() !== monthIndex ||
		parsed.getDate() !== day
	) {
		return null;
	}
	return parsed;
}

export function parseTaskFilterTime(value: string | undefined): Date | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
		const zoned = new Date(trimmed);
		return Number.isNaN(zoned.getTime()) ? null : zoned;
	}

	const localMatch = trimmed.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
	);
	if (!localMatch) {
		const parsed = new Date(trimmed);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	const year = Number(localMatch[1]);
	const monthIndex = Number(localMatch[2]) - 1;
	const day = Number(localMatch[3]);
	const hours = Number(localMatch[4] ?? 0);
	const minutes = Number(localMatch[5] ?? 0);
	const seconds = Number(localMatch[6] ?? 0);
	const milliseconds = Number((localMatch[7] ?? "").padEnd(3, "0") || 0);
	const parsed = new Date(year, monthIndex, day, hours, minutes, seconds, milliseconds);
	if (
		parsed.getFullYear() !== year ||
		parsed.getMonth() !== monthIndex ||
		parsed.getDate() !== day ||
		parsed.getHours() !== hours ||
		parsed.getMinutes() !== minutes ||
		parsed.getSeconds() !== seconds
	) {
		return null;
	}
	return parsed;
}

export function getKanbanTimeRange(
	state: Pick<KanbanTimeFilterState, "preset" | "customStart" | "customEnd">,
	now = new Date()
): KanbanTimeRange {
	if (state.preset === "all") {
		return { start: null, endExclusive: null };
	}

	const thisWeekStart = startOfLocalWeek(now);
	if (state.preset === "this-week") {
		return {
			start: thisWeekStart,
			endExclusive: addLocalDays(thisWeekStart, 7),
		};
	}

	if (state.preset === "last-week") {
		return {
			start: addLocalDays(thisWeekStart, -7),
			endExclusive: thisWeekStart,
		};
	}

	const start = parseLocalDateInput(state.customStart);
	const inclusiveEnd = parseLocalDateInput(state.customEnd);
	return {
		start,
		endExclusive: inclusiveEnd ? addLocalDays(inclusiveEnd, 1) : null,
	};
}

export function getTaskTimeForKanbanFilter(
	task: TaskInfo,
	field: KanbanTimeFilterField,
	createdTimeFallback?: TaskCreatedTimeFallback
): Date | null {
	if (field === "scheduled") {
		return parseTaskFilterTime(task.scheduled);
	}
	if (field === "completed") {
		return parseTaskFilterTime(task.completedDate);
	}
	return parseTaskFilterTime(task.dateCreated) ?? createdTimeFallback?.(task) ?? null;
}

export function filterKanbanTasksByTime(
	tasks: readonly TaskInfo[],
	state: KanbanTimeFilterState,
	now = new Date(),
	createdTimeFallback?: TaskCreatedTimeFallback
): TaskInfo[] {
	const range = getKanbanTimeRange(state, now);
	if (!range.start && !range.endExclusive) {
		return [...tasks];
	}

	return tasks.filter((task) => {
		const taskTime = getTaskTimeForKanbanFilter(task, state.field, createdTimeFallback);
		if (!taskTime || Number.isNaN(taskTime.getTime())) {
			return false;
		}
		if (range.start && taskTime < range.start) {
			return false;
		}
		if (range.endExclusive && taskTime >= range.endExclusive) {
			return false;
		}
		return true;
	});
}

export function validateKanbanCustomDateRange(start: string, end: string): boolean {
	const parsedStart = parseLocalDateInput(start);
	const parsedEnd = parseLocalDateInput(end);
	return Boolean(parsedStart && parsedEnd && parsedStart <= parsedEnd);
}
