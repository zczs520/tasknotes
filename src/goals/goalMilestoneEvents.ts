import type { TimeStatisticsRange } from "../utils/timeStatistics";
import type { GoalDefinition, GoalMilestone } from "./goalTypes";

export interface GoalMilestoneEvent {
	goal: GoalDefinition;
	milestone: GoalMilestone;
	milestoneIndex: number;
	date: string;
	kind: "achievement" | "progress";
	achievedTiers: number[];
	value?: number;
	completed: boolean;
	nextTier?: number;
}

function dateInRange(date: string, range: TimeStatisticsRange): boolean {
	const time = new Date(`${date}T00:00:00`).getTime();
	return Number.isFinite(time) && time >= range.start.getTime() && time < range.end.getTime();
}

function numericEvents(
	goal: GoalDefinition,
	milestone: GoalMilestone,
	milestoneIndex: number,
	range: TimeStatisticsRange
): GoalMilestoneEvent[] {
	const tiers = [...(milestone.tiers ?? [])].sort((left, right) => left - right);
	const achieved =
		typeof milestone.achieved === "object" && milestone.achieved !== null
			? milestone.achieved
			: {};
	const valuesByDate = new Map<string, number>();
	for (const snapshot of milestone.progressHistory ?? []) {
		valuesByDate.set(snapshot.date, snapshot.value);
	}
	if (valuesByDate.size === 0 && (milestone.current ?? 0) > 0 && milestone.updatedAt) {
		valuesByDate.set(milestone.updatedAt, milestone.current ?? 0);
	}
	const tiersByDate = new Map<string, number[]>();
	for (const tier of tiers) {
		const date = achieved[String(tier)];
		if (!date) continue;
		const achievedOnDate = tiersByDate.get(date) ?? [];
		achievedOnDate.push(tier);
		tiersByDate.set(date, achievedOnDate);
	}
	const dates = new Set([...valuesByDate.keys(), ...tiersByDate.keys()]);
	const events: GoalMilestoneEvent[] = [];
	for (const date of dates) {
		if (!dateInRange(date, range)) continue;
		const achievedTiers = (tiersByDate.get(date) ?? []).sort((left, right) => left - right);
		const value = valuesByDate.get(date);
		if (achievedTiers.length === 0 && !(value !== undefined && value > 0)) continue;
		const completed = tiers.length > 0 && achievedTiers.includes(tiers[tiers.length - 1]);
		const referenceValue =
			value ?? (achievedTiers.length ? achievedTiers[achievedTiers.length - 1] : undefined);
		const nextTier =
			referenceValue === undefined ? undefined : tiers.find((tier) => tier > referenceValue);
		events.push({
			goal,
			milestone,
			milestoneIndex,
			date,
			kind: achievedTiers.length ? "achievement" : "progress",
			achievedTiers,
			...(value !== undefined ? { value } : {}),
			completed,
			...(nextTier !== undefined ? { nextTier } : {}),
		});
	}
	return events;
}

export function collectGoalMilestoneEvents(
	goals: readonly GoalDefinition[],
	range: TimeStatisticsRange
): GoalMilestoneEvent[] {
	const events = goals.flatMap((goal) =>
		goal.milestones.flatMap((milestone, milestoneIndex) => {
			if (milestone.kind === "number") {
				return numericEvents(goal, milestone, milestoneIndex, range);
			}
			if (typeof milestone.achieved !== "string" || !dateInRange(milestone.achieved, range))
				return [];
			return [
				{
					goal,
					milestone,
					milestoneIndex,
					date: milestone.achieved,
					kind: "achievement" as const,
					achievedTiers: [],
					completed: true,
				},
			];
		})
	);
	return events.sort(
		(left, right) =>
			right.date.localeCompare(left.date) ||
			left.goal.name.localeCompare(right.goal.name) ||
			left.milestoneIndex - right.milestoneIndex
	);
}
