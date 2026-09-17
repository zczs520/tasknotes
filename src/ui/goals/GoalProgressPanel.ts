import { Modal, Notice, Platform, setIcon } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { TaskInfo } from "../../types";
import type { GoalDefinition, GoalProgress } from "../../goals/goalTypes";
import {
	attributeGoalSegments,
	countZeroGoalPeriods,
	getGoalHistoryStart,
	goalInvestedHours,
	milestoneNeedsUpdate,
} from "../../goals/goalCalculations";
import { goalCopy } from "../../goals/goalCopy";
import { GoalCreationModal } from "../../modals/GoalCreationModal";
import { showConfirmationModal } from "../../modals/ConfirmationModal";
import { getStatisticsColor } from "../../utils/statisticsColors";
import { formatMilestoneValue, isMilestoneComplete } from "./GoalMilestoneCard";
import {
	buildTimeStatisticsSegments,
	shiftTimeStatisticsReference,
	type TimeStatisticsPeriod,
	type TimeStatisticsRange,
} from "../../utils/timeStatistics";

export interface GoalProgressPanelOptions {
	variant: "strip" | "statistics";
	period?: TimeStatisticsPeriod;
	referenceDate?: Date;
	onRefresh: () => void | Promise<void>;
	onOpenGoal?: (path: string) => void | Promise<void>;
	recommendedTags?: readonly string[];
	readOnly?: boolean;
	stripState?: GoalStripState;
	onStripStateChange?: (state: GoalStripState) => void | Promise<void>;
}

export type GoalStripState = "bar" | "open" | "off";

function formatActual(progress: GoalProgress, chinese: boolean): string {
	if (progress.goal.mode === "count")
		return `${Math.round(progress.actual)}${chinese ? " 次" : "×"}`;
	if (progress.actual < 1) return `${Math.round(progress.actual * 60)}m`;
	return `${progress.actual.toFixed(1)}h`;
}

function formatTarget(progress: GoalProgress, chinese: boolean): string {
	if (progress.target === null) return "";
	const operator = progress.goal.mode === "ceiling" ? "≤" : "";
	const unit = progress.goal.mode === "count" ? (chinese ? " 次" : "×") : "h";
	return `${operator}${progress.target}${unit}`;
}

function stateCopy(plugin: TaskNotesPlugin, progress: GoalProgress): string {
	return goalCopy(
		plugin,
		progress.state === "complete"
			? "achieved"
			: progress.state === "on-track"
				? "onTrack"
				: progress.state === "behind"
					? "behind"
					: progress.state === "over"
						? "over"
						: progress.state === "aggregate"
							? "aggregate"
							: progress.state === "paused"
								? "paused"
								: "idle"
	);
}

function compactProgressValue(
	progress: GoalProgress,
	chinese: boolean,
	children: readonly GoalProgress[] = []
): string {
	if (progress.target === null) {
		const owned = children.filter((child) => child.goal.parent === progress.goal.name);
		// Do not label a mixture of counts and hours as a total time budget.
		if (
			owned.length &&
			owned.every((child) => child.goal.mode !== "count" && child.target !== null)
		) {
			const total = owned.reduce((sum, child) => sum + (child.target ?? 0), 0);
			return `${Number(progress.actual.toFixed(1))}/${Number(total.toFixed(1))}h`;
		}
		return formatActual(progress, chinese).replace(/\s+/gu, "");
	}
	const actual =
		progress.goal.mode === "count"
			? Math.round(progress.actual)
			: Number(progress.actual.toFixed(1));
	const unit = progress.goal.mode === "count" ? (chinese ? "次" : "×") : "h";
	const operator = progress.goal.mode === "ceiling" ? "≤" : "";
	return `${actual}/${operator}${progress.target}${unit}`;
}

function visualClasses(progress: GoalProgress): string {
	return `is-${progress.goal.mode ?? "aggregate"} is-${progress.state}`;
}

function remainingDays(range: TimeStatisticsRange): number {
	return Math.max(0, Math.ceil((range.end.getTime() - Date.now()) / 86_400_000));
}

function gapScore(progress: GoalProgress): number {
	if (progress.state === "paused") return -100;
	if (progress.state === "over") return 4 + Math.max(0, progress.ratio - 1);
	if (progress.state === "idle") return 3 + progress.pace;
	if (progress.state === "behind") return 2 + Math.max(0, progress.pace - progress.ratio);
	if (progress.state === "on-track") return 1 + Math.max(0, progress.pace - progress.ratio);
	if (progress.state === "aggregate") return 0.5 - progress.ratio;
	return -1;
}

