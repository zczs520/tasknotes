import { ItemView, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import type TaskNotesPlugin from "../main";
import { GOALS_VIEW_TYPE } from "../types";
import { goalCopy } from "../goals/goalCopy";
import type { GoalDefinition, GoalProgress } from "../goals/goalTypes";
import type { TimeStatisticsPeriod } from "../utils/timeStatistics";
import {
	buildTimeStatisticsSegments,
	isCurrentTimeStatisticsPeriod,
	shiftTimeStatisticsReference,
} from "../utils/timeStatistics";
import { GoalCreationModal } from "../modals/GoalCreationModal";
import { GoalDetailModal } from "../modals/GoalDetailModal";
import {
	attributeGoalSegments,
	goalInvestedHours,
	milestoneNeedsUpdate,
} from "../goals/goalCalculations";
import { isMilestoneComplete, renderGoalMilestoneCard } from "../ui/goals/GoalMilestoneCard";
import { getStatisticsColor } from "../utils/statisticsColors";

type GoalFilter = "all" | "active" | "paused" | "done";
type GoalRange = TimeStatisticsPeriod;

function modeLabel(plugin: TaskNotesPlugin, goal: GoalDefinition): string {
	return goal.mode ? goalCopy(plugin, goal.mode) : goalCopy(plugin, "aggregate");
}

export class GoalsView extends ItemView {
	private filter: GoalFilter = "all";
	private range: GoalRange = "week";
	private referenceDate = new Date();
	private renderVersion = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: TaskNotesPlugin
	) {
		super(leaf);
	}

	getViewType(): string {
		return GOALS_VIEW_TYPE;
	}
	getDisplayText(): string {
		return goalCopy(this.plugin, "management");
	}
	getIcon(): string {
		return "flag";
	}

	async setState(state: { selectedGoalPath?: string }): Promise<void> {
		if (state.selectedGoalPath) this.openDetail(state.selectedGoalPath);
	}

	async onOpen(): Promise<void> {
		await this.plugin.onReady();
		this.registerEvent(this.app.vault.on("modify", () => void this.render()));
		this.registerEvent(this.app.vault.on("create", () => void this.render()));
		this.registerEvent(this.app.vault.on("delete", () => void this.render()));
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private openDetail(path: string): void {
		new GoalDetailModal(this.plugin, path, () => this.render()).open();
	}

	private translate(key: string, vars?: Record<string, string | number>): string {
		return this.plugin.i18n.translate(`goals.view.${key}`, vars);
	}

	private progressText(progress: GoalProgress): string {
		if (progress.goal.mode === "count") {
			const actual = Math.round(progress.actual);
			if (progress.target === null) return this.translate("countActual", { actual });
			return this.translate("countProgress", { actual, target: progress.target });
		}
		const actual = progress.actual.toFixed(1);
		if (progress.target === null) return `${actual}h`;
		const operator = progress.goal.mode === "ceiling" ? "≤" : "";
		return `${actual} / ${operator}${progress.target}h`;
	}

	openCreation(): GoalCreationModal {
		const modal = new GoalCreationModal(this.plugin, () => this.render());
		modal.open();
		return modal;
	}

	private renderSegments<T extends string>(
		parent: HTMLElement,
		values: readonly T[],
		selected: T,
		label: (value: T) => string,
		onPick: (value: T) => void
	): void {
		const group = parent.createDiv({ cls: "tn-goals-view__segments" });
		for (const value of values) {
			const button = group.createEl("button", {
				cls: selected === value ? "is-selected" : "",
				text: label(value),
				attr: { type: "button", "aria-pressed": String(selected === value) },
			});
			button.addEventListener("click", () => onPick(value));
		}
	}

	private rangeLabel(): string {
		const currentLocale = this.plugin.i18n.getCurrentLocale();
		const locale = currentLocale === "zh" ? "zh-CN" : currentLocale;
		if (this.range === "day")
			return this.referenceDate.toLocaleDateString(locale, {
				year: "numeric",
				month: "long",
				day: "numeric",
				weekday: "short",
			});
		if (this.range === "month")
			return this.referenceDate.toLocaleDateString(locale, {
				year: "numeric",
				month: "long",
			});
		if (this.range === "year")
			return this.referenceDate.toLocaleDateString(locale, { year: "numeric" });
		const start = shiftTimeStatisticsReference(this.referenceDate, "week", 0);
		start.setDate(
			start.getDate() -
				((start.getDay() - (this.plugin.settings.calendarViewSettings.firstDay ?? 0) + 7) %
					7)
		);
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		return `${start.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
	}

	private matches(progress: GoalProgress): boolean {
		if (this.filter === "active")
			return progress.goal.status === "active" && progress.state !== "complete";
		if (this.filter === "paused") return progress.goal.status === "paused";
		if (this.filter === "done") return progress.state === "complete";
		return true;
	}

	private renderRow(parent: HTMLElement, progress: GoalProgress): void {
		const goal = progress.goal;
		const row = parent.createDiv({ cls: `tn-goals-view__row is-${progress.state}` });
		row.style.setProperty("--tn-goal-mode-color", getStatisticsColor("goal", goal.path));
		if (goal.children.length) row.addClass("is-parent");
		if (goal.parent) row.addClass("is-child");
		const identity = row.createDiv({ cls: "tn-goals-view__identity" });
		identity.createSpan({ cls: "tn-goals-view__dot" });
		const copy = identity.createDiv();
		copy.createEl("strong", { text: goal.name });
		if (goal.status === "paused")
			copy.createSpan({
				cls: "tn-goals-view__status is-paused",
				text: goalCopy(this.plugin, "paused"),
			});
		if (goal.children.length)
			copy.createSpan({
				cls: "tn-goals-view__note",
				text: this.translate(
					goal.children.length === 1 ? "childCountOne" : "childCountOther",
					{ count: goal.children.length }
				),
			});
		if (goal.why) copy.createDiv({ cls: "tn-goals-view__why", text: goal.why });
		row.createSpan({ cls: "tn-goals-view__mode", text: modeLabel(this.plugin, goal) });
		const meter = row.createDiv({ cls: "tn-goals-view__meter" });
		const bar = meter.createDiv({ cls: "tn-goal-card__bar" });
		const fill = bar.createDiv({ cls: "tn-goal-card__fill" });
		fill.style.width = `${Math.min(1, progress.ratio) * 100}%`;
		if (
			this.range !== "year" &&
			goal.mode &&
			goal.mode !== "count" &&
			goal.status !== "paused"
		) {
			const pace = bar.createSpan({ cls: "tn-goal-card__pace" });
			pace.style.left = `${progress.pace * 100}%`;
		}
		meter.createSpan({ text: this.progressText(progress) });
		row.createSpan({
			cls: "tn-goals-view__scope",
			text: goal.scope.length
				? goal.scope.join(" / ")
				: goal.children.length
					? this.translate("ownedByChildren")
					: "—",
		});
		row.createSpan({
			cls: "tn-goals-view__milestone-count",
			text: goal.milestones.length
				? `${goal.milestones.filter(isMilestoneComplete).length}/${goal.milestones.length}`
				: "—",
		});
		const arrow = row.createSpan({ cls: "tn-goals-view__arrow" });
		setIcon(arrow, "chevron-right");
		row.tabIndex = 0;
		row.setAttribute("role", "button");
		row.setAttribute("aria-label", this.translate("openGoal", { name: goal.name }));
		row.addEventListener("click", () => this.openDetail(goal.path));
		row.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				this.openDetail(goal.path);
			}
		});
	}

	private renderMilestones(
		parent: HTMLElement,
		goals: readonly GoalDefinition[],
		invested: ReadonlyMap<string, number>
	): void {
		const items = goals.flatMap((goal) =>
			goal.milestones.map((milestone, index) => ({ goal, milestone, index }))
		);
		const section = parent.createDiv({ cls: "tn-goals-view__milestones" });
		const heading = section.createDiv({ cls: "tn-goals-view__milestone-heading" });
		heading.createEl("strong", { text: this.translate("milestones") });
		heading.createSpan({
			cls: "tn-goals-view__milestone-subtitle",
			text: this.translate("milestoneSubtitle"),
		});
		const complete = items.filter((item) => isMilestoneComplete(item.milestone)).length;
		const stale = items.filter((item) =>
			milestoneNeedsUpdate(item.goal, item.milestone)
		).length;
		heading.createSpan({
			cls: "tn-goals-view__milestone-summary",
			text: stale
				? this.translate("milestoneSummaryStale", {
						count: items.length,
						complete,
						stale,
					})
				: this.translate("milestoneSummary", { count: items.length, complete }),
		});
		if (!items.length)
			section.createDiv({
				cls: "tn-goals-view__milestone-empty",
				text: this.translate("noMilestones"),
			});
		for (const item of [
			...items.filter((entry) => !isMilestoneComplete(entry.milestone)),
			...items.filter((entry) => isMilestoneComplete(entry.milestone)),
		]) {
			renderGoalMilestoneCard(section, this.plugin, item.goal, item.index, {
				investedHours: invested.get(item.goal.path) ?? 0,
				onChanged: () => this.render(),
				onOpenGoal: (path) => this.openDetail(path),
			});
		}
	}

	private async render(): Promise<void> {
		const version = ++this.renderVersion;
		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: "tasknotes-plugin tn-goals-view" });
		if (Platform.isMobile) {
			root.createDiv({
				cls: "tn-goals-view__desktop-only",
				text: goalCopy(this.plugin, "notDesktop"),
			});
			return;
		}
		const tasks = await this.plugin.cacheManager.getAllTasks();
		const result = await this.plugin.goalService.getProgress(
			tasks,
			this.range,
			this.referenceDate
		);
		if (version !== this.renderVersion) return;
		const visible = result.progress.filter((progress) => this.matches(progress));
		const readOnly = !isCurrentTimeStatisticsPeriod(
			this.referenceDate,
			this.range,
			new Date(),
			this.plugin.settings.calendarViewSettings.firstDay ?? 0
		);
		const shell = root.createDiv({ cls: "tn-goals-view__shell" });
		const top = shell.createDiv({ cls: "tn-goals-view__toolbar" });
		const title = top.createDiv();
		title.createEl("h1", { text: this.translate("title") });
		title.createSpan({
			text: this.translate(result.goals.length === 1 ? "goalCountOne" : "goalCountOther", {
				count: result.goals.length,
			}),
		});
		this.renderSegments(
			top,
			["all", "active", "paused", "done"] as const,
			this.filter,
			(value) => this.translate(`filters.${value}`),
			(value) => {
				this.filter = value;
				void this.render();
			}
		);
		const add = top.createEl("button", {
			cls: "mod-cta",
			text: goalCopy(this.plugin, "newGoal"),
		});
		add.addEventListener("click", () => this.openCreation());
		const range = shell.createDiv({ cls: "tn-goals-view__range" });
		this.renderSegments(
			range,
			["day", "week", "month", "year"] as const,
			this.range,
			(value) => this.translate(`periods.${value}`),
			(value) => {
				this.range = value;
				void this.render();
			}
		);
		const previous = range.createEl("button", {
			text: "‹",
			attr: { type: "button", "aria-label": this.translate("previousPeriod") },
		});
		previous.addEventListener("click", () => {
			this.referenceDate = shiftTimeStatisticsReference(this.referenceDate, this.range, -1);
			void this.render();
		});
		range.createSpan({ cls: "tn-goals-view__range-label", text: this.rangeLabel() });
		if (readOnly)
			range.createSpan({
				cls: "tn-goals-view__history-badge",
				text: this.translate("historyReadonly"),
			});
		const next = range.createEl("button", {
			text: "›",
			attr: { type: "button", "aria-label": this.translate("nextPeriod") },
		});
		next.addEventListener("click", () => {
			this.referenceDate = shiftTimeStatisticsReference(this.referenceDate, this.range, 1);
			void this.render();
		});
		const today = range.createEl("button", {
			text: this.translate("backToCurrent"),
			attr: { type: "button" },
		});
		today.addEventListener("click", () => {
			this.referenceDate = new Date();
			void this.render();
		});
		const table = shell.createDiv({ cls: "tn-goals-view__table" });
		const head = table.createDiv({ cls: "tn-goals-view__table-head" });
		for (const label of [
			this.translate("columns.goal"),
			this.translate("columns.type"),
			this.range === "day"
				? this.translate("columns.today")
				: this.range === "month"
					? this.translate("columns.thisMonth")
					: this.range === "year"
						? this.translate("columns.thisYear")
						: this.translate("columns.thisWeek"),
			this.translate("columns.tags"),
			this.translate("columns.milestones"),
			"",
		])
			head.createSpan({ text: label });
		if (!visible.length)
			table.createDiv({
				cls: "tn-goals-view__empty",
				text: goalCopy(this.plugin, "noGoals"),
			});
		const rendered = new Set<string>();
		for (const progress of visible) {
			if (rendered.has(progress.goal.path)) continue;
			this.renderRow(table, progress);
			rendered.add(progress.goal.path);
			for (const child of visible.filter((item) => item.goal.parent === progress.goal.name)) {
				this.renderRow(table, child);
				rendered.add(child.goal.path);
			}
		}
		const liveGoals = await this.plugin.goalService.listGoals();
		if (version !== this.renderVersion) return;
		const now = new Date();
		const created = liveGoals
			.map((goal) => new Date(`${goal.created}T00:00:00`).getTime())
			.filter(Number.isFinite);
		const segments = buildTimeStatisticsSegments(
			tasks,
			{ start: new Date(Math.min(now.getTime(), ...created)), end: now },
			now
		);
		const attributed = attributeGoalSegments(liveGoals, segments);
		this.renderMilestones(
			shell,
			liveGoals,
			new Map(
				liveGoals.map((goal) => [goal.path, goalInvestedHours(goal, liveGoals, attributed)])
			)
		);
	}
}
