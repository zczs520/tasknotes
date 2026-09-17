import {
	attributeGoalSegments,
	buildFourWeekGoalBaselines,
	buildGoalProgress,
	countZeroGoalPeriods,
	getGoalSettingsAt,
	getGoalHistoryStart,
	goalInvestedHours,
	goalTagMatchesScope,
	milestoneNeedsUpdate,
	milestoneProgress,
} from "../../../src/goals/goalCalculations";
import type { GoalDefinition } from "../../../src/goals/goalTypes";
import type { TimeStatisticsSegment } from "../../../src/utils/timeStatistics";

function goal(overrides: Partial<GoalDefinition>): GoalDefinition {
	return {
		name: "Goal",
		path: "Goals/Goal.md",
		created: "2026-09-01",
		status: "active",
		why: "",
		mode: "floor",
		target: "4h",
		period: "weekly",
		scope: ["life"],
		children: [],
		milestones: [],
		settingsHistory: [],
		...overrides,
	};
}

function segment(tags: string[], durationMs = 60 * 60 * 1000): TimeStatisticsSegment {
	return {
		taskPath: "Tasks/task.md",
		taskTitle: "Task",
		tags,
		start: new Date("2026-09-14T09:00:00"),
		end: new Date("2026-09-14T10:00:00"),
		durationMs,
		sessionKey: "Tasks/task.md:0",
		isActive: false,
	};
}

describe("goal calculations", () => {
	it("starts cumulative statistics at existing tagged history instead of the new goal creation date", () => {
		expect(
			getGoalHistoryStart(
				[goal({ created: "2026-09-17" })],
				[{ timeEntries: [{ startTime: "2026-08-01T09:00:00" }] }],
				new Date("2026-09-17T12:00:00")
			)
		).toEqual(new Date("2026-08-01T09:00:00"));
	});
	it("builds all four-week baselines once without double counting shared tag ancestors or split sessions", () => {
		const first = segment(["#life/fitness", "life/fitness/run", "life/reading"]);
		const second = { ...first, durationMs: 3_600_000 };
		const baselines = buildFourWeekGoalBaselines([first, second]);
		expect(baselines.get("life")).toEqual({ hours: 0.5, count: 0.25 });
		expect(baselines.get("life/fitness")).toEqual({ hours: 0.5, count: 0.25 });
		expect(baselines.has("life/fit")).toBe(false);
	});
	it("counts zero weeks from the last attributed investment rather than displaying a fixed note", () => {
		const trackedGoal = goal({ created: "2026-07-01" });
		const last = {
			...segment(["life"]),
			start: new Date("2026-08-13T09:00:00"),
			end: new Date("2026-08-13T10:00:00"),
		};
		const range = {
			start: new Date("2026-09-14T00:00:00"),
			end: new Date("2026-09-21T00:00:00"),
		};
		expect(countZeroGoalPeriods([trackedGoal], trackedGoal, [last], range, "week", 1)).toBe(5);
		expect(
			countZeroGoalPeriods([trackedGoal], trackedGoal, [segment(["life"])], range, "week", 1)
		).toBe(0);
	});
	it("keeps more specific attribution and creation dates in zero-period notes", () => {
		const trackedGoal = goal({ created: "2026-09-14" });
		const child = goal({ name: "Fitness", path: "Goals/Fitness.md", scope: ["life/fitness"] });
		const range = {
			start: new Date("2026-09-14T00:00:00"),
			end: new Date("2026-09-21T00:00:00"),
		};
		expect(
			countZeroGoalPeriods(
				[trackedGoal, child],
				trackedGoal,
				[segment(["life/fitness"])],
				range,
				"week",
				1
			)
		).toBe(1);
		expect(
			countZeroGoalPeriods(
				[trackedGoal],
				{ ...trackedGoal, status: "paused" },
				[],
				range,
				"week",
				1
			)
		).toBe(0);
	});
	it("treats an entry ending at a period boundary as investment in the preceding period", () => {
		const trackedGoal = goal({ created: "2026-07-01" });
		const boundary = {
			...segment(["life"]),
			start: new Date("2026-08-16T23:00:00"),
			end: new Date("2026-08-17T00:00:00"),
		};
		const range = {
			start: new Date("2026-09-14T00:00:00"),
			end: new Date("2026-09-21T00:00:00"),
		};
		expect(countZeroGoalPeriods([trackedGoal], trackedGoal, [boundary], range, "week", 1)).toBe(
			5
		);
	});
	it("keeps time attributed while excluding paused goals from pace judgment", () => {
		const paused = goal({ status: "paused", target: "4h" });
		const result = buildGoalProgress([paused], [segment(["life"])], 0.8)[0];
		expect(result.actual).toBe(1);
		expect(result.state).toBe("paused");
	});
	it("matches tag descendants only at slash boundaries", () => {
		expect(goalTagMatchesScope("life/fitness/run", "life/fitness")).toBe(true);
		expect(goalTagMatchesScope("life/fitness-club", "life/fitness")).toBe(false);
	});

	it("attributes a segment only to the most specific goal", () => {
		const broad = goal({ name: "Life", path: "Goals/Life.md", scope: ["life"] });
		const specific = goal({
			name: "Fitness",
			path: "Goals/Fitness.md",
			scope: ["life/fitness"],
		});
		const result = attributeGoalSegments([broad, specific], [segment(["life/fitness/run"])]);
		expect(result.get(specific.path)).toHaveLength(1);
		expect(result.has(broad.path)).toBe(false);
	});

	it("includes historical tagged time when a goal adopts an existing scope", () => {
		const newlyCreated = goal({ created: "2026-09-17", scope: ["life"] });
		const historical = {
			...segment(["life"]),
			start: new Date("2026-08-01T09:00:00"),
			end: new Date("2026-08-01T10:00:00"),
		};
		const attributed = attributeGoalSegments([newlyCreated], [historical]);
		expect(goalInvestedHours(newlyCreated, [newlyCreated], attributed)).toBe(1);
	});

	it("counts one time entry once even when split across daily segments", () => {
		const countGoal = goal({ mode: "count", target: 2, scope: ["fitness"] });
		const first = segment(["fitness"]);
		const second = { ...segment(["fitness"]), start: new Date("2026-09-15T00:00:00") };
		const progress = buildGoalProgress([countGoal], [first, second], 0.5)[0];
		expect(progress.actual).toBe(1);
	});

	it("uses equal milestone tiers instead of a linear numeric scale", () => {
		expect(
			milestoneProgress({
				name: "Revenue",
				kind: "number",
				current: 550,
				tiers: [100, 1000, 5000],
				achieved: { "100": "2026-09-01" },
				hours_at: { "100": 20 },
			})
		).toBeCloseTo(0.5);
	});

	it("replays the target and period that were active in a historical range", () => {
		const changing = goal({
			target: "12h",
			period: "monthly",
			settingsHistory: [
				{ date: "2026-07-01", target: 4, period: "weekly" },
				{ date: "2026-09-01", target: 12, period: "monthly" },
			],
		});
		expect(getGoalSettingsAt(changing, new Date("2026-08-15T12:00:00"))).toEqual({
			target: 4,
			period: "weekly",
		});
	});

	it("flags an unfinished numeric milestone when its value has gone stale", () => {
		const tracked = goal({});
		expect(
			milestoneNeedsUpdate(
				tracked,
				{
					name: "Readers",
					kind: "number",
					current: 20,
					tiers: [100],
					achieved: {},
					hours_at: {},
					updatedAt: "2026-08-01",
				},
				new Date("2026-09-16T12:00:00")
			)
		).toBe(true);
	});
});