class MilestoneAchievementModal extends Modal {
	constructor(
		private plugin: TaskNotesPlugin,
		private goal: GoalDefinition,
		private milestoneName: string,
		private value: string,
		private hours: number | null,
		private crossed: number
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass("tn-goal-achievement-modal");
		const card = this.contentEl.createDiv({ cls: "tn-goal-achievement" });
		const icon = card.createDiv({ cls: "tn-goal-achievement__icon" });
		setIcon(icon, "flag");
		card.createDiv({
			cls: "tn-goal-achievement__eyebrow",
			text: `${this.goal.name} · ${this.milestoneName}`,
		});
		card.createDiv({ cls: "tn-goal-achievement__value", text: this.value });
		card.createDiv({ cls: "tn-goal-achievement__date", text: new Date().toLocaleDateString() });
		const facts = card.createDiv({ cls: "tn-goal-achievement__facts" });
		const hours = facts.createDiv();
		hours.createEl("strong", { text: this.hours === null ? "—" : `${this.hours.toFixed(1)}h` });
		hours.createSpan({
			text: this.plugin.i18n.getCurrentLocale() === "zh" ? "为此投入" : "invested",
		});
		const createdAt = new Date(`${this.goal.created}T00:00:00`);
		const elapsedDays = Number.isNaN(createdAt.getTime())
			? null
			: Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / 86_400_000));
		const elapsed = facts.createDiv();
		elapsed.createEl("strong", {
			text: elapsedDays === null ? "—" : `${Math.max(1, Math.ceil(elapsedDays / 7))}`,
		});
		elapsed.createSpan({
			text: this.plugin.i18n.getCurrentLocale() === "zh" ? "历时（周）" : "weeks elapsed",
		});
		if (this.crossed > 1) {
			const tiers = facts.createDiv();
			tiers.createEl("strong", { text: String(this.crossed) });
			tiers.createSpan({
				text:
					this.plugin.i18n.getCurrentLocale() === "zh" ? "一次跨过档位" : "tiers crossed",
			});
		}
		const button = card.createEl("button", {
			cls: "mod-cta",
			text: goalCopy(this.plugin, "continue"),
		});
		button.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

async function updateBooleanMilestone(
	plugin: TaskNotesPlugin,
	goal: GoalDefinition,
	index: number,
	onRefresh: () => void | Promise<void>
): Promise<void> {
	const milestone = goal.milestones[index];
	const confirmed = await showConfirmationModal(plugin.app, {
		title: `${goalCopy(plugin, "confirmAchievement")}「${milestone.name}」？`,
		message: goalCopy(plugin, "confirmAchievementDescription"),
		confirmText: goalCopy(plugin, "confirmAchievement"),
		isDestructive: false,
	});
	if (!confirmed) return;
	try {
		await plugin.goalService.updateMilestone(goal.path, index, true);
		const updated = await plugin.goalService.getGoal(goal.path);
		const achieved = updated?.milestones[index];
		new MilestoneAchievementModal(
			plugin,
			goal,
			milestone.name,
			"✓",
			typeof achieved?.hours_at === "number" ? achieved.hours_at : null,
			1
		).open();
		await onRefresh();
	} catch (error) {
		new Notice(String(error), 8000);
	}
}

async function updateNumberMilestone(
	plugin: TaskNotesPlugin,
	goal: GoalDefinition,
	index: number,
	value: number,
	onRefresh: () => void | Promise<void>
): Promise<boolean> {
	try {
		const result = await plugin.goalService.updateMilestone(goal.path, index, value);
		if (result.achievedTier !== undefined) {
			const updated = await plugin.goalService.getGoal(goal.path);
			const hoursAt = updated?.milestones[index]?.hours_at;
			const hours =
				hoursAt && typeof hoursAt === "object"
					? Number(hoursAt[String(result.achievedTier)])
					: null;
			new MilestoneAchievementModal(
				plugin,
				goal,
				goal.milestones[index].name,
				formatMilestoneValue(result.achievedTier, goal.milestones[index].unit),
				Number.isFinite(hours) ? hours : null,
				result.crossedTiers.length
			).open();
		}
		await onRefresh();
		return true;
	} catch (error) {
		new Notice(String(error), 8000);
		return false;
	}
}

