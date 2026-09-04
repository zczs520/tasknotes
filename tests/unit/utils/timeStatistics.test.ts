import {
	buildDailyTimeStatistics,
	buildTagTimeStatistics,
	buildTaskTimeStatistics,
	buildTimeStatisticsSegments,
	calculateAverageTimePerActiveDay,
	calculateTimeStatisticsTotal,
	calculateUniqueTimeStatisticsTotal,
	formatTimeStatisticsDuration,
	getTimeStatisticsRange,
	isCurrentTimeStatisticsPeriod,
	shiftTimeStatisticsReference,
} from "../../../src/utils/timeStatistics";
import type { TaskInfo } from "../../../src/types";
import {
	DAY_TIMELINE_END_HOUR,
	DAY_TIMELINE_START_HOUR,
	getDayTimelineEndMinute,
} from "../../../src/bases/TimeStatisticsView";

function createTask(overrides: Partial<TaskInfo>): TaskInfo {
	return {
		title: "Task",
		status: "open",
		priority: "normal",
		path: "Tasks/task.md",
		archived: false,
		...overrides,
	};
}

describe("time statistics", () => {
	it("shows the day timeline from 08:00 through midnight", () => {
		expect(DAY_TIMELINE_START_HOUR).toBe(8);
		expect(DAY_TIMELINE_END_HOUR).toBe(24);
		expect(
			getDayTimelineEndMinute({
				taskPath: "Tasks/late.md",
				taskTitle: "Late task",
				tags: [],
				start: new Date(2026, 6, 31, 23, 30),
				end: new Date(2026, 7, 1, 0, 0),
				durationMs: 30 * 60_000,
				sessionKey: "late:0",
				isActive: false,
			})
		).toBe(24 * 60);
	});

	it("keeps long durations in hours", () => {
		expect(formatTimeStatisticsDuration(23.5 * 60 * 60_000, true)).toBe("23小时30分");
		expect(formatTimeStatisticsDuration(24 * 60 * 60_000, true)).toBe("24小时");
		expect(formatTimeStatisticsDuration(36.5 * 60 * 60_000, true)).toBe("36小时30分");
		expect(formatTimeStatisticsDuration(30 * 24 * 60 * 60_000, true)).toBe("720小时");
		expect(formatTimeStatisticsDuration(45 * 24 * 60 * 60_000, false)).toBe("1080h");
	});

	it("uses calendar-aligned day, week, month, and year ranges", () => {
		const reference = new Date(2026, 6, 31, 14, 30);

		expect(getTimeStatisticsRange(reference, "day").start).toEqual(new Date(2026, 6, 31, 0, 0));
		expect(getTimeStatisticsRange(reference, "week", 1).start).toEqual(
			new Date(2026, 6, 27, 0, 0)
		);
		expect(getTimeStatisticsRange(reference, "month").start).toEqual(
			new Date(2026, 6, 1, 0, 0)
		);
		expect(getTimeStatisticsRange(reference, "year").start).toEqual(new Date(2026, 0, 1, 0, 0));
	});

	it("moves by the selected calendar period", () => {
		const reference = new Date(2026, 6, 31, 12);

		expect(shiftTimeStatisticsReference(reference, "day", -1)).toEqual(
			new Date(2026, 6, 30, 12)
		);
		expect(shiftTimeStatisticsReference(reference, "week", -1)).toEqual(
			new Date(2026, 6, 24, 12)
		);
		expect(shiftTimeStatisticsReference(reference, "month", -1)).toEqual(new Date(2026, 5, 1));
		expect(shiftTimeStatisticsReference(reference, "year", -1)).toEqual(new Date(2025, 0, 1));
	});

	it("clips sessions to the selected range and splits sessions at midnight", () => {
		const task = createTask({
			timeEntries: [
				{
					startTime: "2026-07-30T23:30:00",
					endTime: "2026-07-31T01:30:00",
				},
				{
					startTime: "2026-07-31T23:30:00",
					endTime: "2026-08-01T01:30:00",
				},
			],
		});
		const range = getTimeStatisticsRange(new Date(2026, 6, 31), "day");
		const segments = buildTimeStatisticsSegments([task], range);

		expect(segments).toHaveLength(2);
		expect(segments.map((segment) => segment.durationMs / 60_000)).toEqual([90, 30]);
		expect(calculateTimeStatisticsTotal(segments)).toBe(120 * 60_000);
	});

	it("uses now for active sessions and ignores malformed or negative sessions", () => {
		const task = createTask({
			timeEntries: [
				{ startTime: "2026-07-31T10:00:00" },
				{ startTime: "not-a-date", endTime: "2026-07-31T12:00:00" },
				{
					startTime: "2026-07-31T13:00:00",
					endTime: "2026-07-31T12:00:00",
				},
			],
		});
		const range = getTimeStatisticsRange(new Date(2026, 6, 31), "day");
		const segments = buildTimeStatisticsSegments([task], range, new Date(2026, 6, 31, 10, 45));

		expect(segments).toHaveLength(1);
		expect(segments[0].durationMs).toBe(45 * 60_000);
		expect(segments[0].isActive).toBe(true);
	});

	it("counts overlapping task sessions only once in the unique total", () => {
		const tasks = [
			createTask({
				path: "Tasks/alpha.md",
				timeEntries: [{ startTime: "2026-07-31T13:00:00", endTime: "2026-07-31T14:00:00" }],
			}),
			createTask({
				path: "Tasks/beta.md",
				timeEntries: [{ startTime: "2026-07-31T13:00:00", endTime: "2026-07-31T14:00:00" }],
			}),
			createTask({
				path: "Tasks/gamma.md",
				timeEntries: [{ startTime: "2026-07-31T13:00:00", endTime: "2026-07-31T14:00:00" }],
			}),
			createTask({
				path: "Tasks/delta.md",
				timeEntries: [{ startTime: "2026-07-31T13:00:00", endTime: "2026-07-31T14:00:00" }],
			}),
		];
		const range = getTimeStatisticsRange(new Date(2026, 6, 31), "day");
		const segments = buildTimeStatisticsSegments(tasks, range);

		expect(calculateTimeStatisticsTotal(segments)).toBe(4 * 60 * 60_000);
		expect(calculateUniqueTimeStatisticsTotal(segments)).toBe(60 * 60_000);
	});

	it("merges partially overlapping and adjacent intervals across a period", () => {
		const task = createTask({
			timeEntries: [
				{ startTime: "2026-07-30T23:30:00", endTime: "2026-07-31T01:00:00" },
				{ startTime: "2026-07-31T00:30:00", endTime: "2026-07-31T02:00:00" },
				{ startTime: "2026-07-31T02:00:00", endTime: "2026-07-31T02:30:00" },
			],
		});
		const range = getTimeStatisticsRange(new Date(2026, 6, 31), "week", 1);
		const segments = buildTimeStatisticsSegments([task], range);

		expect(calculateTimeStatisticsTotal(segments)).toBe(210 * 60_000);
		expect(calculateUniqueTimeStatisticsTotal(segments)).toBe(180 * 60_000);
	});

	it("attributes the full duration to every exact tag and groups untagged time", () => {
		const tasks = [
			createTask({
				path: "Tasks/tagged.md",
				tags: ["work/writing", "creative"],
				timeEntries: [
					{
						startTime: "2026-07-31T09:00:00",
						endTime: "2026-07-31T10:00:00",
					},
				],
			}),
			createTask({
				path: "Tasks/untagged.md",
				tags: [],
				timeEntries: [
					{
						startTime: "2026-07-31T10:00:00",
						endTime: "2026-07-31T10:30:00",
					},
				],
			}),
		];
		const range = getTimeStatisticsRange(new Date(2026, 6, 31), "day");
		const tags = buildTagTimeStatistics(buildTimeStatisticsSegments(tasks, range));

		expect(tags).toEqual([
			{
				tag: "creative",
				durationMs: 60 * 60_000,
				taskPaths: ["Tasks/tagged.md"],
			},
			{
				tag: "work/writing",
				durationMs: 60 * 60_000,
				taskPaths: ["Tasks/tagged.md"],
			},
			{
				tag: null,
				durationMs: 30 * 60_000,
				taskPaths: ["Tasks/untagged.md"],
			},
		]);
	});

	it("detects whether a reference belongs to the current selected period", () => {
		const now = new Date(2026, 6, 31, 14);

		expect(isCurrentTimeStatisticsPeriod(new Date(2026, 6, 31, 8), "day", now)).toBe(true);
		expect(isCurrentTimeStatisticsPeriod(new Date(2026, 6, 30, 8), "day", now)).toBe(false);
		expect(isCurrentTimeStatisticsPeriod(new Date(2026, 6, 27), "week", now, 1)).toBe(true);
	});

	it("builds ranked task totals and average time per active day", () => {
		const tasks = [
			createTask({
				path: "Tasks/alpha.md",
				title: "Alpha",
				timeEntries: [
					{ startTime: "2026-07-30T09:00:00", endTime: "2026-07-30T10:00:00" },
					{ startTime: "2026-07-31T09:00:00", endTime: "2026-07-31T11:00:00" },
				],
			}),
			createTask({
				path: "Tasks/beta.md",
				title: "Beta",
				timeEntries: [{ startTime: "2026-07-31T12:00:00", endTime: "2026-07-31T12:30:00" }],
			}),
		];
		const range = getTimeStatisticsRange(new Date(2026, 6, 31), "week", 1);
		const segments = buildTimeStatisticsSegments(tasks, range);
		const ranked = buildTaskTimeStatistics(segments);

		expect(ranked.map((task) => [task.taskTitle, task.durationMs / 60_000])).toEqual([
			["Alpha", 180],
			["Beta", 30],
		]);
		expect(calculateAverageTimePerActiveDay(segments)).toBe(105 * 60_000);
	});

	it("includes empty dates when building daily chart buckets", () => {
		const task = createTask({
			timeEntries: [{ startTime: "2026-07-27T09:00:00", endTime: "2026-07-27T10:00:00" }],
		});
		const range = getTimeStatisticsRange(new Date(2026, 6, 29), "week", 1);
		const days = buildDailyTimeStatistics(buildTimeStatisticsSegments([task], range), range);

		expect(days).toHaveLength(7);
		expect(days.map((day) => day.durationMs / 60_000)).toEqual([60, 0, 0, 0, 0, 0, 0]);
	});
});
