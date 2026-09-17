import { TFile, setIcon } from "obsidian";
import type { BasesView, BasesViewFactory } from "obsidian";
import { addDays, isSameDay, startOfDay } from "date-fns";
import TaskNotesPlugin from "../main";
import type { TaskInfo } from "../types";
import {
	buildDailyTimeStatistics,
	buildTagTimeStatistics,
	buildTaskTimeStatistics,
	buildTimeStatisticsSegments,
	calculateAverageTimePerActiveDay,
	calculateTimeStatisticsTotal,
	calculateUniqueTimeStatisticsTotal,
	formatTimeStatisticsDuration,
	getTimeStatisticsRange,
	isCurrentTimeStatisticsPeriod,
	shiftTimeStatisticsReference,
	type DailyTimeStatistic,
	type TagTimeStatistic,
	type TaskTimeStatistic,
	type TimeStatisticsPeriod,
	type TimeStatisticsRange,
	type TimeStatisticsSegment,
} from "../utils/timeStatistics";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { BasesViewBase } from "./BasesViewBase";
import { identifyTaskNotesFromBasesData, hasFixedTaskIdentity } from "./helpers";
import { renderGoalProgressPanel } from "../ui/goals/GoalProgressPanel";
import { findGoalForTags } from "../goals/goalCalculations";
import type { GoalDefinition } from "../goals/goalTypes";
import { applyStatisticsTagColor } from "../utils/statisticsColors";

const tasknotesLogger = createTaskNotesLogger({ tag: "Bases/TimeStatisticsView" });
const PERIODS: readonly TimeStatisticsPeriod[] = ["day", "week", "month", "year"];
export const DAY_TIMELINE_START_HOUR = 8;
export const DAY_TIMELINE_END_HOUR = 24;

interface PositionedSegment {
	segment: TimeStatisticsSegment;
	lane: number;
	laneCount: number;
}

interface ChartBucket {
	label: string;
	durationMs: number;
	segments: readonly TimeStatisticsSegment[];
}

interface RecordGroup {
	key: string;
	date: Date;
	durationMs: number;
	segments: TimeStatisticsSegment[];
}

function padNumber(value: number): string {
	return String(value).padStart(2, "0");
}