function renderPendingMilestone(
	parent: HTMLElement,
	plugin: TaskNotesPlugin,
	goal: GoalDefinition,
	index: number,
	onRefresh: () => void | Promise<void>,
	readOnly: boolean,
	compact = false,
	investedHours?: number,
	rail = false
): void {
	const milestone = goal.milestones[index];
	const chinese = plugin.i18n.getCurrentLocale() === "zh";
	const card = compact && !rail;
	const row = parent.createDiv({
		cls: `tn-goal-pending${rail ? " tn-goal-pending--rail" : ""}${card ? " tn-goal-pending--compact" : ""}`,
	});
	if (milestone.kind !== "boolean" || !compact || card)
		row.createSpan({ cls: "tn-goal-pending__flag", text: "⚑" });
	const body = card ? row.createDiv({ cls: "tn-goal-pending__body" }) : row;
	const headline = card ? body.createDiv({ cls: "tn-goal-pending__headline" }) : body;
	headline.createSpan({
		cls: "tn-goal-pending__name",
		text: compact || rail ? milestone.name : `${goal.name} · ${milestone.name}`,
		attr: { title: `${goal.name} · ${milestone.name}` },
	});
	const sourceDate = new Date(`${milestone.updatedAt ?? goal.created}T00:00:00`).getTime();
	const elapsedDays = Number.isFinite(sourceDate)
		? Math.max(0, Math.floor((Date.now() - sourceDate) / 86_400_000))
		: 0;
	const updateAge = chinese
		? elapsedDays === 0
			? "今天更新"
			: elapsedDays === 1
				? "昨天更新"
				: elapsedDays < 7
					? `${elapsedDays} 天前更新`
					: `${Math.floor(elapsedDays / 7)} 周前更新`
		: elapsedDays === 0
			? "Updated today"
			: elapsedDays < 7
				? `Updated ${elapsedDays}d ago`
				: `Updated ${Math.floor(elapsedDays / 7)}w ago`;
	if (card)
		headline.createSpan({
			cls: `tn-goal-pending__age${milestoneNeedsUpdate(goal, milestone) ? " is-stale" : ""}`,
			text: updateAge,
		});
	if (milestone.kind === "boolean") {
		const hours = typeof milestone.hours_at === "number" ? milestone.hours_at : investedHours;
		if (card) {
			body.createDiv({
				cls: "tn-goal-pending__boolean-meta",
				text:
					hours !== undefined
						? `${chinese ? "当前已投入" : "Invested"} ${Number(hours.toFixed(1))}h · ${chinese ? "阶段目标：完成" : "Stage: complete"}`
						: chinese
							? "当前未完成 · 阶段目标：完成"
							: "Open · Stage: complete",
			});
		}
		if (!readOnly) {
			const check = row.createEl("button", {
				cls: "tn-goal-pending__check",
				attr: { type: "button", "aria-label": goalCopy(plugin, "confirmAchievement") },
				text: compact && !card ? "" : chinese ? "标记达成" : "Mark achieved",
			});
			check.addEventListener("click", (event) => {
				event.stopPropagation();
				if (check.disabled) return;
				check.disabled = true;
				void updateBooleanMilestone(plugin, goal, index, onRefresh)
					.catch((error) => new Notice(String(error), 8000))
					.finally(() => {
						check.disabled = false;
					});
			});
		}
		if ((compact || rail) && !card && hours !== undefined) {
			row.createSpan({
				cls: "tn-goal-pending__value",
				text: `${chinese ? "已投入" : "Invested"} ${Number(hours.toFixed(1))}h`,
			});
		}
		return;
	}

	const current = milestone.current ?? 0;
	const next = (milestone.tiers ?? []).find((tier) => tier > current);
	const unit = milestone.unit ?? "";
	if (card && next !== undefined) {
		const tiers = milestone.tiers ?? [];
		const previous = [...tiers].reverse().find((tier) => tier <= current) ?? 0;
		const stageProgress = Math.max(0, Math.min(1, (current - previous) / (next - previous)));
		const metrics = body.createDiv({ cls: "tn-goal-pending__metrics" });
		const currentMetric = metrics.createDiv({ cls: "tn-goal-pending__metric" });
		currentMetric.createSpan({ text: chinese ? "当前" : "Current" });
		currentMetric.createEl("strong", { text: formatMilestoneValue(current, unit) });
		metrics.createSpan({ cls: "tn-goal-pending__arrow", text: "→" });
		const nextMetric = metrics.createDiv({ cls: "tn-goal-pending__metric" });
		nextMetric.createSpan({ text: chinese ? "阶段目标" : "Stage goal" });
		nextMetric.createEl("strong", { text: formatMilestoneValue(next, unit) });
		metrics.createSpan({
			cls: "tn-goal-pending__remaining",
			text: `${chinese ? "还差" : "Remaining"} ${formatMilestoneValue(Number((next - current).toFixed(2)), unit)}`,
		});
		const track = body.createSpan({ cls: "tn-goal-pending__stage-track" });
		const fill = track.createSpan({ cls: "tn-goal-pending__stage-fill" });
		fill.style.width = `${stageProgress * 100}%`;
	} else {
		body.createSpan({
			cls: "tn-goal-pending__value",
			text: `${formatMilestoneValue(current, unit)}${compact ? "" : next === undefined ? " ✓" : ` → ${formatMilestoneValue(next, unit)}`}`,
		});
		if (milestoneNeedsUpdate(goal, milestone)) {
			const weeks = Math.max(1, Math.floor(elapsedDays / 7));
			body.createSpan({
				cls: "tn-goal-pending__stale",
				text: `${compact ? "· " : ""}${chinese ? `${weeks} 周未更新` : `${weeks}w since update`}`,
			});
		}
	}
	if (!readOnly) {
		const editor = card ? row.createDiv({ cls: "tn-goal-pending__editor" }) : row;
		const input = editor.createEl("input", {
			cls: "tn-goal-pending__input",
			attr: {
				type: "number",
				min: "0",
				step: "any",
				placeholder: rail
					? chinese
						? "更新"
						: "Update"
					: compact
						? chinese
							? "输入当前值"
							: "Current value"
						: chinese
							? "新数值"
							: "Value",
				"aria-label": milestone.name,
				"data-goal-path": goal.path,
				"data-milestone-index": String(index),
				title: chinese ? "输入后按 Enter 保存" : "Press Enter to save",
			},
		});
		const update = rail
			? null
			: editor.createEl("button", {
					cls: "tn-goal-pending__update",
					text: chinese ? "更新" : "Update",
					attr: { type: "button" },
				});
		const submit = async (): Promise<void> => {
			if (!input.value.trim() || !input.checkValidity()) {
				input.reportValidity();
				input.focus();
				return;
			}
			if (input.disabled) return;
			if (update) update.disabled = true;
			input.disabled = true;
			try {
				if (
					await updateNumberMilestone(plugin, goal, index, Number(input.value), onRefresh)
				) {
					input.value = "";
				}
			} finally {
				if (update) update.disabled = false;
				input.disabled = false;
			}
		};
		update?.addEventListener("click", () => void submit());
		if (rail) {
			input.addEventListener("blur", () => {
				if (input.value.trim() && !input.disabled) void submit();
			});
		}
		input.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				input.value = "";
				input.blur();
				input
					.closest<HTMLElement>(".tn-goal-strip__overlay")
					?.focus({ preventScroll: true });
			}
			if (event.key === "Enter" && !input.disabled) {
				event.preventDefault();
				void submit();
			}
		});
	}
}

