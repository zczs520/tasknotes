import type { GoalMilestone, GoalMilestoneStage } from "./goalTypes";

export function completionStages(milestone: GoalMilestone): GoalMilestoneStage[] {
	return milestone.stages?.length ? milestone.stages : [{ id: "complete", name: "完成" }];
}

export function completionStageDate(milestone: GoalMilestone, id: string): string | undefined {
	if (typeof milestone.achieved === "string") {
		return id === completionStages(milestone)[0].id
			? milestone.achieved || undefined
			: undefined;
	}
	return milestone.achieved?.[id];
}

export function isGoalMilestoneComplete(milestone: GoalMilestone): boolean {
	if (milestone.kind === "boolean") {
		return completionStages(milestone).every((stage) =>
			Boolean(completionStageDate(milestone, stage.id))
		);
	}
	const tiers = milestone.tiers ?? [];
	const achieved = milestone.achieved;
	return (
		tiers.length > 0 &&
		typeof achieved === "object" &&
		tiers.every((tier) => Boolean(achieved?.[String(tier)]))
	);
}