function formatClockTime(date: Date): string {
	return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function getMinuteOfDay(date: Date): number {
	return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function getDayTimelineEndMinute(segment: TimeStatisticsSegment): number {
	return getLocalDateKey(segment.end) === getLocalDateKey(segment.start)
		? getMinuteOfDay(segment.end)
		: DAY_TIMELINE_END_HOUR * 60;
}

function getPrimaryTag(tags: readonly string[]): string | null {
	return tags[0] ?? null;
}

function getLocalDateKey(date: Date): string {
	return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function positionOverlappingSegments(
	segments: readonly TimeStatisticsSegment[]
): PositionedSegment[] {
	const ordered = [...segments].sort(
		(left, right) => left.start.getTime() - right.start.getTime()
	);
	const laneCount = Math.max(1, ordered.length);
	return ordered.map((segment, lane) => ({ segment, lane, laneCount }));
}

export class TimeStatisticsView extends BasesViewBase {
	type = "tasknotesTimeStatistics";
	private period: TimeStatisticsPeriod = "day";
	private referenceDate = new Date();
	private renderVersion = 0;

	onload(): void {
		super.onload();
		const win = this.containerEl.ownerDocument.defaultView ?? window;
		this.registerInterval(
			win.setInterval(() => {
				if (
					isCurrentTimeStatisticsPeriod(
						this.referenceDate,
						this.period,
						new Date(),
						this.getWeekStartsOn()
					)
				) {
					this.debouncedRefresh();
				}
			}, 30_000)
		);
	}

	protected setupNewTaskButton(): void {
		// This dashboard is read-only.
	}

	private translate(key: string, params?: Record<string, string | number>): string {
		return this.plugin.i18n.translate(`views.timeStatistics.${key}`, params);
	}

	private getLocale(): string {
		const locale = this.plugin.i18n.getCurrentLocale();
		return locale === "zh" ? "zh-CN" : locale;
	}

	private getWeekStartsOn(): number {
		return this.plugin.settings.calendarViewSettings.firstDay ?? 0;
	}

	private formatDuration(durationMs: number): string {
		return formatTimeStatisticsDuration(
			durationMs,
			this.plugin.i18n.getCurrentLocale() === "zh"
		);
	}

	private formatCompactDuration(durationMs: number): string {
		const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
		if (totalMinutes < 60) return `${totalMinutes}m`;
		return `${(totalMinutes / 60).toFixed(1)}h`;
	}

	private getChartTitle(): string {
		if (this.plugin.i18n.getCurrentLocale() !== "zh") return this.translate("chart.title");
		return {
			day: "当日时间轴",
			week: "每日投入",
			month: "每日投入热力",
			year: "每月投入",
		}[this.period];
	}

	private getBarChartHint(): string {
		return this.plugin.i18n.getCurrentLocale() === "zh"
			? "柱内分段为标签占比"
			: this.translate("chart.barHint");
	}

	private formatRangeLabel(range: TimeStatisticsRange): string {
		const locale = this.getLocale();
		if (this.plugin.i18n.getCurrentLocale() === "zh") {
			const formatMonthDay = (date: Date): string =>
				`${date.getMonth() + 1}月${date.getDate()}日`;
			if (this.period === "day") {
				const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
					range.start
				);
				return `${range.start.getFullYear()}年${formatMonthDay(range.start)} ${weekday}`;
			}
			if (this.period === "week") {
				const inclusiveEnd = new Date(range.end.getTime() - 1);
				return `${range.start.getFullYear()}年${formatMonthDay(range.start)} – ${formatMonthDay(
					inclusiveEnd
				)}`;
			}
			return this.period === "month"
				? `${range.start.getFullYear()}年${range.start.getMonth() + 1}月`
				: `${range.start.getFullYear()}年`;
		}
		if (this.period === "day") {
			return new Intl.DateTimeFormat(locale, {
				year: "numeric",
				month: "long",
				day: "numeric",
				weekday: "short",
			}).format(range.start);
		}
		if (this.period === "week") {
			const inclusiveEnd = new Date(range.end.getTime() - 1);
			const startLabel = new Intl.DateTimeFormat(locale, {
				year: "numeric",
				month: "short",
				day: "numeric",
			}).format(range.start);
			const endLabel = new Intl.DateTimeFormat(locale, {
				month: "short",
				day: "numeric",
			}).format(inclusiveEnd);
			return `${startLabel} – ${endLabel}`;
		}
		return new Intl.DateTimeFormat(locale, {
			year: "numeric",
			...(this.period === "month" ? { month: "long" as const } : {}),
		}).format(range.start);
	}

	private openTask(path: string): void {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.plugin.app.workspace.getLeaf(false).openFile(file);
	}

	private renderHeader(parent: HTMLElement, range: TimeStatisticsRange): void {
		const header = parent.createDiv({ cls: "tn-time-statistics__header" });
		const heading = header.createDiv({ cls: "tn-time-statistics__heading" });
		heading.createEl("h2", {
			cls: "tn-time-statistics__title",
			text: this.translate("title"),
		});
		heading.createDiv({
			cls: "tn-time-statistics__subtitle",
			text: this.translate("subtitle"),
		});

		const controls = header.createDiv({ cls: "tn-time-statistics__controls" });
		const periodTabs = controls.createDiv({
			cls: "tn-time-statistics__period-tabs",
			attr: { role: "tablist" },
		});
		for (const period of PERIODS) {
			const active = this.period === period;
			const button = periodTabs.createEl("button", {
				cls: `tn-time-statistics__period-tab${active ? " is-active" : ""}`,
				text: this.translate(`periods.${period}`),
				attr: {
					type: "button",
					role: "tab",
					"aria-selected": String(active),
				},
			});
			button.addEventListener("click", () => {
				if (this.period === period) return;
				this.period = period;
				this.referenceDate = new Date();
				void this.render();
			});
		}

		const navigation = controls.createDiv({ cls: "tn-time-statistics__date-navigation" });
		const createNavigationButton = (
			icon: string,
			label: string,
			action: () => void,
			disabled = false
		): void => {
			const button = navigation.createEl("button", {
				cls: "tn-time-statistics__icon-button clickable-icon",
				attr: { type: "button", "aria-label": label },
			});
			setIcon(button, icon);
			button.disabled = disabled;
			button.addEventListener("click", action);
		};
		createNavigationButton("chevron-left", this.translate("navigation.previous"), () => {
			this.referenceDate = shiftTimeStatisticsReference(this.referenceDate, this.period, -1);
			void this.render();
		});
		navigation.createDiv({
			cls: "tn-time-statistics__date-label",
			text: this.formatRangeLabel(range),
		});
		const isCurrent = isCurrentTimeStatisticsPeriod(
			this.referenceDate,
			this.period,
			new Date(),
			this.getWeekStartsOn()
		);
		createNavigationButton(
			"chevron-right",
			this.translate("navigation.next"),
			() => {
				this.referenceDate = shiftTimeStatisticsReference(
					this.referenceDate,
					this.period,
					1
				);
				void this.render();
			},
			isCurrent
		);
	}

	private renderSummary(
		parent: HTMLElement,
		segments: readonly TimeStatisticsSegment[],
		taskStats: readonly TaskTimeStatistic[]
	): void {
		const taskTotalMs = calculateTimeStatisticsTotal(segments);
		const uniqueTotalMs = calculateUniqueTimeStatisticsTotal(segments);
		const records = new Set(segments.map((segment) => segment.sessionKey)).size;
		const isChinese = this.plugin.i18n.getCurrentLocale() === "zh";
		const averageMs =
			this.period === "day"
				? records > 0
					? taskTotalMs / records
					: 0
				: calculateAverageTimePerActiveDay(segments);
		const metrics = [
			{
				label: this.translate(`summary.task.${this.period}`),
				value: this.formatDuration(taskTotalMs),
			},
			{
				label: this.translate(`summary.total.${this.period}`),
				value: this.formatDuration(uniqueTotalMs),
				hint: this.translate("summary.totalHint"),
			},
			{
				label: this.translate("summary.tasksLabel"),
				value: isChinese
					? String(taskStats.length)
					: this.translate("summary.taskCount", { count: taskStats.length }),
				unit: isChinese ? "个" : undefined,
			},
			{
				label: this.translate("summary.recordsLabel"),
				value: isChinese
					? String(records)
					: this.translate("summary.recordCount", { count: records }),
				unit: isChinese ? "条" : undefined,
			},
			{
				label:
					isChinese && this.period === "day"
						? "平均单次"
						: isChinese
							? "活跃日均"
							: this.translate("summary.averageLabel"),
				value: averageMs > 0 ? this.formatDuration(averageMs) : "—",
			},
		];
		const summary = parent.createDiv({ cls: "tn-time-statistics__summary" });
		metrics.forEach((metric, index) => {
			const item = summary.createDiv({
				cls: `tn-time-statistics__metric${index === 0 ? " tn-time-statistics__metric--primary" : ""}`,
			});
			const label = item.createDiv({ cls: "tn-time-statistics__metric-label" });
			label.createSpan({
				text: metric.label,
				attr: metric.hint ? { title: metric.hint } : undefined,
			});
			if (index === 0 && segments.some((segment) => segment.isActive)) {
				const live = label.createSpan({ cls: "tn-time-statistics__live-indicator" });
				live.createSpan({ cls: "tn-time-statistics__live-dot" });
				live.createSpan({ text: this.translate("running") });
			}
			const value = item.createDiv({
				cls: "tn-time-statistics__metric-value",
				attr: { title: `${metric.value}${metric.unit ?? ""}` },
			});
			value.createSpan({ text: metric.value });
			if (metric.unit) {
				value.createSpan({ cls: "tn-time-statistics__metric-unit", text: metric.unit });
			}
		});
	}

	private createPanel(parent: HTMLElement, title: string, hint?: string): HTMLElement {
		const panel = parent.createDiv({ cls: "tn-time-statistics__panel" });
		const heading = panel.createDiv({ cls: "tn-time-statistics__panel-heading" });
		heading.createEl("h3", { cls: "tn-time-statistics__panel-title", text: title });
		if (hint) heading.createSpan({ cls: "tn-time-statistics__panel-hint", text: hint });
		return panel;
	}

	private createTaskButton(
		parent: HTMLElement,
		segment: TimeStatisticsSegment,
		className: string
	): HTMLButtonElement {
		const label = `${segment.taskTitle} · ${formatClockTime(segment.start)}–${formatClockTime(
			segment.end
		)} · ${this.formatDuration(segment.durationMs)}`;
		const button = parent.createEl("button", {
			cls: `${className}${segment.isActive ? " is-active" : ""}`,
			attr: { type: "button", title: label, "aria-label": label },
		});
		applyStatisticsTagColor(button, getPrimaryTag(segment.tags));
		button.addEventListener("click", () => this.openTask(segment.taskPath));
		return button;
	}

	private renderDayChart(parent: HTMLElement, segments: readonly TimeStatisticsSegment[]): void {
		const panel = this.createPanel(
			parent,
			this.getChartTitle(),
			this.plugin.i18n.getCurrentLocale() === "zh"
				? "08:00 – 24:00 · 按标签着色"
				: this.translate("chart.dayHint")
		);
		const startHour = DAY_TIMELINE_START_HOUR;
		const endHour = DAY_TIMELINE_END_HOUR;
		const spanMinutes = Math.max(60, (endHour - startHour) * 60);
		const positioned = positionOverlappingSegments(segments);
		const laneCount = Math.max(1, ...positioned.map((item) => item.laneCount));
		const chart = panel.createDiv({ cls: "tn-time-statistics__day-chart" });
		chart.style.height = `${Math.max(96, laneCount * 30 + 20)}px`;

		for (let hour = startHour + 1; hour < endHour; hour += 1) {
			const tick = chart.createDiv({ cls: "tn-time-statistics__day-tick" });
			tick.style.left = `${((hour - startHour) / (endHour - startHour)) * 100}%`;
			if (hour % 3 === 0) tick.addClass("is-major");
		}
		for (const { segment, lane } of positioned) {
			const start = Math.max(getMinuteOfDay(segment.start), startHour * 60);
			const end = Math.min(getDayTimelineEndMinute(segment), endHour * 60);
			if (end <= start) continue;
			const startPercentage = ((start - startHour * 60) / spanMinutes) * 100;
			const widthPercentage = Math.max(0.7, ((end - start) / spanMinutes) * 100);
			const block = this.createTaskButton(
				chart,
				segment,
				"tn-time-statistics__timeline-block"
			);
			block.style.left = `${startPercentage}%`;
			block.style.width = `${widthPercentage}%`;
			block.style.top = `${10 + lane * 30}px`;
			if (widthPercentage <= 26) {
				block.addClass("is-compact");
				if (startPercentage + widthPercentage > 62) block.addClass("is-flipped");
			}
			block.createSpan({
				cls: "tn-time-statistics__timeline-label",
				text: `${segment.taskTitle}  ${formatClockTime(segment.start)}–${formatClockTime(
					segment.end
				)}`,
			});
		}

		if (isSameDay(this.referenceDate, new Date())) {
			const nowMinute = getMinuteOfDay(new Date());
			if (nowMinute >= startHour * 60 && nowMinute <= endHour * 60) {
				const nowLine = chart.createDiv({ cls: "tn-time-statistics__day-now" });
				nowLine.style.left = `${((nowMinute - startHour * 60) / spanMinutes) * 100}%`;
			}
		}
		const axis = panel.createDiv({ cls: "tn-time-statistics__day-axis" });
		for (let hour = startHour; hour <= endHour; hour += 1) {
			axis.createSpan({ text: String(hour) });
		}
	}

	private renderBarChart(parent: HTMLElement, buckets: readonly ChartBucket[]): void {
		const panel = this.createPanel(parent, this.getChartTitle(), this.getBarChartHint());
		const maxDuration = Math.max(1, ...buckets.map((bucket) => bucket.durationMs));
		const chart = panel.createDiv({
			cls: `tn-time-statistics__bar-chart${buckets.length > 8 ? " is-dense" : ""}`,
		});
		for (const bucket of buckets) {
			const byTag = buildTagTimeStatistics(bucket.segments);
			const breakdownLabel = byTag
				.map(
					(tag) =>
						`${tag.tag ?? this.translate("untagged")} ${this.formatDuration(tag.durationMs)}`
				)
				.join(", ");
			const column = chart.createDiv({
				cls: "tn-time-statistics__bar-column",
				attr:
					bucket.durationMs > 0
						? {
								tabindex: "0",
								"aria-label": `${bucket.label}, ${this.formatDuration(
									bucket.durationMs
								)}${breakdownLabel ? `, ${breakdownLabel}` : ""}`,
							}
						: {},
			});
			column.createDiv({
				cls: "tn-time-statistics__bar-value",
				text: bucket.durationMs > 0 ? this.formatCompactDuration(bucket.durationMs) : "",
			});
			const track = column.createDiv({ cls: "tn-time-statistics__bar-track" });
			track.style.height = `${Math.max(
				bucket.durationMs > 0 ? 2 : 1.5,
				(bucket.durationMs / maxDuration) * 100
			)}%`;
			if (bucket.durationMs === 0) track.addClass("is-empty");
			for (const tag of byTag) {
				const segment = track.createDiv({
					cls: "tn-time-statistics__bar-segment",
					attr: {
						"aria-label": `${tag.tag ?? this.translate("untagged")} · ${this.formatDuration(
							tag.durationMs
						)}`,
					},
				});
				applyStatisticsTagColor(segment, tag.tag);
				segment.style.flexGrow = String(tag.durationMs);
			}
			column.createDiv({ cls: "tn-time-statistics__bar-label", text: bucket.label });
			if (byTag.length > 0) {
				const tooltip = column.createDiv({
					cls: "tn-time-statistics__bar-tooltip",
					attr: { role: "tooltip" },
				});
				const tooltipHeader = tooltip.createDiv({
					cls: "tn-time-statistics__bar-tooltip-header",
				});
				tooltipHeader.createSpan({ text: bucket.label });
				tooltipHeader.createSpan({ text: this.formatDuration(bucket.durationMs) });
				for (const tag of byTag) {
					const row = tooltip.createDiv({ cls: "tn-time-statistics__bar-tooltip-row" });
					applyStatisticsTagColor(row, tag.tag);
					row.createSpan({
						cls: "tn-time-statistics__color-dot",
					});
					row.createSpan({
						cls: "tn-time-statistics__bar-tooltip-tag",
						text: tag.tag ?? this.translate("untagged"),
					});
					row.createSpan({
						cls: "tn-time-statistics__bar-tooltip-duration",
						text: this.formatDuration(tag.durationMs),
					});
				}
			}
		}
	}

	private renderMonthHeatmap(
		parent: HTMLElement,
		dailyStats: readonly DailyTimeStatistic[]
	): void {
		const panel = this.createPanel(
			parent,
			this.getChartTitle(),
			this.plugin.i18n.getCurrentLocale() === "zh"
				? `${dailyStats.filter((day) => day.durationMs > 0).length} / ${dailyStats.length} 天有记录`
				: this.translate("chart.monthHint")
		);
		const calendar = panel.createDiv({ cls: "tn-time-statistics__heatmap" });
		const weekStartsOn = this.getWeekStartsOn();
		for (let index = 0; index < 7; index += 1) {
			const day = addDays(startOfDay(new Date(2026, 0, 4)), (weekStartsOn + index) % 7);
			calendar.createDiv({
				cls: "tn-time-statistics__heatmap-weekday",
				text: new Intl.DateTimeFormat(this.getLocale(), { weekday: "narrow" }).format(day),
			});
		}
		const firstOffset = (dailyStats[0].date.getDay() - weekStartsOn + 7) % 7;
		for (let index = 0; index < firstOffset; index += 1) {
			calendar.createDiv({ cls: "tn-time-statistics__heatmap-cell is-empty" });
		}
		const maxDuration = Math.max(1, ...dailyStats.map((day) => day.durationMs));
		for (const day of dailyStats) {
			const intensity =
				day.durationMs === 0
					? 0
					: Math.max(1, Math.ceil((day.durationMs / maxDuration) * 4));
			const cell = calendar.createDiv({
				cls: `tn-time-statistics__heatmap-cell is-level-${intensity}${
					isSameDay(day.date, new Date()) ? " is-today" : ""
				}`,
				attr: {
					title: `${new Intl.DateTimeFormat(this.getLocale(), {
						month: "short",
						day: "numeric",
					}).format(day.date)} · ${this.formatDuration(day.durationMs)}`,
				},
			});
			cell.createSpan({
				cls: "tn-time-statistics__heatmap-day",
				text: String(day.date.getDate()),
			});
			if (day.durationMs > 0) {
				cell.createSpan({
					cls: "tn-time-statistics__heatmap-value",
					text: this.formatDuration(day.durationMs),
				});
			}
		}
		const occupiedCells = firstOffset + dailyStats.length;
		const trailingCells = (7 - (occupiedCells % 7)) % 7;
		for (let index = 0; index < trailingCells; index += 1) {
			calendar.createDiv({ cls: "tn-time-statistics__heatmap-cell is-empty" });
		}
		const legend = panel.createDiv({ cls: "tn-time-statistics__heatmap-legend" });
		legend.createSpan({ text: this.plugin.i18n.getCurrentLocale() === "zh" ? "少" : "Less" });
		for (let level = 1; level <= 4; level += 1) {
			legend.createSpan({ cls: `tn-time-statistics__heatmap-swatch is-level-${level}` });
		}
		legend.createSpan({ text: this.plugin.i18n.getCurrentLocale() === "zh" ? "多" : "More" });
	}

	private renderMainChart(
		parent: HTMLElement,
		range: TimeStatisticsRange,
		segments: readonly TimeStatisticsSegment[],
		dailyStats: readonly DailyTimeStatistic[]
	): void {
		if (this.period === "day") {
			this.renderDayChart(parent, segments);
			return;
		}
		if (this.period === "month") {
			this.renderMonthHeatmap(parent, dailyStats);
			return;
		}
		if (this.period === "week") {
			const buckets = dailyStats.map((day) => ({
				label: new Intl.DateTimeFormat(this.getLocale(), { weekday: "short" }).format(
					day.date
				),
				durationMs: day.durationMs,
				segments: day.segments,
			}));
			this.renderBarChart(parent, buckets);
			return;
		}
		const buckets: ChartBucket[] = [];
		for (let month = 0; month < 12; month += 1) {
			const monthSegments = segments.filter((segment) => segment.start.getMonth() === month);
			buckets.push({
				label: new Intl.DateTimeFormat(this.getLocale(), { month: "short" }).format(
					new Date(range.start.getFullYear(), month, 1)
				),
				durationMs: calculateTimeStatisticsTotal(monthSegments),
				segments: monthSegments,
			});
		}
		this.renderBarChart(parent, buckets);
	}

	private renderTaskRanking(
		parent: HTMLElement,
		tasks: readonly TaskTimeStatistic[],
		goals: readonly GoalDefinition[]
	): void {
		const chinese = this.plugin.i18n.getCurrentLocale() === "zh";
		const hasGoals = goals.length > 0;
		const section = this.createPanel(
			parent,
			this.translate("ranking.title"),
			chinese ? `共 ${tasks.length} 个任务` : `${tasks.length} tasks`
		);
		section.addClass("tn-time-statistics__ranking");
		if (!hasGoals) section.addClass("tn-time-statistics__ranking--classic");
		const heading = section.querySelector<HTMLElement>(".tn-time-statistics__panel-heading");
		const description = section.ownerDocument.createElement("span");
		description.className = "tn-time-statistics__rank-description";
		description.textContent = chinese
			? `${{ day: "当日", week: "本周", month: "本月", year: "全年" }[this.period]}单任务用时 Top 6 · 右侧标明算给了哪个目标`
			: "Task time Top 6 · goal attribution on the right";
		if (hasGoals)
			heading?.querySelector(".tn-time-statistics__panel-title")?.after(description);
		const maxDuration = Math.max(1, tasks[0]?.durationMs ?? 1);
		const list = section.createDiv({ cls: "tn-time-statistics__ranking-list" });
		for (const [index, task] of (hasGoals ? tasks.slice(0, 6) : tasks).entries()) {
			const owner = findGoalForTags(goals, task.tags);
			const row = list.createEl("button", {
				cls: `tn-time-statistics__rank-row is-goal-${owner?.mode ?? "unassigned"}`,
				attr: {
					type: "button",
					"aria-label": `${task.taskTitle} · ${this.formatDuration(task.durationMs)}`,
				},
			});
			applyStatisticsTagColor(row, getPrimaryTag(task.tags));
			row.addEventListener("click", () => this.openTask(task.taskPath));
			row.createSpan({
				cls: hasGoals ? "tn-time-statistics__rank-number" : "tn-time-statistics__color-dot",
				text: hasGoals ? String(index + 1) : "",
			});
			row.createSpan({
				cls: "tn-time-statistics__rank-name",
				text: task.taskTitle,
				attr: { title: task.taskTitle },
			});
			const bar = row.createSpan({ cls: "tn-time-statistics__rank-bar" });
			const fill = bar.createSpan({
				cls: "tn-time-statistics__rank-bar-fill",
			});
			fill.style.width = `${(task.durationMs / maxDuration) * 100}%`;
			row.createSpan({
				cls: "tn-time-statistics__rank-duration",
				text: hasGoals
					? this.formatCompactDuration(task.durationMs)
					: this.formatDuration(task.durationMs),
			});
			if (hasGoals)
				row.createSpan({
					cls: `tn-time-statistics__goal-owner${owner ? "" : " is-unassigned"}`,
					text: this.goalOwnerLabel(owner, goals, false),
					attr: { title: this.goalOwnerLabel(owner, goals, false) },
				});
		}
	}

	private goalOwnerLabel(
		owner: GoalDefinition | null,
		goals: readonly GoalDefinition[],
		withPrefix = true
	): string {
		const chinese = this.plugin.i18n.getCurrentLocale() === "zh";
		if (!owner) return chinese ? "未分配" : "Unassigned";
		const parent = goals.find((goal) => goal.name === owner.parent);
		return `${withPrefix ? (chinese ? "算给 " : "To ") : ""}${parent ? `${parent.name} › ` : ""}${owner.name}`;
	}

	private renderTagDistribution(
		parent: HTMLElement,
		tags: readonly TagTimeStatistic[],
		goals: readonly GoalDefinition[]
	): void {
		const chinese = this.plugin.i18n.getCurrentLocale() === "zh";
		const hasGoals = goals.length > 0;
		const section = parent.createDiv({
			cls: `tn-time-statistics__side-section tn-time-statistics__tags${hasGoals ? "" : " tn-time-statistics__tags--classic"}`,
		});
		const heading = section.createDiv({ cls: "tn-time-statistics__side-heading" });
		heading.createEl("h3", {
			cls: "tn-time-statistics__panel-title",
			text: this.translate("distribution.title"),
		});
		heading.createSpan({
			cls: "tn-time-statistics__panel-hint",
			text: `${this.translate("summary.tagCount", { count: tags.filter((tag) => tag.tag !== null).length })}${hasGoals ? ` · ${chinese ? "每行标明算给了哪个目标" : "Goal attribution per tag"}` : ""}`,
		});
		const attributedTotal = tags.reduce((total, tag) => total + tag.durationMs, 0);
		const maxDuration = Math.max(1, ...tags.map((tag) => tag.durationMs));
		if (!tags.length) {
			section.createDiv({
				cls: "tn-time-statistics__tag-empty",
				text: chinese ? "本期暂无标签计时记录" : "No tracked tags in this period",
			});
			return;
		}
		const list = section.createDiv({ cls: "tn-time-statistics__tag-list" });
		if (!hasGoals) {
			const strip = section.createDiv({ cls: "tn-time-statistics__distribution-strip" });
			list.before(strip);
			for (const tag of tags.filter((item) => item.durationMs > 0)) {
				const segment = strip.createSpan();
				applyStatisticsTagColor(segment, tag.tag);
				segment.style.width = `${(tag.durationMs / attributedTotal) * 100}%`;
			}
		}
		for (const tag of tags) {
			const owner = tag.tag ? findGoalForTags(goals, [tag.tag]) : null;
			const percentage =
				attributedTotal > 0 ? Math.round((tag.durationMs / attributedTotal) * 100) : 0;
			const row = list.createDiv({
				cls: `tn-time-statistics__tag-row is-goal-${owner?.mode ?? "unassigned"}`,
			});
			applyStatisticsTagColor(row, tag.tag);
			if (!hasGoals) {
				row.createSpan({ cls: "tn-time-statistics__color-dot" });
				row.createSpan({
					cls: "tn-time-statistics__tag-name",
					text: tag.tag ?? this.translate("untagged"),
					attr: { title: tag.tag ?? this.translate("untagged") },
				});
				row.createSpan({
					cls: "tn-time-statistics__tag-duration",
					text: this.formatDuration(tag.durationMs),
				});
				row.createSpan({ cls: "tn-time-statistics__tag-percent", text: `${percentage}%` });
				continue;
			}
			const top = row.createDiv({ cls: "tn-time-statistics__tag-top" });
			top.createSpan({
				cls: "tn-time-statistics__tag-chip",
				text: tag.tag ?? this.translate("untagged"),
				attr: { title: tag.tag ?? this.translate("untagged") },
			});
			const bar = top.createSpan({ cls: "tn-time-statistics__tag-bar" });
			const fill = bar.createSpan({ cls: "tn-time-statistics__tag-fill" });
			fill.style.width = `${(tag.durationMs / maxDuration) * 100}%`;
			top.createSpan({
				cls: "tn-time-statistics__tag-duration",
				text: `${(tag.durationMs / 3_600_000).toFixed(tag.durationMs > 0 ? 1 : 0)}h · ${percentage}%`,
			});
			row.createSpan({
				cls: `tn-time-statistics__goal-owner${owner ? "" : " is-unassigned"}`,
				text: this.goalOwnerLabel(owner, goals),
			});
		}
	}

	private async renderInsights(
		parent: HTMLElement,
		tasks: readonly TaskInfo[],
		tags: readonly TagTimeStatistic[],
		goals: readonly GoalDefinition[]
	): Promise<void> {
		const panel = parent.createDiv({
			cls: "tn-time-statistics__panel tn-time-statistics__insights",
		});
		if (!goals.length) {
			parent.addClass("tn-time-statistics__breakdown--classic");
			panel.addClass("tn-time-statistics__insights--classic");
			this.renderTagDistribution(panel, tags, goals);
			return;
		}
		const goalHost = panel.createDiv({ cls: "tn-time-statistics__goal-section" });
		this.renderTagDistribution(panel, tags, goals);
		try {
			await renderGoalProgressPanel(goalHost, this.plugin, tasks, {
				variant: "statistics",
				period: this.period,
				referenceDate: this.referenceDate,
				readOnly: !isCurrentTimeStatisticsPeriod(
					this.referenceDate,
					this.period,
					new Date(),
					this.getWeekStartsOn()
				),
				onRefresh: () => this.render(),
				onOpenGoal: async (path) => {
					await this.plugin.activateGoalsView(path);
				},
				recommendedTags: tags
					.map((tag) => tag.tag)
					.filter((tag): tag is string => Boolean(tag)),
			});
			// Historical/mobile snapshots can have attribution goals but no visible panel.
			if (!goalHost.querySelector(".tn-goal-ledger__row, .tn-goal-ledger__milestones")) {
				goalHost.remove();
				panel.addClass("tn-time-statistics__insights--single");
			}
		} catch (error) {
			panel.addClass("tn-time-statistics__insights--single");
			goalHost.empty();
			goalHost.createDiv({
				cls: "tn-time-statistics__tag-empty",
				text:
					this.plugin.i18n.getCurrentLocale() === "zh"
						? "目标暂时无法读取，标签统计仍可查看。"
						: "Goals unavailable. Tag statistics remain visible.",
			});
			tasknotesLogger.error("Failed to render goal statistics", {
				category: "internal",
				operation: "render-goals",
				error,
			});
		}
	}

	private formatRecordDate(date: Date): string {
		if (this.plugin.i18n.getCurrentLocale() === "zh") {
			const weekday = new Intl.DateTimeFormat(this.getLocale(), { weekday: "short" }).format(
				date
			);
			return `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}`;
		}
		return new Intl.DateTimeFormat(this.getLocale(), {
			month: "short",
			day: "numeric",
			weekday: "short",
		}).format(date);
	}

	private groupRecordSegments(segments: readonly TimeStatisticsSegment[]): RecordGroup[] {
		const groups = new Map<string, RecordGroup>();
		for (const segment of [...segments].sort(
			(left, right) => right.start.getTime() - left.start.getTime()
		)) {
			const key = getLocalDateKey(segment.start);
			let group = groups.get(key);
			if (!group) {
				group = { key, date: startOfDay(segment.start), durationMs: 0, segments: [] };
				groups.set(key, group);
			}
			group.durationMs += segment.durationMs;
			group.segments.push(segment);
		}
		const limit = this.period === "day" ? 1 : this.period === "week" ? 7 : 10;
		return [...groups.values()].slice(0, limit);
	}

	private renderRecords(
		parent: HTMLElement,
		segments: readonly TimeStatisticsSegment[],
		tasks: readonly TaskInfo[]
	): void {
		const groups = this.groupRecordSegments(segments);
		const taskByPath = new Map(tasks.map((task) => [task.path, task]));
		const sessionCount = new Set(segments.map((segment) => segment.sessionKey)).size;
		const hint =
			this.plugin.i18n.getCurrentLocale() === "zh"
				? this.period === "day"
					? `${sessionCount} 条`
					: `最近 ${groups.length} 天 · 共 ${sessionCount} 条`
				: this.translate("records.hint", { count: sessionCount });
		const records = this.createPanel(parent, this.translate("records.title"), hint);
		const list = records.createDiv({ cls: "tn-time-statistics__record-list" });
		for (const group of groups) {
			const groupHeader = list.createDiv({ cls: "tn-time-statistics__record-group" });
			groupHeader.createSpan({
				cls: "tn-time-statistics__record-group-date",
				text: this.formatRecordDate(group.date),
			});
			groupHeader.createSpan({
				cls: "tn-time-statistics__record-group-duration",
				text: this.formatDuration(group.durationMs),
			});
			for (const segment of group.segments) {
				const row = list.createDiv({
					cls: `tn-time-statistics__record-row${segment.isActive ? " is-active" : ""}`,
				});
				applyStatisticsTagColor(row, getPrimaryTag(segment.tags));
				row.createSpan({
					cls: "tn-time-statistics__color-dot",
				});
				row.createSpan({
					cls: "tn-time-statistics__record-time",
					text: `${formatClockTime(segment.start)} – ${formatClockTime(segment.end)}`,
				});
				const taskLink = row.createEl("button", {
					cls: "tn-time-statistics__record-task",
					text: segment.taskTitle,
					attr: { type: "button", title: segment.taskTitle },
				});
				taskLink.addEventListener("click", () => this.openTask(segment.taskPath));
				row.createSpan({
					cls: "tn-time-statistics__record-tag",
					text: segment.tags[0] ?? this.translate("untagged"),
				});
				const edit = row.createEl("button", {
					cls: "tn-time-statistics__record-edit",
					text: this.plugin.i18n.getCurrentLocale() === "zh" ? "编辑" : "Edit",
					attr: { type: "button" },
				});
				const task = taskByPath.get(segment.taskPath);
				edit.disabled = !task;
				edit.addEventListener("click", () => {
					if (!task) return;
					this.plugin.openTimeEntryEditor(task, () => void this.render());
				});
				row.createSpan({
					cls: "tn-time-statistics__record-duration",
					text: segment.isActive
						? this.translate("running")
						: this.formatDuration(segment.durationMs),
				});
			}
		}
	}

	private renderEmptyState(parent: HTMLElement): void {
		const empty = parent.createDiv({ cls: "tn-time-statistics__empty" });
		const icon = empty.createDiv({ cls: "tn-time-statistics__empty-icon" });
		setIcon(icon, "clock-3");
		empty.createEl("h3", { text: this.translate("empty.title") });
		empty.createEl("p", { text: this.translate("empty.description") });
	}

	protected async handleTaskUpdate(_task: TaskInfo): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		if (!this.rootElement || !this.data?.data) return;
		const version = ++this.renderVersion;
		try {
			const tasks = await identifyTaskNotesFromBasesData(
				this.dataAdapter.extractDataItems().filter(hasFixedTaskIdentity),
				this.plugin
			);
			if (version !== this.renderVersion) return;
			const range = getTimeStatisticsRange(
				this.referenceDate,
				this.period,
				this.getWeekStartsOn()
			);
			const segments = buildTimeStatisticsSegments(tasks, range, new Date());
			const taskStats = buildTaskTimeStatistics(segments);
			const tagStats = buildTagTimeStatistics(segments, tasks);
			const dailyStats = buildDailyTimeStatistics(segments, range);
			const goals = await this.plugin.goalService
				.listGoals()
				.catch((error): GoalDefinition[] => {
					tasknotesLogger.error("Failed to read goal attribution", {
						category: "internal",
						operation: "list-goals",
						error,
					});
					return [];
				});
			if (version !== this.renderVersion) return;

			// Build off-screen so a slower period request cannot erase newer statistics.
			const shell = this.rootElement.ownerDocument.createElement("div");
			shell.className = "tn-time-statistics__shell";
			this.renderHeader(shell, range);
			this.renderSummary(shell, segments, taskStats);
			if (segments.length === 0) {
				this.renderEmptyState(shell);
				const details = shell.createDiv({ cls: "tn-time-statistics__details" });
				const breakdown = details.createDiv({ cls: "tn-time-statistics__breakdown" });
				await this.renderInsights(breakdown, tasks, tagStats, goals);
				this.renderTaskRanking(breakdown, taskStats, goals);
				if (version !== this.renderVersion) return;
				this.rootElement.addClass("tn-time-statistics");
				this.rootElement.replaceChildren(shell);
				return;
			}
			const overview = shell.createDiv({ cls: "tn-time-statistics__overview" });
			this.renderMainChart(overview, range, segments, dailyStats);
			const details = shell.createDiv({ cls: "tn-time-statistics__details" });
			const breakdown = details.createDiv({ cls: "tn-time-statistics__breakdown" });
			await this.renderInsights(breakdown, tasks, tagStats, goals);
			this.renderTaskRanking(breakdown, taskStats, goals);
			this.renderRecords(details, segments, tasks);
			if (version !== this.renderVersion) return;
			this.rootElement.addClass("tn-time-statistics");
			this.rootElement.replaceChildren(shell);
		} catch (error) {
			if (version !== this.renderVersion) return;
			tasknotesLogger.error("Failed to render time statistics", {
				category: "internal",
				operation: "render",
				error,
			});
			this.renderError(error as Error);
		}
	}

	renderError(error: Error): void {
		if (!this.rootElement) return;
		this.rootElement.empty();
		const element = this.rootElement.createDiv({ cls: "tn-time-statistics__error" });
		element.createEl("h3", { text: this.translate("error.title") });
		element.createEl("p", { text: error.message });
	}
}

export function buildTimeStatisticsViewFactory(plugin: TaskNotesPlugin): BasesViewFactory {
	return function (controller: unknown, containerEl: HTMLElement): BasesView {
		if (!containerEl) throw new Error("TimeStatisticsView requires a containerEl");
		return new TimeStatisticsView(controller, containerEl, plugin) as unknown as BasesView;
	};
}