function renderLedgerRow(
	parent: HTMLElement,
	plugin: TaskNotesPlugin,
	progress: GoalProgress,
	options: GoalProgressPanelOptions,
	previous: GoalProgress | undefined,
	hasChildren = false,
	zeroPeriods = 0
): void {
	const chinese = plugin.i18n.getCurrentLocale() === "zh";
	const row = parent.createDiv({ cls: `tn-goal-ledger__row ${visualClasses(progress)}` });
	row.style.setProperty("--tn-goal-mode-color", getStatisticsColor("goal", progress.goal.path));
	const header = row.createDiv({ cls: "tn-goal-ledger__header" });
	header.createSpan({ cls: "tn-goal-ledger__dot" });
	const title = header.createEl("a", {
		cls: "tn-goal-ledger__name",
		text: progress.goal.name,
		attr: { href: progress.goal.path, title: progress.goal.name },
	});
	title.addEventListener("click", (event) => {
		event.preventDefault();
		void options.onOpenGoal?.(progress.goal.path);
	});
	if (!progress.goal.mode)
		header.createSpan({
			cls: "tn-goal-ledger__aggregate",
			text: goalCopy(plugin, "aggregate"),
		});
	if (previous) {
		header.createSpan({
			cls: "tn-goal-ledger__previous",
			text: `${chinese ? { day: "昨日", week: "上周", month: "上月", year: "去年" }[options.period ?? "week"] : "Prev"} ${formatActual(previous, chinese)}`,
		});
	}
	header.createSpan({
		cls: "tn-goal-ledger__actual",
		text:
			progress.target !== null && options.period !== "year"
				? String(
						progress.goal.mode === "count"
							? Math.round(progress.actual)
							: Number(progress.actual.toFixed(1))
					)
				: formatActual(progress, chinese),
	});
	if (progress.target !== null && options.period !== "year") {
		header.createSpan({
			cls: "tn-goal-ledger__target",
			text: `/ ${formatTarget(progress, chinese)}`,
		});
	}
	if (hasChildren || options.period === "year") return;
	renderMicroBar(row, progress, options.period);
	if (progress.state === "idle" || progress.state === "paused") {
		const unit = {
			day: chinese ? "天" : "days",
			week: chinese ? "周" : "weeks",
			month: chinese ? "个月" : "months",
			year: chinese ? "年" : "years",
		}[options.period ?? "week"];
		row.createSpan({
			cls: "tn-goal-ledger__note",
			text:
				zeroPeriods > 0
					? chinese
						? `已连续 ${zeroPeriods} ${unit}为零`
						: `No investment for ${zeroPeriods} ${unit}`
					: stateCopy(plugin, progress),
		});
	}
}

