import type { TaskInfo } from "../../../src/types";
import {
	filterKanbanTasksByTime,
	getKanbanTimeRange,
	normalizeKanbanTimeFilterField,
	normalizeKanbanTimeFilterPreset,
	parseTaskFilterTime,
	validateKanbanCustomDateRange,
} from "../../../src/bases/kanbanTimeFilter";

function task(
	path: string,
	dates: Pick<TaskInfo, "scheduled" | "dateCreated" | "completedDate"> = {}
): TaskInfo {
	return {
		title: path,
		status: "open",
		priority: "normal",
		path,
		archived: false,
		...dates,
	};
}

describe("Kanban time filter", () => {
	const now = new Date(2026, 6, 30, 12);
	const tasks = [
		task("sunday.md", {
			scheduled: "2026-07-26",
			dateCreated: "2026-07-20 09:00",
			completedDate: "2026-07-27",
		}),
		task("monday.md", {
			scheduled: "2026-07-27",
			dateCreated: "2026-07-26 09:00",
			completedDate: "2026-07-28",
		}),
		task("today.md", {
			scheduled: "2026-07-30",
			dateCreated: "2026-07-30 15:23",
		}),
		task("next-sunday.md", {
			scheduled: "2026-08-02",
			dateCreated: "2026-08-02 23:59",
			completedDate: "2026-08-02",
		}),
		task("next-monday.md", {
			scheduled: "2026-08-03",
			dateCreated: "2026-08-03 00:00",
			completedDate: "2026-08-03",
		}),
	];

	it("uses scheduled date by default and Monday-to-Sunday boundaries for this week", () => {
		const filtered = filterKanbanTasksByTime(
			tasks,
			{ field: normalizeKanbanTimeFilterField(undefined), preset: "this-week" },
			now
		);
		expect(filtered.map((item) => item.path)).toEqual([
			"monday.md",
			"today.md",
			"next-sunday.md",
		]);
	});

	it("can filter the same board by creation time", () => {
		const filtered = filterKanbanTasksByTime(
			tasks,
			{ field: "created", preset: "this-week" },
			now
		);
		expect(filtered.map((item) => item.path)).toEqual(["today.md", "next-sunday.md"]);
	});

	it("can filter by completion date and excludes tasks without one", () => {
		const filtered = filterKanbanTasksByTime(
			tasks,
			{ field: "completed", preset: "this-week" },
			now
		);
		expect(filtered.map((item) => item.path)).toEqual([
			"sunday.md",
			"monday.md",
			"next-sunday.md",
		]);
	});

	it("returns the previous Monday-to-Sunday interval for last week", () => {
		const filtered = filterKanbanTasksByTime(
			tasks,
			{ field: "scheduled", preset: "last-week" },
			now
		);
		expect(filtered.map((item) => item.path)).toEqual(["sunday.md"]);
	});

	it("keeps every task for the all preset regardless of missing dates", () => {
		const withMissingDate = [...tasks, task("missing.md")];
		expect(
			filterKanbanTasksByTime(withMissingDate, { field: "scheduled", preset: "all" }, now)
		).toEqual(withMissingDate);
	});

	it("includes both endpoints of a custom date range", () => {
		const filtered = filterKanbanTasksByTime(
			tasks,
			{
				field: "scheduled",
				preset: "custom",
				customStart: "2026-07-26",
				customEnd: "2026-07-27",
			},
			now
		);
		expect(filtered.map((item) => item.path)).toEqual(["sunday.md", "monday.md"]);
	});

	it("falls back to the Obsidian file creation time only for creation-time filtering", () => {
		const legacyTask = task("legacy.md");
		const fallback = () => new Date(2026, 6, 28, 10);
		expect(
			filterKanbanTasksByTime(
				[legacyTask],
				{ field: "created", preset: "this-week" },
				now,
				fallback
			)
		).toEqual([legacyTask]);
		expect(
			filterKanbanTasksByTime(
				[legacyTask],
				{ field: "scheduled", preset: "this-week" },
				now,
				fallback
			)
		).toEqual([]);
	});

	it("normalizes unknown settings and validates custom ranges", () => {
		expect(normalizeKanbanTimeFilterField(undefined)).toBe("scheduled");
		expect(normalizeKanbanTimeFilterField("unexpected")).toBe("scheduled");
		expect(normalizeKanbanTimeFilterPreset(undefined)).toBe("this-week");
		expect(normalizeKanbanTimeFilterPreset("unexpected")).toBe("this-week");
		expect(validateKanbanCustomDateRange("2026-07-01", "2026-07-31")).toBe(true);
		expect(validateKanbanCustomDateRange("2026-08-01", "2026-07-31")).toBe(false);
		expect(parseTaskFilterTime("2026-02-30 10:00")).toBeNull();
	});

	it("exposes an exclusive end boundary for reliable time comparisons", () => {
		const range = getKanbanTimeRange({ preset: "this-week" }, now);
		expect(range.start).toEqual(new Date(2026, 6, 27));
		expect(range.endExclusive).toEqual(new Date(2026, 7, 3));
	});
});
