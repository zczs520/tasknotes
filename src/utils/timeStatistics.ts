import type { Day } from "date-fns";
import type { TaskInfo } from "../types";

export type TimeStatisticsDimension = "tasks" | "tags";
export type TimeStatisticsPeriod = "day" | "week" | "month" | "year";

export interface TimeStatisticsRange {
	start: Date;
	end: Date;
}

export interface TimeStatisticsSegment {
	taskPath: string;
	taskTitle: string;
	tags: string[];
	start: Date;
	end: Date;
	durationMs: number;
	sessionKey: string;
	isActive: boolean;
}

export interface TagTimeStatistic {
	tag: string | null;
	durationMs: number;
	taskPaths: string[];
}

export interface TaskTimeStatistic {
	taskPath: string;
	taskTitle: string;
	tags: string[];
	durationMs: number;
	isActive: boolean;
}

export interface DailyTimeStatistic {
	date: Date;
	durationMs: number;
	segments: TimeStatisticsSegment[];
}

export function formatTimeStatisticsDuration(durationMs: number, isChinese: boolean): string {
	const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
	if (totalMinutes < 1) return isChinese ? "少于1分钟" : "<1m";
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (isChinese) {
		return hours > 0 ? `${hours}小时${minutes > 0 ? `${minutes}分` : ""}` : `${minutes}分`;
	}
	return hours > 0 ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}` : `${minutes}m`;
}

function isValidDate(date: Date): boolean {
	return Number.isFinite(date.getTime());
}

function parseTimestamp(value: string | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return isValidDate(date) ? date : null;
}

function normalizeWeekStartsOn(value: number): Day {
	return Number.isInteger(value) && value >= 0 && value <= 6 ? (value as Day) : 0;
}

function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCalendarDays(date: Date, amount: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + amount);
	return next;
}

export function getTimeStatisticsRange(
	referenceDate: Date,
	period: TimeStatisticsPeriod,
	weekStartsOn = 0
): TimeStatisticsRange {
	switch (period) {
		case "day": {
			const start = startOfLocalDay(referenceDate);
			return { start, end: addCalendarDays(start, 1) };
		}
		case "week": {
			const start = startOfLocalDay(referenceDate);
			const normalizedFirstDay = normalizeWeekStartsOn(weekStartsOn);
			const daysSinceWeekStart = (start.getDay() - normalizedFirstDay + 7) % 7;
			start.setDate(start.getDate() - daysSinceWeekStart);
			return { start, end: addCalendarDays(start, 7) };
		}
		case "month": {
			const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
			return {
				start,
				end: new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1),
			};
		}
		case "year": {
			const start = new Date(referenceDate.getFullYear(), 0, 1);
			return { start, end: new Date(referenceDate.getFullYear() + 1, 0, 1) };
		}
	}
}

export function shiftTimeStatisticsReference(
	referenceDate: Date,
	period: TimeStatisticsPeriod,
	amount: number
): Date {
	switch (period) {
		case "day":
			return addCalendarDays(referenceDate, amount);
		case "week":
			return addCalendarDays(referenceDate, amount * 7);
		case "month":
			return new Date(referenceDate.getFullYear(), referenceDate.getMonth() + amount, 1);
		case "year":
			return new Date(referenceDate.getFullYear() + amount, 0, 1);
	}
}

export function isCurrentTimeStatisticsPeriod(
	referenceDate: Date,
	period: TimeStatisticsPeriod,
	now: Date,
	weekStartsOn = 0
): boolean {
	const referenceRange = getTimeStatisticsRange(referenceDate, period, weekStartsOn);
	const currentRange = getTimeStatisticsRange(now, period, weekStartsOn);
	return referenceRange.start.getTime() === currentRange.start.getTime();
}

function splitClippedEntryByDay(
	task: TaskInfo,
	entryIndex: number,
	start: Date,
	end: Date,
	isActive: boolean
): TimeStatisticsSegment[] {
	const segments: TimeStatisticsSegment[] = [];
	let cursor = new Date(start);

	while (cursor.getTime() < end.getTime()) {
		const nextDay = addCalendarDays(startOfLocalDay(cursor), 1);
		const segmentEnd = new Date(Math.min(end.getTime(), nextDay.getTime()));
		const durationMs = segmentEnd.getTime() - cursor.getTime();

		if (durationMs > 0) {
			segments.push({
				taskPath: task.path,
				taskTitle: task.title,
				tags: [...new Set((task.tags ?? []).filter(Boolean))],
				start: new Date(cursor),
				end: segmentEnd,
				durationMs,
				sessionKey: `${task.path}:${entryIndex}`,
				isActive,
			});
		}

		cursor = segmentEnd;
	}

	return segments;
}

export function buildTimeStatisticsSegments(
	tasks: readonly TaskInfo[],
	range: TimeStatisticsRange,
	now: Date = new Date()
): TimeStatisticsSegment[] {
	const segments: TimeStatisticsSegment[] = [];
	const rangeStartMs = range.start.getTime();
	const rangeEndMs = range.end.getTime();

	for (const task of tasks) {
		for (const [entryIndex, entry] of (task.timeEntries ?? []).entries()) {
			const entryStart = parseTimestamp(entry.startTime);
			if (!entryStart) continue;

			const entryEnd = parseTimestamp(entry.endTime) ?? now;
			if (!isValidDate(entryEnd) || entryEnd.getTime() <= entryStart.getTime()) continue;

			const clippedStartMs = Math.max(entryStart.getTime(), rangeStartMs);
			const clippedEndMs = Math.min(entryEnd.getTime(), rangeEndMs);
			if (clippedEndMs <= clippedStartMs) continue;

			segments.push(
				...splitClippedEntryByDay(
					task,
					entryIndex,
					new Date(clippedStartMs),
					new Date(clippedEndMs),
					!entry.endTime
				)
			);
		}
	}

	return segments.sort(
		(left, right) =>
			left.start.getTime() - right.start.getTime() ||
			left.taskTitle.localeCompare(right.taskTitle)
	);
}

export function calculateTimeStatisticsTotal(segments: readonly TimeStatisticsSegment[]): number {
	return segments.reduce((total, segment) => total + segment.durationMs, 0);
}

export function calculateUniqueTimeStatisticsTotal(
	segments: readonly TimeStatisticsSegment[]
): number {
	const intervals = segments
		.map((segment) => ({ start: segment.start.getTime(), end: segment.end.getTime() }))
		.filter(
			(interval) =>
				Number.isFinite(interval.start) &&
				Number.isFinite(interval.end) &&
				interval.end > interval.start
		)
		.sort((left, right) => left.start - right.start || left.end - right.end);

	let totalMs = 0;
	let mergedStart = 0;
	let mergedEnd = 0;

	for (const [index, interval] of intervals.entries()) {
		if (index === 0) {
			mergedStart = interval.start;
			mergedEnd = interval.end;
			continue;
		}

		if (interval.start <= mergedEnd) {
			mergedEnd = Math.max(mergedEnd, interval.end);
			continue;
		}

		totalMs += mergedEnd - mergedStart;
		mergedStart = interval.start;
		mergedEnd = interval.end;
	}

	return intervals.length > 0 ? totalMs + mergedEnd - mergedStart : 0;
}

export function buildTagTimeStatistics(
	segments: readonly TimeStatisticsSegment[]
): TagTimeStatistic[] {
	const aggregates = new Map<
		string,
		{ tag: string | null; durationMs: number; taskPaths: Set<string> }
	>();

	for (const segment of segments) {
		const tags = segment.tags.length > 0 ? segment.tags : [null];

		for (const tag of tags) {
			const key = tag ?? "__tasknotes_untagged__";
			const aggregate = aggregates.get(key) ?? {
				tag,
				durationMs: 0,
				taskPaths: new Set<string>(),
			};
			aggregate.durationMs += segment.durationMs;
			aggregate.taskPaths.add(segment.taskPath);
			aggregates.set(key, aggregate);
		}
	}

	return [...aggregates.values()]
		.map((aggregate) => ({
			tag: aggregate.tag,
			durationMs: aggregate.durationMs,
			taskPaths: [...aggregate.taskPaths],
		}))
		.sort(
			(left, right) =>
				right.durationMs - left.durationMs ||
				(left.tag ?? "").localeCompare(right.tag ?? "")
		);
}

export function buildTaskTimeStatistics(
	segments: readonly TimeStatisticsSegment[]
): TaskTimeStatistic[] {
	const aggregates = new Map<string, TaskTimeStatistic>();

	for (const segment of segments) {
		const aggregate = aggregates.get(segment.taskPath) ?? {
			taskPath: segment.taskPath,
			taskTitle: segment.taskTitle,
			tags: segment.tags,
			durationMs: 0,
			isActive: false,
		};
		aggregate.durationMs += segment.durationMs;
		aggregate.isActive ||= segment.isActive;
		aggregates.set(segment.taskPath, aggregate);
	}

	return [...aggregates.values()].sort(
		(left, right) =>
			right.durationMs - left.durationMs || left.taskTitle.localeCompare(right.taskTitle)
	);
}

export function buildDailyTimeStatistics(
	segments: readonly TimeStatisticsSegment[],
	range: TimeStatisticsRange
): DailyTimeStatistic[] {
	const segmentsByDay = new Map<string, TimeStatisticsSegment[]>();
	for (const segment of segments) {
		const key = startOfLocalDay(segment.start).getTime().toString();
		const daySegments = segmentsByDay.get(key) ?? [];
		daySegments.push(segment);
		segmentsByDay.set(key, daySegments);
	}

	const days: DailyTimeStatistic[] = [];
	for (
		let date = startOfLocalDay(range.start);
		date.getTime() < range.end.getTime();
		date = addCalendarDays(date, 1)
	) {
		const daySegments = segmentsByDay.get(date.getTime().toString()) ?? [];
		days.push({
			date: new Date(date),
			durationMs: calculateTimeStatisticsTotal(daySegments),
			segments: daySegments,
		});
	}

	return days;
}

export function calculateAverageTimePerActiveDay(
	segments: readonly TimeStatisticsSegment[]
): number {
	const activeDays = new Set(segments.map((segment) => startOfLocalDay(segment.start).getTime()))
		.size;
	return activeDays > 0 ? calculateTimeStatisticsTotal(segments) / activeDays : 0;
}