function renderMicroBar(
	parent: HTMLElement,
	progress: GoalProgress,
	period: TimeStatisticsPeriod | undefined
): void {
	const bar = parent.createSpan({ cls: "tn-goal-strip__bar" });
	const fill = bar.createSpan({ cls: "tn-goal-strip__fill" });
	fill.style.width = `${Math.min(1, progress.ratio) * 100}%`;
	if (
		progress.state !== "complete" &&
		progress.state !== "paused" &&
		progress.goal.mode !== "count" &&
		period !== "year"
	) {
		const pace = bar.createSpan({ cls: "tn-goal-strip__pace" });
		pace.style.left = `${progress.pace * 100}%`;
	}
}

function renderGoalStrip(
	parent: HTMLElement,
	plugin: TaskNotesPlugin,
	goals: readonly GoalDefinition[],
	progressItems: readonly GoalProgress[],
	range: TimeStatisticsRange,
	options: GoalProgressPanelOptions,
	tasks: readonly TaskInfo[]
): void {
	const state = options.stripState ?? "bar";
	const chinese = plugin.i18n.getCurrentLocale() === "zh";
	const active = progressItems.filter((item) => item.goal.status === "active");
	const actionable = active.filter((item) => item.goal.mode);
	const complete = actionable.filter((item) => item.state === "complete").length;
	const milestones = goals.flatMap((goal) =>
		goal.milestones.map((milestone, index) => ({ goal, milestone, index }))
	);
	const pendingMilestones = milestones.filter((item) => !isMilestoneComplete(item.milestone));
	const staleMilestones = goals.flatMap((goal) =>
		goal.milestones
			.map((milestone, index) => ({ goal, milestone, index }))
			.filter((item) => milestoneNeedsUpdate(item.goal, item.milestone))
	);
	const setState = (next: GoalStripState): void => {
		parent.replaceChildren();
		renderGoalStrip(
			parent,
			plugin,
			goals,
			progressItems,
			range,
			{ ...options, stripState: next },
			tasks
		);
		parent.dataset.goalStripState = next;
		parent.classList.toggle("is-open", next === "open");
		void Promise.resolve(options.onStripStateChange?.(next))
			.then(() => {
				const selector =
					next === "open"
						? ".tn-goal-strip__overlay"
						: next === "off"
							? ".tn-goal-strip__badge"
							: ".tn-goal-strip__toggle";
				if (parent.dataset.goalStripState === next)
					parent.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
			})
			.catch((error) => new Notice(String(error), 8000));
	};
	const panel = parent.createDiv({
		cls: `tn-goal-panel tn-goal-panel--strip is-${state}`,
	});
	panel.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && state === "open") {
			event.preventDefault();
			setState("bar");
		}
	});
	if (state === "off") {
		const badge = panel.createEl("button", {
			cls: "tn-goal-strip__badge",
			attr: { type: "button", "aria-label": "展开目标横幅" },
		});
		badge.createSpan({ cls: "tn-goal-strip__badge-dot" });
		badge.createSpan({
			text: `${chinese ? "目标" : "Goals"} ${complete}/${actionable.length}`,
		});
		if (staleMilestones.length) {
			badge.createSpan({ text: `⚑${staleMilestones.length}` });
		}
		badge.addEventListener("click", () => setState("bar"));
		return;
	}
	if (goals.length === 0) {
		panel.addClass("is-empty");
		const empty = panel.createDiv({ cls: "tn-goal-strip__empty" });
		const icon = empty.createSpan();
		setIcon(icon, "flag");
		empty.createSpan({ text: "已记录的时间还没有目标在看着它们" });
		const create = empty.createEl("button", {
			cls: "mod-cta",
			text: goalCopy(plugin, "newGoal"),
		});
		create.addEventListener("click", () =>
			new GoalCreationModal(plugin, options.onRefresh).open()
		);
		return;
	}
	const bar = panel.createDiv({ cls: "tn-goal-strip" });
	bar.createSpan({ cls: "tn-goal-strip__label", text: chinese ? "目标" : "Goals" });
	bar.createSpan({
		cls: "tn-goal-strip__summary",
		text: `${complete}/${actionable.length} · ${chinese ? `还剩${remainingDays(range)}天` : `${remainingDays(range)}d left`}`,
	});
	bar.createSpan({ cls: "tn-goal-strip__divider" });
	const scroller = bar.createDiv({ cls: "tn-goal-strip__scroller" });
	for (const progress of [...active].sort((left, right) => gapScore(right) - gapScore(left))) {
		const pill = scroller.createEl("button", {
			cls: `tn-goal-strip__pill ${visualClasses(progress)}`,
			attr: {
				type: "button",
				"aria-label": `展开目标 ${progress.goal.name}`,
				"aria-expanded": String(state === "open"),
			},
		});
		pill.createSpan({ cls: "tn-goal-ledger__dot" });
		pill.style.setProperty(
			"--tn-goal-mode-color",
			getStatisticsColor("goal", progress.goal.path)
		);
		pill.createSpan({ cls: "tn-goal-strip__name", text: progress.goal.name });
		pill.createSpan({
			cls: "tn-goal-strip__value",
			text: compactProgressValue(progress, chinese, progressItems),
		});
		renderMicroBar(pill, progress, options.period);
		pill.addEventListener("click", () => setState(state === "open" ? "bar" : "open"));
	}
	const allCount = bar.createEl("button", {
		cls: "tn-goal-strip__utility",
		text: `全部 ${active.length}`,
		attr: { type: "button" },
	});
	allCount.addEventListener("click", () => setState(state === "open" ? "bar" : "open"));
	if (staleMilestones.length) {
		const pending = bar.createEl("button", {
			cls: "tn-goal-strip__utility is-flag",
			text: `⚑ ${staleMilestones.length}`,
			attr: { type: "button", "aria-label": `${staleMilestones.length} 条里程碑待更新` },
		});
		pending.addEventListener("click", () => setState("open"));
	}
	bar.createSpan({ cls: "tn-goal-strip__divider" });
	const toggle = bar.createEl("button", {
		cls: "tn-goal-strip__icon tn-goal-strip__toggle",
		attr: {
			type: "button",
			"aria-label": state === "open" ? "收起目标" : "展开目标",
			"aria-expanded": String(state === "open"),
		},
	});
	setIcon(toggle, state === "open" ? "chevron-up" : "chevron-down");
	buttonState(toggle, () => setState(state === "open" ? "bar" : "open"));
	const dismiss = bar.createEl("button", {
		cls: "tn-goal-strip__icon",
		attr: { type: "button", "aria-label": "关闭目标横幅" },
	});
	setIcon(dismiss, "x");
	buttonState(dismiss, () => setState("off"));
	if (state !== "open") return;
	const scrim = panel.createDiv({ cls: "tn-goal-strip__scrim" });
	scrim.addEventListener("click", () => setState("bar"));
	const overlay = panel.createDiv({
		cls: "tn-goal-strip__overlay",
		attr: {
			tabindex: "-1",
			role: "region",
			"aria-label": chinese ? "本周目标" : "Weekly goals",
		},
	});
	const heading = overlay.createDiv({ cls: "tn-goal-strip__overlay-heading" });
	heading.createEl("strong", { text: "本周目标" });
	heading.createSpan({ text: "浮在看板上 · 点空白或再次点击收起" });
	const close = heading.createEl("button", {
		cls: "tn-goal-strip__icon",
		attr: { type: "button", "aria-label": "收起目标" },
	});
	setIcon(close, "x");
	buttonState(close, () => setState("bar"));
	const list = overlay.createDiv({ cls: "tn-goal-strip__overlay-list" });
	const now = new Date();
	const historySegments = buildTimeStatisticsSegments(
		tasks,
		{ start: getGoalHistoryStart(goals, tasks, range.start), end: now },
		now
	);
	const history = attributeGoalSegments(goals, historySegments);
	for (const progress of [...active].sort((left, right) => gapScore(right) - gapScore(left))) {
		const row = list.createDiv({
			cls: `tn-goal-strip__overlay-row ${visualClasses(progress)}`,
		});
		const header = row.createDiv({ cls: "tn-goal-strip__overlay-header" });
		row.style.setProperty(
			"--tn-goal-mode-color",
			getStatisticsColor("goal", progress.goal.path)
		);
		header.createSpan({ cls: "tn-goal-ledger__dot" });
		const name = header.createEl("a", {
			cls: "tn-goal-strip__overlay-name",
			text: progress.goal.name,
			attr: { href: progress.goal.path },
		});
		name.addEventListener("click", (event) => {
			event.preventDefault();
			void options.onOpenGoal?.(progress.goal.path);
		});
		header.createSpan({
			cls: "tn-goal-strip__value",
			text: compactProgressValue(progress, chinese, progressItems).replace("/", " / "),
		});
		renderMicroBar(row, progress, options.period);
		const zeroPeriods =
			progress.state === "idle"
				? countZeroGoalPeriods(
						goals,
						progress.goal,
						historySegments,
						range,
						options.period ?? "week",
						plugin.settings.calendarViewSettings.firstDay ?? 0
					)
				: 0;
		const childrenTarget = active
			.filter((child) => child.goal.parent === progress.goal.name)
			.reduce((total, child) => total + (child.target ?? 0), 0);
		let note = stateCopy(plugin, progress);
		if (chinese) {
			if (progress.goal.mode === "ceiling" && progress.target !== null)
				note =
					progress.actual > progress.target
						? `超出 ${Number((progress.actual - progress.target).toFixed(1))}h 额度`
						: `还剩 ${Number((progress.target - progress.actual).toFixed(1))}h 额度 · ${remainingDays(range)} 天`;
			else if (progress.state === "complete")
				note = `已达成${progress.target !== null && progress.actual > progress.target ? ` · 超出 ${Number((progress.actual - progress.target).toFixed(1))}${progress.goal.mode === "count" ? " 次" : "h"}` : ""}`;
			else if (progress.state === "idle")
				note = `${zeroPeriods ? `已连续 ${zeroPeriods} ${options.period === "day" ? "天" : options.period === "month" ? "个月" : "周"}为零` : "尚未开始"}${progress.goal.scope.length ? ` · ${progress.goal.scope.join("、")}` : ""}`;
			else if (!progress.goal.mode && childrenTarget)
				note = `${progress.ratio < progress.pace ? "落后节奏" : "合计投入"} · 子目标合计 ${Number(childrenTarget.toFixed(1))}h`;
		}
		row.createSpan({ cls: "tn-goal-strip__overlay-note", text: note });
	}
	const footer = overlay.createDiv({ cls: "tn-goal-strip__overlay-footer" });
	if (milestones.length) {
		const milestoneList = footer.createDiv({
			cls: "tn-goal-strip__overlay-milestones",
			attr: { "aria-label": chinese ? "里程碑" : "Milestones" },
		});
		for (const item of pendingMilestones) {
			renderPendingMilestone(
				milestoneList,
				plugin,
				item.goal,
				item.index,
				options.onRefresh,
				options.readOnly === true,
				false,
				goalInvestedHours(item.goal, goals, history),
				true
			);
		}
		for (const item of milestones.filter((entry) => isMilestoneComplete(entry.milestone))) {
			const row = milestoneList.createDiv({
				cls: "tn-goal-pending tn-goal-pending--rail is-complete",
			});
			row.createSpan({ cls: "tn-goal-pending__flag", text: "✓" });
			const name = row.createEl("a", {
				cls: "tn-goal-pending__name",
				text: item.milestone.name,
				attr: { href: item.goal.path },
			});
			name.addEventListener("click", (event) => {
				event.preventDefault();
				void options.onOpenGoal?.(item.goal.path);
			});
			row.createSpan({
				cls: "tn-goal-pending__value",
				text: chinese ? "已达成" : "Achieved",
			});
		}
	}
	const actions = footer.createDiv({ cls: "tn-goal-strip__overlay-actions" });
	const add = actions.createEl("button", {
		text: goalCopy(plugin, "newGoal"),
		attr: { type: "button" },
	});
	add.addEventListener("click", () => new GoalCreationModal(plugin, options.onRefresh).open());
	const viewAll = actions.createEl("button", { text: "全部目标 ›", attr: { type: "button" } });
	viewAll.addEventListener("click", () => void plugin.activateGoalsView());
}

