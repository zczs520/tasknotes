import {
	getTimeStatisticsRange,
	shiftTimeStatisticsReference,
	type TimeStatisticsPeriod,
	type TimeStatisticsRange,
	type TimeStatisticsSegment,
} from "../utils/timeStatistics";
import type { GoalDefinition, GoalPeriod, GoalProgress, GoalSettingsSnapshot } from "./goalTypes";
import type { TaskInfo } from "../types";

const HOUR_MS = 60 * 60 * 1000;

export function getGoalHistoryStart(
	goals: readonly GoalDefinition[],
	tasks: readonly Pick<TaskInfo, "timeEntries">[],
	fallback: Date
): Date {
	let earliest = fallback.getTime();
	const include = (time: number): void => {
		if (Number.isFinite(time)) earliest = Math.min(earliest, time);
	};
	for (const goal of goals) include(new Date(`${goal.created}T00:00:00`).getTime());
	for (const task of tasks) {
		for (const entry of task.timeEntries ?? []) include(new Date(entry.startTime).getTime());
	}
	return new Date(earliest);
}

export function getGoalPeriodRange(
	goal: GoalDefinition,
	referenceDate: Date,
	weekStartsOn = 0
): TimeStatisticsRange {
	if (goal.period !== "quarterly")
		return getTimeStatisticsRange(
			referenceDate,
			goal.period === "monthly" ? "month" : "week",
			weekStartsOn
		);
	const start = new Date(
		referenceDate.getFullYear(),
		Math.floor(referenceDate.getMonth() / 3) * 3,
		1
	);
	return { start, end: new Date(start.getFullYear(), start.getMonth() + 3, 1) };
}

export function normalizeGoalTag(value: string): string {
	return value
		.trim()
		.replace(/^#+/u, "")
		.replace(/^\/+|\/+$/gu, "");
}

export function goalTagMatchesScope(tagValue: string, scopeValue: string): boolean {
	const tag = normalizeGoalTag(tagValue);
	const scope = normalizeGoalTag(scopeValue);
	return Boolean(scope) && (tag === scope || tag.startsWith(`${scope}/`));
}

/** Summarize all tag scopes in one pass; shared ancestors count each segment/session only once. */
export function buildFourWeekGoalBaselines(
	segments: readonly TimeStatisticsSegment[]
): Map<string, { hours: number; count: number }> {
	const totals = new Map<string, { duration: number; sessions: Set<string> }>();
	for (const segment of segments) {
		const scopes = new Set<string>();
		for (const tag of segment.tags) {
			const parts = normalizeGoalTag(tag).split("/");
			for (let depth = 1; depth <= parts.length; depth += 1) {
				const scope = parts.slice(0, depth).join("/");
				if (scope) scopes.add(scope);
			}
		}
		for (const scope of scopes) {
			const total = totals.get(scope) ?? { duration: 0, sessions: new Set<string>() };
			total.duration += segment.durationMs;
			total.sessions.add(segment.sessionKey);
			totals.set(scope, total);
		}
	}
	return new Map(
		[...totals].map(([scope, total]) => [
			scope,
			{ hours: total.duration / HOUR_MS / 4, count: total.sessions.size / 4 },
		])
	);
}

function scopeDepth(value: string): number {
	return normalizeGoalTag(value).split("/").filter(Boolean).length;
}

export function parseGoalTarget(goal: GoalDefinition): number | null {
	if (goal.target === undefined || goal.target === null) return null;
	if (goal.mode === "count") {
		const value = Number(goal.target);
		return Number.isFinite(value) && value > 0 ? value : null;
	}
	if (typeof goal.target === "number") {
		return Number.isFinite(goal.target) && goal.target > 0 ? goal.target : null;
	}
	const match = goal.target.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*h?$/iu);
	if (!match) return null;
	const value = Number(match[1]);
	return Number.isFinite(value) && value > 0 ? value : null;
}

