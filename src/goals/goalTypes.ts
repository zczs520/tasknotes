export type GoalMode = "floor" | "ceiling" | "count";
export type GoalPeriod = "weekly" | "monthly" | "quarterly";
export type GoalStatus = "active" | "paused";

export interface GoalSettingsSnapshot {
	date: string;
	target?: number;
	period?: GoalPeriod;
}

export interface GoalMilestoneProgressSnapshot {
	date: string;
	value: number;
}

export interface GoalMilestone {
	name: string;
	kind: "number" | "boolean";
	unit?: string;
	current?: number;
	tiers?: number[];
	achieved: Record<string, string> | string | null;
	hours_at: Record<string, number> | number | null;
	updatedAt?: string;
	progressHistory?: GoalMilestoneProgressSnapshot[];
}

export interface GoalDefinition {
	name: string;
	path: string;
	created: string;
	status: GoalStatus;
	pausedAt?: string;
	why: string;
	mode?: GoalMode;
	target?: string | number;
	period?: GoalPeriod;
	scope: string[];
	parent?: string;
	children: string[];
	milestones: GoalMilestone[];
	settingsHistory: GoalSettingsSnapshot[];
}

export interface GoalProgress {
	goal: GoalDefinition;
	actual: number;
	target: number | null;
	ratio: number;
	pace: number;
	state: "complete" | "on-track" | "behind" | "over" | "idle" | "aggregate" | "paused";
	entryCount: number;
}

export interface GoalDraftMilestone {
	name: string;
	tiers: number[];
	unit?: string;
}

export interface GoalDraftItem {
	name: string;
	target: number;
	scope: string[];
	milestones: GoalDraftMilestone[];
}

export interface GoalGroupDraft {
	name: string;
	mode: GoalMode;
	period: GoalPeriod;
	split: boolean;
	why: string;
	items: GoalDraftItem[];
	parentMilestones: GoalDraftMilestone[];
}