function buttonState(button: HTMLButtonElement, action: () => void): void {
	button.addEventListener("click", (event) => {
		event.stopPropagation();
		action();
	});
}

export async function renderGoalProgressPanel(
	parent: HTMLElement,
	plugin: TaskNotesPlugin,
	tasks: readonly TaskInfo[],
	options: GoalProgressPanelOptions
): Promise<void> {
	if (Platform.isMobile) return;
	const result = await plugin.goalService.getProgress(
		tasks,
		options.period ?? "week",
		options.referenceDate ?? new Date()
	);
	if (options.variant === "strip") {
		renderGoalStrip(
			parent,
			plugin,
			result.goals,
			result.progress,
			result.range,
			options,
			tasks
		);
		return;
	}
	// Statistics is an observation surface, not a goal/tag creation flow.
	if (result.goals.length === 0) return;
	const panel = parent.createDiv({ cls: `tn-goal-panel tn-goal-panel--${options.variant}` });
	const heading = panel.createDiv({ cls: "tn-goal-panel__heading" });
	heading.createEl("h3", { text: goalCopy(plugin, "progress") });
	const chinese = plugin.i18n.getCurrentLocale() === "zh";
	const actionable = result.progress.filter((item) => item.goal.mode && item.state !== "paused");
	heading.createSpan({
		cls: "tn-goal-ledger__summary",
		text:
			options.period === "year"
				? chinese
					? "全年累计 · 不设达标线"
					: "Year total · no target"
				: `${chinese ? { day: "当日", week: "本周", month: "本月", year: "全年" }[options.period ?? "week"] : (options.period ?? "week")}${options.readOnly ? "" : ` · ${chinese ? `还剩 ${remainingDays(result.range)} 天` : `${remainingDays(result.range)}d left`}`} · ${actionable.filter((item) => item.state === "complete").length}/${actionable.length}`,
	});
	const previous = await plugin.goalService.getProgress(
		tasks,
		options.period ?? "week",
		shiftTimeStatisticsReference(
			options.referenceDate ?? new Date(),
			options.period ?? "week",
			-1
		)
	);
	const previousByPath = new Map(previous.progress.map((item) => [item.goal.path, item]));
	const historySegments = buildTimeStatisticsSegments(
		tasks,
		{
			start: getGoalHistoryStart(result.goals, tasks, result.range.start),
			end: result.range.end,
		},
		new Date()
	);
	const zeroPeriodsFor = (progress: GoalProgress): number =>
		progress.state === "idle"
			? countZeroGoalPeriods(
					result.goals,
					progress.goal,
					historySegments,
					result.range,
					options.period ?? "week",
					plugin.settings.calendarViewSettings.firstDay ?? 0
				)
			: 0;
	const historyByGoal = attributeGoalSegments(result.goals, historySegments);
	const investedHoursFor = (goal: GoalDefinition): number =>
		goalInvestedHours(goal, result.goals, historyByGoal);
	const list = panel.createDiv({ cls: "tn-goal-ledger" });
	const paths = new Set(result.progress.map((item) => item.goal.name));
	for (const progress of result.progress.filter(
		(item) => !item.goal.parent || !paths.has(item.goal.parent)
	)) {
		const children = result.progress.filter((item) => item.goal.parent === progress.goal.name);
		// A milestone-only goal belongs in the update list, without an empty time bar.
		if (
			!progress.goal.mode &&
			!children.length &&
			!progress.goal.scope.length &&
			progress.goal.milestones.length
		)
			continue;
		const group = list.createDiv({ cls: "tn-goal-ledger__group" });
		renderLedgerRow(
			group,
			plugin,
			progress,
			options,
			previousByPath.get(progress.goal.path),
			children.length > 0,
			zeroPeriodsFor(progress)
		);
		if (children.length) {
			const nested = group.createDiv({ cls: "tn-goal-ledger__children" });
			for (const child of children)
				renderLedgerRow(
					nested,
					plugin,
					child,
					options,
					previousByPath.get(child.goal.path),
					false,
					zeroPeriodsFor(child)
				);
		}
	}
	if (options.period !== "day" && !options.readOnly) {
		const pending = result.goals
			.flatMap((goal) =>
				goal.milestones.map((milestone, index) => ({ goal, milestone, index }))
			)
			.filter(
				({ goal, milestone }) =>
					goal.status === "active" &&
					(milestone.kind === "boolean"
						? typeof milestone.achieved !== "string"
						: (milestone.tiers ?? []).some((tier) => tier > (milestone.current ?? 0)))
			);
		if (pending.length) {
			const milestones = panel.createDiv({ cls: "tn-goal-ledger__milestones" });
			milestones.createDiv({
				cls: "tn-goal-ledger__milestone-heading",
				text: chinese ? "待更新的里程碑" : "Milestones to update",
			});
			for (const item of pending)
				renderPendingMilestone(
					milestones,
					plugin,
					item.goal,
					item.index,
					options.onRefresh,
					false,
					true,
					investedHoursFor(item.goal)
				);
		}
	}
}
