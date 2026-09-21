import { collectGoalMilestoneEvents } from "../../../src/goals/goalMilestoneEvents";
import type { GoalDefinition } from "../../../src/goals/goalTypes";

function goal(overrides: Partial<GoalDefinition>): GoalDefinition {
	return {
		name: "目标",
		path: "目标.md",
		created: "2026-01-01",
		status: "active",
		why: "",
		scope: [],
		children: [],
		milestones: [],
		settingsHistory: [],
		...overrides,
	};
}

describe("goal milestone period events", () => {
	const june = { start: new Date("2026-06-01T00:00:00"), end: new Date("2026-07-01T00:00:00") };

	it("combines same-day tiers and includes progress that did not reach a stage", () => {
		const events = collectGoalMilestoneEvents(
			[
				goal({
					name: "产品",
					milestones: [
						{
							name: "上线",
							kind: "boolean",
							achieved: "2026-06-10",
							hours_at: 12,
						},
						{
							name: "用户",
							kind: "number",
							current: 55,
							tiers: [10, 50, 100],
							achieved: { "10": "2026-06-12", "50": "2026-06-12" },
							hours_at: { "10": 4, "50": 8 },
							progressHistory: [{ date: "2026-06-12", value: 55 }],
						},
						{
							name: "粉丝",
							kind: "number",
							current: 300,
							tiers: [1000],
							achieved: {},
							hours_at: {},
							progressHistory: [{ date: "2026-06-15", value: 300 }],
						},
					],
				}),
			],
			june
		);

		expect(events).toHaveLength(3);
		expect(events[0]).toMatchObject({
			date: "2026-06-15",
			kind: "progress",
			value: 300,
			nextTier: 1000,
		});
		expect(events[1]).toMatchObject({
			date: "2026-06-12",
			kind: "achievement",
			achievedTiers: [10, 50],
			value: 55,
			nextTier: 100,
		});
		expect(events[2]).toMatchObject({ date: "2026-06-10", completed: true });
	});

	it("uses the legacy current value only on its recorded update date", () => {
		const legacy = goal({
			milestones: [
				{
					name: "收入",
					kind: "number",
					current: 8,
					tiers: [10],
					achieved: {},
					hours_at: {},
					updatedAt: "2026-06-20",
				},
			],
		});
		expect(collectGoalMilestoneEvents([legacy], june)).toHaveLength(1);
		expect(
			collectGoalMilestoneEvents([legacy], {
				start: new Date("2026-07-01T00:00:00"),
				end: new Date("2026-08-01T00:00:00"),
			})
		).toHaveLength(0);
	});
});
