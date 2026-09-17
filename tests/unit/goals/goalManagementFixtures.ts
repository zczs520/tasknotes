import type TaskNotesPlugin from "../../../src/main";
import type { GoalDefinition, GoalProgress } from "../../../src/goals/goalTypes";
import { GoalDetailModal } from "../../../src/modals/GoalDetailModal";
import { GoalsView } from "../../../src/views/GoalsView";
import { MockObsidian } from "../../helpers/obsidian-runtime";
import { zh } from "../../../src/i18n/resources/zh";
import { en } from "../../../src/i18n/resources/en";

export function managementGoal(
	name: string,
	overrides: Partial<GoalDefinition> = {}
): GoalDefinition {
	return {
		name,
		path: `${name}.md`,
		created: "2026-07-01",
		status: "active",
		why: "坚持投入，积累可复用的成果",
		mode: "floor",
		target: "7h",
		period: "weekly",
		scope: [name],
		children: [],
		milestones: [],
		settingsHistory: [],
		...overrides,
	};
}

export function managementSetup(
	goals: GoalDefinition[] = [
		managementGoal("造船", {
			milestones: [
				{
					name: "副业月收入",
					kind: "number",
					unit: "$",
					current: 210,
					tiers: [100, 1000, 5000],
					achieved: { "100": "2026-08-03" },
					hours_at: { "100": 103 },
					updatedAt: "2026-08-25",
				},
				{
					name: "粉丝数",
					kind: "number",
					current: 0,
					tiers: [1000, 3000],
					achieved: {},
					hours_at: {},
					updatedAt: "2026-08-10",
				},
				{ name: "上线商用工具站", kind: "boolean", achieved: null, hours_at: null },
				{ name: "连续 4 周达标", kind: "boolean", achieved: "2026-07-20", hours_at: 38 },
			],
		}),
	],
	locale: "zh" | "en" = "zh"
) {
	const translations = locale === "zh" ? zh : en;
	const progress: GoalProgress[] = goals.map((goal) => ({
		goal,
		actual: goal.mode === "count" ? 3 : 2.1,
		target: goal.mode ? Number.parseFloat(String(goal.target)) : null,
		ratio: 0.3,
		pace: 0.57,
		state: goal.mode ? "on-track" : "aggregate",
		entryCount: 3,
	}));
	const service = {
		listGoals: jest.fn().mockResolvedValue(goals),
		getGoal: jest.fn(async (path: string) => goals.find((goal) => goal.path === path) ?? null),
		getProgress: jest.fn().mockResolvedValue({
			goals,
			progress,
			range: { start: new Date("2026-09-14"), end: new Date("2026-09-21") },
		}),
		getAdjustmentHistory: jest
			.fn()
			.mockResolvedValue(["2026-09-14 目标值调整为 7h", "2026-08-03 第 1 档已达成"]),
		findScopeOwner: (items: readonly GoalDefinition[], tag: string) =>
			items.find((goal) => goal.scope.includes(tag)) ?? null,
		updateMilestone: jest.fn().mockResolvedValue({ crossedTiers: [] }),
		updateMilestoneUnit: jest.fn().mockResolvedValue(undefined),
		undoMilestoneAchievement: jest.fn().mockResolvedValue(undefined),
		removeMilestone: jest.fn().mockResolvedValue(undefined),
		addMilestone: jest.fn().mockResolvedValue(undefined),
		deleteGoal: jest.fn().mockResolvedValue(undefined),
		setGoalStatus: jest.fn().mockResolvedValue(undefined),
		updateGoalDetails: jest.fn().mockResolvedValue(undefined),
		updateGoalSettings: jest.fn().mockResolvedValue(undefined),
		updateGoalScope: jest.fn().mockResolvedValue(undefined),
	};
	const plugin = {
		app: MockObsidian.createMockApp(),
		i18n: {
			getCurrentLocale: () => locale,
			translate: (key: string, vars?: Record<string, string | number>) => {
				let value: unknown = translations;
				for (const part of key.split("."))
					value = (value as Record<string, unknown>)?.[part];
				if (typeof value !== "string") return key;
				return value.replace(/\{(\w+)\}/g, (match, token: string) =>
					vars && Object.prototype.hasOwnProperty.call(vars, token)
						? String(vars[token])
						: match
				);
			},
		},
		settings: { calendarViewSettings: { firstDay: 1 } },
		cacheManager: {
			getAllTasks: async () => [],
			getAllTags: () => ["造船", "工作", "创作", "生活/健身"],
		},
		goalService: service,
	} as unknown as TaskNotesPlugin;
	const contentEl = document.createElement("div");
	document.body.appendChild(contentEl);
	const view = Object.assign(Object.create(GoalsView.prototype), {
		plugin,
		contentEl,
		filter: "all",
		range: "week",
		referenceDate: new Date(),
		renderVersion: 0,
	}) as GoalsView;
	const renderView = () => (view as unknown as { render: () => Promise<void> }).render();
	const changed = jest.fn();
	const modal = new GoalDetailModal(plugin, goals[0].path, changed);
	document.body.appendChild(modal.modalEl);
	modal.modalEl.addClass("tn-goal-detail-modal");
	const renderDetail = () => (modal as unknown as { render: () => Promise<void> }).render();
	return { plugin, goals, service, view, contentEl, renderView, modal, renderDetail, changed };
}
