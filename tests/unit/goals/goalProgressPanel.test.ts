import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import * as basesHelpers from "../../../src/bases/helpers";
import type { GoalDefinition, GoalProgress } from "../../../src/goals/goalTypes";
import {
	renderGoalProgressPanel,
	type GoalProgressPanelOptions,
} from "../../../src/ui/goals/GoalProgressPanel";
import { TimeStatisticsView } from "../../../src/bases/TimeStatisticsView";
import { KanbanView } from "../../../src/bases/KanbanView";
import type { TagTimeStatistic, TaskTimeStatistic } from "../../../src/utils/timeStatistics";
import { MockObsidian } from "../../helpers/obsidian-runtime";

function goal(name: string, overrides: Partial<GoalDefinition> = {}): GoalDefinition {
	return {
		name,
		path: `${name}.md`,
		created: "2026-01-01",
		status: "active",
		why: "",
		scope: [name],
		children: [],
		milestones: [],
		settingsHistory: [],
		...overrides,
	};
}

function setup(goals: GoalDefinition[]) {
	const progress: GoalProgress[] = goals.map((item) => ({
		goal: item,
		actual: 4,
		target: item.mode ? 8 : null,
		ratio: 0.5,
		pace: 0.6,
		state: item.mode ? "behind" : "aggregate",
		entryCount: 2,
	}));
	const plugin = {
		app: MockObsidian.createMockApp(),
		i18n: { getCurrentLocale: () => "zh", translate: (key: string) => key },
		settings: { calendarViewSettings: { firstDay: 1 } },
		goalService: {
			listGoals: jest.fn().mockResolvedValue(goals),
			getProgress: jest.fn().mockResolvedValue({
				goals,
				progress,
				range: { start: new Date("2026-09-14"), end: new Date("2026-09-21") },
			}),
			updateMilestone: jest.fn().mockResolvedValue({ crossedTiers: [] }),
		},
		activateGoalsView: jest.fn(),
		openTimeEntryEditor: jest.fn(),
	} as unknown as TaskNotesPlugin;
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	return { plugin, parent, progress };
}

const options: GoalProgressPanelOptions = { variant: "strip", period: "week", onRefresh: () => {} };