function snapshotTime(snapshot: GoalSettingsSnapshot): number {
	const time = new Date(`${snapshot.date}T23:59:59.999`).getTime();
	return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function getGoalSettingsAt(
	goal: GoalDefinition,
	referenceDate: Date
): { target: number | null; period?: GoalPeriod } {
	const snapshots = [...goal.settingsHistory]
		.filter((snapshot) => snapshotTime(snapshot) <= referenceDate.getTime())
		.sort((left, right) => snapshotTime(left) - snapshotTime(right));
	let target = parseGoalTarget(goal);
	let period = goal.period;
	if (goal.settingsHistory.length > 0) {
		const earliest = [...goal.settingsHistory].sort(
			(left, right) => snapshotTime(left) - snapshotTime(right)
		)[0];
		target = earliest?.target ?? target;
		period = earliest?.period ?? period;
		for (const snapshot of snapshots) {
			if (snapshot.target !== undefined) target = snapshot.target;
			if (snapshot.period !== undefined) period = snapshot.period;
		}
	}
	return { target, period };
}

export function findGoalForTags(
	goals: readonly GoalDefinition[],
	tags: readonly string[]
): GoalDefinition | null {
	const candidates: Array<{ goal: GoalDefinition; scope: string; depth: number }> = [];
	for (const goal of goals) {
		if (!goal.mode || goal.scope.length === 0) continue;
		for (const scope of goal.scope) {
			if (tags.some((tag) => goalTagMatchesScope(tag, scope))) {
				candidates.push({ goal, scope, depth: scopeDepth(scope) });
			}
		}
	}
	if (candidates.length === 0) return null;
	candidates.sort(
		(left, right) =>
			right.depth - left.depth ||
			right.scope.length - left.scope.length ||
			left.goal.name.localeCompare(right.goal.name)
	);
	return candidates[0].goal;
}

export function attributeGoalSegments(
	goals: readonly GoalDefinition[],
	segments: readonly TimeStatisticsSegment[]
): Map<string, TimeStatisticsSegment[]> {
	const result = new Map<string, TimeStatisticsSegment[]>();
	for (const segment of segments) {
		const goal = findGoalForTags(goals, segment.tags);
		if (!goal) continue;
		const attributed = result.get(goal.path) ?? [];
		attributed.push(segment);
		result.set(goal.path, attributed);
	}
	return result;
}

export function goalInvestedHours(
	goal: GoalDefinition,
	goals: readonly GoalDefinition[],
	attributed: ReadonlyMap<string, readonly TimeStatisticsSegment[]>
): number {
	const paths = goal.mode
		? [goal.path]
		: goals.filter((child) => child.parent === goal.name).map((child) => child.path);
	return (
		paths
			.flatMap((path) => attributed.get(path) ?? [])
			.reduce((total, segment) => total + segment.durationMs, 0) / HOUR_MS
	);
}

function progressState(
	goal: GoalDefinition,
	actual: number,
	target: number,
	pace: number
): GoalProgress["state"] {
	if (actual === 0) return "idle";
	if (goal.mode === "ceiling") return actual > target ? "over" : "on-track";
	if (actual >= target) return "complete";
	return actual / target < pace ? "behind" : "on-track";
}

export function buildGoalProgress(
	goals: readonly GoalDefinition[],
	segments: readonly TimeStatisticsSegment[],
	pace: number
): GoalProgress[] {
	const attributed = attributeGoalSegments(goals, segments);
	const byName = new Map(goals.map((goal) => [goal.name, goal]));
	const base = new Map<string, GoalProgress>();

	for (const goal of goals) {
		if (!goal.mode) continue;
		const goalSegments = attributed.get(goal.path) ?? [];
		const target = parseGoalTarget(goal);
		const entryCount = new Set(goalSegments.map((segment) => segment.sessionKey)).size;
		const actual =
			goal.mode === "count"
				? entryCount
				: goalSegments.reduce((total, segment) => total + segment.durationMs, 0) / HOUR_MS;
		base.set(goal.path, {
			goal,
			actual,
			target,
			ratio: target ? actual / target : 0,
			pace,
			state:
				goal.status === "paused"
					? "paused"
					: target
						? progressState(goal, actual, target, pace)
						: "idle",
			entryCount,
		});
	}

	return goals.map((goal) => {
		const direct = base.get(goal.path);
		if (direct) return direct;
		const children = goal.children
			.map((name) => byName.get(name))
			.filter((child): child is GoalDefinition => Boolean(child))
			.map((child) => base.get(child.path))
			.filter((child): child is GoalProgress => Boolean(child));
		return {
			goal,
			actual: children.reduce((total, child) => total + child.actual, 0),
			target: null,
			ratio:
				children.length > 0
					? children.reduce((total, child) => total + Math.min(1, child.ratio), 0) /
						children.length
					: 0,
			pace,
			state: goal.status === "paused" ? "paused" : "aggregate",
			entryCount: children.reduce((total, child) => total + child.entryCount, 0),
		};
	});
}

export function calculateGoalPace(rangeStart: Date, rangeEnd: Date, now: Date): number {
	const total = Math.max(1, rangeEnd.getTime() - rangeStart.getTime());
	return Math.max(0, Math.min(1, (now.getTime() - rangeStart.getTime()) / total));
}

export function countZeroGoalPeriods(
	goals: readonly GoalDefinition[],
	goal: GoalDefinition,
	segments: readonly TimeStatisticsSegment[],
	range: TimeStatisticsRange,
	period: TimeStatisticsPeriod,
	weekStartsOn = 0
): number {
	const created = new Date(`${goal.created}T00:00:00`).getTime();
	if (!Number.isFinite(created) || goal.status === "paused" || !goal.mode) return 0;
	const latestEnd = segments.reduce(
		(latest, segment) =>
			segment.durationMs > 0 &&
			segment.start.getTime() < range.end.getTime() &&
			findGoalForTags(goals, segment.tags)?.path === goal.path
				? Math.max(latest, segment.end.getTime())
				: latest,
		Number.NEGATIVE_INFINITY
	);
	let count = 0;
	let currentRange = range;
	while (currentRange.end.getTime() > created && latestEnd <= currentRange.start.getTime()) {
		count += 1;
		currentRange = getTimeStatisticsRange(
			shiftTimeStatisticsReference(currentRange.start, period, -1),
			period,
			weekStartsOn
		);
	}
	return count;
}

export function milestoneProgress(milestone: GoalDefinition["milestones"][number]): number {
	if (milestone.kind === "boolean") return milestone.achieved ? 1 : 0;
	const tiers = milestone.tiers ?? [];
	if (tiers.length === 0) return 0;
	const current = milestone.current ?? 0;
	let completed = 0;
	while (completed < tiers.length && current >= tiers[completed]) completed += 1;
	if (completed >= tiers.length) return 1;
	const previous = completed === 0 ? 0 : tiers[completed - 1];
	const next = tiers[completed];
	const withinTier = next === previous ? 0 : (current - previous) / (next - previous);
	return Math.max(0, Math.min(1, (completed + withinTier) / tiers.length));
}

export function milestoneNeedsUpdate(
	goal: GoalDefinition,
	milestone: GoalDefinition["milestones"][number],
	now = new Date(),
	staleAfterDays = 14
): boolean {
	if (milestone.kind !== "number" || milestoneProgress(milestone) >= 1) return false;
	const source = milestone.updatedAt ?? goal.created;
	const updatedAt = new Date(`${source}T00:00:00`).getTime();
	if (!Number.isFinite(updatedAt)) return false;
	return now.getTime() - updatedAt >= staleAfterDays * 86_400_000;
}