describe("reference goal and tag presentation", () => {
	afterEach(() => document.body.replaceChildren());
	it("renders the actual statistics page with both goal and tag columns above ranking", async () => {
		const { plugin, parent } = setup([goal("开发", { mode: "floor" })]);
		const start = new Date();
		start.setHours(10, 0, 0, 0);
		const end = new Date(start.getTime() + 3_600_000);
		const tasks = [
			{
				path: "a.md",
				title: "开发任务",
				tags: ["开发"],
				timeEntries: [{ startTime: start.toISOString(), endTime: end.toISOString() }],
			},
			{ path: "b.md", title: "未计时任务", tags: ["写作"], timeEntries: [] },
		] as TaskInfo[];
		jest.spyOn(basesHelpers, "identifyTaskNotesFromBasesData").mockResolvedValue(tasks);
		const view = Object.assign(Object.create(TimeStatisticsView.prototype), {
			plugin,
			rootElement: parent,
			data: { data: [] },
			dataAdapter: { extractDataItems: () => [] },
			period: "day",
			referenceDate: start,
			renderVersion: 0,
		}) as TimeStatisticsView;
		await view.render();
		const insights = parent.querySelector(".tn-time-statistics__insights")!;
		expect(insights.children).toHaveLength(2);
		expect(insights.firstElementChild?.className).toContain("goal-section");
		expect(insights.lastElementChild?.className).toContain("__tags");
		expect(parent.querySelectorAll(".tn-time-statistics__tag-row")).toHaveLength(2);
		expect(
			parent.querySelector(
				".tn-time-statistics__tag-row.is-goal-floor .tn-time-statistics__tag-chip"
			)?.textContent
		).toBe("开发");
		expect(parent.querySelectorAll(".tn-goal-card")).toHaveLength(0);
		expect(insights.parentElement?.lastElementChild?.className).toContain("__ranking");
		const edit = parent.querySelector<HTMLButtonElement>(".tn-time-statistics__record-edit")!;
		expect(edit.textContent).toBe("编辑");
		edit.click();
		expect(plugin.openTimeEntryEditor).toHaveBeenCalledWith(tasks[0], expect.any(Function));
	});
	it("renders the compact rail with mode dots and excludes aggregate parents from achievement counts", async () => {
		const { plugin, parent } = setup([
			goal("工作", { children: ["设计"] }),
			goal("设计", { mode: "floor", parent: "工作" }),
		]);
		await renderGoalProgressPanel(parent, plugin, [], options);
		expect(parent.querySelector(".tn-goal-card")).toBeNull();
		expect(parent.querySelector(".tn-goal-strip__summary")?.textContent).toContain("0/1");
		expect(parent.querySelectorAll(".tn-goal-strip__pill .tn-goal-ledger__dot")).toHaveLength(
			2
		);
		expect(
			parent.querySelector(".tn-goal-strip__pill.is-floor .tn-goal-strip__value")?.textContent
		).toBe("4/8h");
		expect(parent.querySelector(".tn-goal-strip__all")).toBeNull();
	});
	it("supports closing an expanded overlay with Escape", async () => {
		const { plugin, parent } = setup([goal("设计", { mode: "floor" })]);
		const change = jest.fn();
		await renderGoalProgressPanel(parent, plugin, [], {
			...options,
			stripState: "open",
			onStripStateChange: change,
		});
		const overlay = parent.querySelector<HTMLElement>(".tn-goal-strip__overlay")!;
		overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(change).toHaveBeenCalledWith("bar");
		expect(parent.querySelector(".tn-goal-strip__toggle")?.getAttribute("aria-expanded")).toBe(
			"false"
		);
	});
	it("toggles repeatedly without requerying progress or remounting board cards, and persists badge state", async () => {
		const { plugin, parent } = setup([goal("设计", { mode: "floor" })]);
		parent.className = "tasknotes-plugin";
		const search = parent.createDiv();
		const host = parent.createDiv({ cls: "tn-goal-panel-host" });
		const board = parent.createDiv();
		const card = board.createDiv({ text: "保持原卡片" });
		board.scrollTop = 123;
		const config = { set: jest.fn() };
		const view = Object.assign(Object.create(KanbanView.prototype), {
			rootElement: parent,
			boardEl: board,
			searchContainerEl: search,
			config,
			goalPanelState: "bar",
			render: jest.fn(),
		}) as KanbanView;
		const persist = (state: "open" | "bar" | "off") =>
			(
				view as unknown as {
					setGoalPanelState: (host: HTMLElement, state: "open" | "bar" | "off") => void;
				}
			).setGoalPanelState(host, state);
		await renderGoalProgressPanel(host, plugin, [], {
			...options,
			onStripStateChange: persist,
		});
		for (let index = 0; index < 3; index++) {
			host.querySelector<HTMLButtonElement>(".tn-goal-strip__toggle")!.click();
			expect(host.querySelector(".tn-goal-strip__overlay")).not.toBeNull();
			host.querySelector<HTMLButtonElement>(".tn-goal-strip__toggle")!.click();
			expect(host.querySelector(".tn-goal-strip__overlay")).toBeNull();
		}
		host.querySelector<HTMLButtonElement>('button[aria-label="关闭目标横幅"]')!.click();
		expect(host.parentElement).toBe(search);
		host.querySelector<HTMLButtonElement>(".tn-goal-strip__badge")!.click();
		expect(host.nextElementSibling).toBe(board);
		expect(board.firstChild).toBe(card);
		expect(board.scrollTop).toBe(123);
		expect(view.render).not.toHaveBeenCalled();
		expect(plugin.goalService.getProgress).toHaveBeenCalledTimes(1);
		expect(config.set).toHaveBeenCalledWith("goalPanelState", "off");
	});
	it("includes fresh numeric milestones, completion milestones and achieved evidence in the overlay", async () => {
		const { plugin, parent } = setup([
			goal("设计", {
				mode: "floor",
				milestones: [
					{
						name: "新指标",
						kind: "number",
						tiers: [100],
						current: 0,
						achieved: {},
						hours_at: {},
						updatedAt: new Date().toISOString().slice(0, 10),
					},
					{ name: "发布作品", kind: "boolean", achieved: null, hours_at: null },
					{ name: "历史成果", kind: "boolean", achieved: "2026-07-20", hours_at: 38 },
				],
			}),
		]);
		await renderGoalProgressPanel(parent, plugin, [], { ...options, stripState: "open" });
		expect(parent.querySelectorAll(".tn-goal-pending--rail")).toHaveLength(3);
		expect(parent.querySelector(".tn-goal-strip__utility.is-flag")).toBeNull();
		expect(parent.querySelector(".tn-goal-pending.is-complete")?.textContent).toContain(
			"历史成果"
		);
		expect(parent.querySelector(".tn-goal-pending__check")?.textContent).toBe("标记达成");
	});
	it("nests child progress in the statistics ledger rather than duplicating cards", async () => {
		const { plugin, parent } = setup([
			goal("工作", { children: ["设计"] }),
			goal("设计", { mode: "floor", parent: "工作" }),
		]);
		await renderGoalProgressPanel(parent, plugin, [], { ...options, variant: "statistics" });
		expect(parent.querySelectorAll(".tn-goal-ledger__group")).toHaveLength(1);
		expect(
			parent.querySelector(".tn-goal-ledger__children .tn-goal-ledger__name")?.textContent
		).toBe("设计");
		expect(parent.querySelectorAll(".tn-goal-ledger__row > .tn-goal-strip__bar")).toHaveLength(
			1
		);
	});
	it("does not expose milestone update inputs in historical statistics", async () => {
		const { plugin, parent } = setup([
			goal("设计", {
				mode: "floor",
				milestones: [
					{
						name: "作品",
						kind: "number",
						current: 1,
						tiers: [10],
						achieved: null,
						hours_at: null,
					},
				],
			}),
		]);
		await renderGoalProgressPanel(parent, plugin, [], {
			...options,
			variant: "statistics",
			readOnly: true,
		});
		expect(parent.querySelector(".tn-goal-pending__input")).toBeNull();
	});
	it("rejects blank inline milestone updates and submits explicit values", async () => {
		const { plugin, parent } = setup([
			goal("设计", {
				mode: "floor",
				milestones: [
					{
						name: "作品",
						kind: "number",
						current: 1,
						tiers: [10],
						achieved: null,
						hours_at: null,
					},
				],
			}),
		]);
		await renderGoalProgressPanel(parent, plugin, [], { ...options, stripState: "open" });
		const input = parent.querySelector<HTMLInputElement>(".tn-goal-pending__input")!;
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(plugin.goalService.updateMilestone).not.toHaveBeenCalled();
		input.value = "2";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await Promise.resolve();
		expect(plugin.goalService.updateMilestone).toHaveBeenCalledWith("设计.md", 0, 2);
	});
	it("saves compact statistics milestones on Enter without a duplicate blur update", async () => {
		const { plugin, parent } = setup([
			goal("副业", {
				milestones: [
					{
						name: "月收入",
						kind: "number",
						unit: "$",
						tiers: [500],
						achieved: null,
						hours_at: null,
					},
				],
			}),
		]);
		await renderGoalProgressPanel(parent, plugin, [], { ...options, variant: "statistics" });
		const input = parent.querySelector<HTMLInputElement>(".tn-goal-pending__input")!;
		expect(input.placeholder).toBe("输入当前值");
		expect(parent.querySelector(".tn-goal-pending__update")?.textContent).toBe("更新");
		expect(parent.querySelector(".tn-goal-pending__metrics")?.textContent).toContain(
			"当前$0→阶段目标$500还差 $500"
		);
		input.value = "210";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		input.dispatchEvent(new FocusEvent("blur"));
		expect(plugin.goalService.updateMilestone).toHaveBeenCalledTimes(1);
		expect(plugin.goalService.updateMilestone).toHaveBeenCalledWith("副业.md", 0, 210);
		for (let tick = 0; tick < 4; tick++) await Promise.resolve();
		expect(input.value).toBe("");
		input.dispatchEvent(new FocusEvent("blur"));
		expect(plugin.goalService.updateMilestone).toHaveBeenCalledTimes(1);
	});
	it("cancels compact milestone edits with Escape and requires an explicit update", async () => {
		const { plugin, parent } = setup([
			goal("副业", {
				milestones: [
					{
						name: "粉丝数",
						kind: "number",
						tiers: [1000],
						achieved: null,
						hours_at: null,
					},
				],
			}),
		]);
		await renderGoalProgressPanel(parent, plugin, [], { ...options, variant: "statistics" });
		const input = parent.querySelector<HTMLInputElement>(".tn-goal-pending__input")!;
		input.value = "100";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		input.dispatchEvent(new FocusEvent("blur"));
		expect(plugin.goalService.updateMilestone).not.toHaveBeenCalled();
		input.value = "200";
		input.dispatchEvent(new FocusEvent("blur"));
		expect(plugin.goalService.updateMilestone).not.toHaveBeenCalled();
		parent.querySelector<HTMLButtonElement>(".tn-goal-pending__update")!.click();
		expect(plugin.goalService.updateMilestone).toHaveBeenCalledWith("副业.md", 0, 200);
	});
	it("keeps standalone tag rows visible even when goal progress fails", async () => {
		const goals = [goal("工作"), goal("设计", { mode: "floor", parent: "工作" })];
		const { plugin, parent } = setup(goals);
		jest.mocked(plugin.goalService.getProgress).mockRejectedValue(new Error("unavailable"));
		const view = Object.assign(Object.create(TimeStatisticsView.prototype), {
			plugin,
			period: "week",
			referenceDate: new Date(),
		}) as {
			renderInsights(
				parent: HTMLElement,
				tasks: [],
				tags: TagTimeStatistic[],
				goals: GoalDefinition[]
			): Promise<void>;
		};
		await view.renderInsights(
			parent,
			[],
			[
				{ tag: "设计", durationMs: 3_600_000, taskPaths: ["a.md"] },
				{ tag: null, durationMs: 3_600_000, taskPaths: ["b.md"] },
			],
			goals
		);
		expect(parent.querySelectorAll(".tn-time-statistics__tag-row")).toHaveLength(2);
		expect(
			parent.querySelector(".tn-time-statistics__tag-fill")?.getAttribute("style")
		).toContain("100%");
		expect(parent.querySelector(".tn-time-statistics__tag-duration")?.textContent).toContain(
			"50%"
		);
		expect(
			parent.querySelector(".tn-time-statistics__tag-row .tn-time-statistics__goal-owner")
				?.textContent
		).toBe("算给 工作 › 设计");
		expect(parent.querySelector(".tn-time-statistics__goal-section")?.textContent).toContain(
			"标签统计仍可查看"
		);
	});
	it("renders six full-width task ranking rows with ordinal and attribution", () => {
		const { plugin, parent } = setup([]);
		const view = Object.assign(Object.create(TimeStatisticsView.prototype), { plugin }) as {
			renderTaskRanking(
				parent: HTMLElement,
				tasks: TaskTimeStatistic[],
				goals: GoalDefinition[]
			): void;
		};
		view.renderTaskRanking(
			parent,
			Array.from({ length: 8 }, (_, index) => ({
				taskPath: `${index}.md`,
				taskTitle: `Task ${index}`,
				tags: [],
				durationMs: 3_600_000 - index * 1000,
				isActive: false,
			})),
			[goal("其他目标", { mode: "floor" })]
		);
		expect(parent.querySelectorAll(".tn-time-statistics__rank-row")).toHaveLength(6);
		expect(parent.querySelector(".tn-time-statistics__rank-number")?.textContent).toBe("1");
		expect(
			parent.querySelector(".tn-time-statistics__rank-row .tn-time-statistics__goal-owner")
				?.textContent
		).toBe("未分配");
	});
	it("keeps statistics free of goal creation prompts when there are no goals", async () => {
		const { plugin, parent } = setup([]);
		await renderGoalProgressPanel(parent, plugin, [], {
			...options,
			variant: "statistics",
			recommendedTags: ["工作"],
		});
		expect(parent.children).toHaveLength(0);
	});
	it("uses plain links and distinct goal colors while retaining goal navigation", async () => {
		const { plugin, parent } = setup([
			goal("开发", { mode: "floor" }),
			goal("写作", { mode: "floor" }),
		]);
		const open = jest.fn();
		await renderGoalProgressPanel(parent, plugin, [], {
			...options,
			variant: "statistics",
			onOpenGoal: open,
		});
		const names = parent.querySelectorAll<HTMLAnchorElement>(".tn-goal-ledger__name");
		expect(Array.from(names, (name) => name.tagName)).toEqual(["A", "A"]);
		names[0].click();
		expect(open).toHaveBeenCalledWith("开发.md");
		const colors = Array.from(
			parent.querySelectorAll<HTMLElement>(".tn-goal-ledger__row"),
			(row) => row.style.getPropertyValue("--tn-goal-mode-color")
		);
		expect(new Set(colors).size).toBe(2);
	});
	it("restores classic statistics without attribution or creation UI and shares tag colors", async () => {
		const { plugin, parent } = setup([]);
		const view = Object.assign(Object.create(TimeStatisticsView.prototype), {
			plugin,
			period: "week",
		}) as {
			renderInsights(
				parent: HTMLElement,
				tasks: TaskInfo[],
				tags: TagTimeStatistic[],
				goals: GoalDefinition[]
			): Promise<void>;
			renderTaskRanking(
				parent: HTMLElement,
				tasks: TaskTimeStatistic[],
				goals: GoalDefinition[]
			): void;
		};
		await view.renderInsights(
			parent,
			[],
			[
				{ tag: "工作", durationMs: 3_600_000, taskPaths: ["a.md"] },
				{ tag: "创作", durationMs: 0, taskPaths: ["b.md"] },
			],
			[]
		);
		view.renderTaskRanking(
			parent,
			Array.from({ length: 8 }, (_, index) => ({
				taskPath: `${index}.md`,
				taskTitle: `Task ${index}`,
				tags: ["工作"],
				durationMs: 3_600_000,
				isActive: false,
			})),
			[]
		);
		expect(parent.classList.contains("tn-time-statistics__breakdown--classic")).toBe(true);
		expect(parent.querySelector(".tn-time-statistics__goal-section")).toBeNull();
		expect(parent.querySelector(".tn-time-statistics__goal-owner")).toBeNull();
		expect(parent.querySelector(".tn-time-statistics__tag-footnote")).toBeNull();
		expect(parent.querySelector(".tn-time-statistics__rank-description")).toBeNull();
		expect(
			parent.querySelectorAll(".tn-time-statistics__distribution-strip > span")
		).toHaveLength(1);
		expect(parent.querySelectorAll(".tn-time-statistics__rank-row")).toHaveLength(8);
		const tag = parent.querySelector<HTMLElement>(".tn-time-statistics__tag-row")!;
		const rank = parent.querySelector<HTMLElement>(".tn-time-statistics__rank-row")!;
		expect(rank.style.getPropertyValue("--tn-stats-color")).toBe(
			tag.style.getPropertyValue("--tn-stats-color")
		);
		expect(plugin.goalService.getProgress).not.toHaveBeenCalled();
	});
	it("removes the reserved goal column when an attribution list has no visible progress", async () => {
		const goals = [goal("工作", { mode: "floor" })];
		const { plugin, parent } = setup(goals);
		jest.mocked(plugin.goalService.getProgress).mockResolvedValue({
			goals: [],
			progress: [],
			range: { start: new Date("2026-09-14"), end: new Date("2026-09-21") },
		});
		const view = Object.assign(Object.create(TimeStatisticsView.prototype), {
			plugin,
			period: "week",
			referenceDate: new Date(),
		}) as {
			renderInsights(
				parent: HTMLElement,
				tasks: TaskInfo[],
				tags: TagTimeStatistic[],
				goals: GoalDefinition[]
			): Promise<void>;
		};
		await view.renderInsights(
			parent,
			[],
			[{ tag: "工作", durationMs: 3_600_000, taskPaths: ["a.md"] }],
			goals
		);
		expect(parent.querySelector(".tn-time-statistics__goal-section")).toBeNull();
		expect(parent.querySelector(".tn-time-statistics__insights--single")).not.toBeNull();
		expect(parent.querySelector(".tn-time-statistics__tag-chip")?.textContent).toBe("工作");
	});
	it("colors different tags independently even when they belong to the same goal", () => {
		const goals = [goal("工作目标", { mode: "floor", scope: ["工作"] })];
		const { plugin, parent } = setup(goals);
		const view = Object.assign(Object.create(TimeStatisticsView.prototype), {
			plugin,
			period: "week",
		}) as {
			renderTagDistribution(
				parent: HTMLElement,
				tags: TagTimeStatistic[],
				goals: GoalDefinition[]
			): void;
			renderTaskRanking(
				parent: HTMLElement,
				tasks: TaskTimeStatistic[],
				goals: GoalDefinition[]
			): void;
		};
		const tags = ["工作/代码", "工作/策划"];
		view.renderTagDistribution(
			parent,
			tags.map((tag) => ({ tag, durationMs: 3_600_000, taskPaths: [] })),
			goals
		);
		view.renderTaskRanking(
			parent,
			tags.map((tag, index) => ({
				taskPath: `${index}.md`,
				taskTitle: `Task ${index}`,
				tags: [tag],
				durationMs: 3_600_000,
				isActive: false,
			})),
			goals
		);
		const colors = (selector: string) =>
			Array.from(parent.querySelectorAll<HTMLElement>(selector), (row) =>
				row.style.getPropertyValue("--tn-stats-color")
			);
		const tagColors = colors(".tn-time-statistics__tag-row");
		expect(new Set(tagColors).size).toBe(2);
		expect(colors(".tn-time-statistics__rank-row")).toEqual(tagColors);
	});
});
