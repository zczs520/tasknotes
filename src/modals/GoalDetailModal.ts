import { Modal, Notice } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { GoalDefinition, GoalProgress } from "../goals/goalTypes";
import {
	attributeGoalSegments,
	buildGoalProgress,
	calculateGoalPace,
	getGoalPeriodRange,
	getGoalHistoryStart,
	goalInvestedHours,
	parseGoalTarget,
} from "../goals/goalCalculations";
import { goalCopy } from "../goals/goalCopy";
import { renderGoalMilestoneCard } from "../ui/goals/GoalMilestoneCard";
import {
	parseMilestoneDraft,
	renderMilestoneDraft,
	type MilestoneDraftState,
} from "../ui/goals/GoalMilestoneDraft";
import { buildTimeStatisticsSegments } from "../utils/timeStatistics";
import { getStatisticsColor } from "../utils/statisticsColors";

function progressValue(progress: GoalProgress): string {
	if (progress.goal.mode === "count") return `${Math.round(progress.actual)} 次`;
	return progress.actual < 1
		? `${Math.round(progress.actual * 60)}m`
		: `${progress.actual.toFixed(1)}h`;
}

function targetValue(progress: GoalProgress): string {
	if (progress.target === null) return "";
	const operator = progress.goal.mode === "ceiling" ? "≤" : "≥";
	return `${operator}${progress.target}${progress.goal.mode === "count" ? " 次" : "h"}`;
}

export class GoalDetailModal extends Modal {
	private renderVersion = 0;
	private saveStatus: HTMLElement | null = null;

	constructor(
		private plugin: TaskNotesPlugin,
		private goalPath: string,
		private onChanged: () => void | Promise<void>
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass("tn-goal-detail-modal");
		void this.render();
	}

	onClose(): void {
		this.renderVersion += 1;
		this.contentEl.empty();
	}

	private async saveDetails(goal: GoalDefinition, name: string): Promise<void> {
		if (!name.trim()) {
			this.saveStatus?.setText("目标名称不能为空");
			return;
		}
		this.saveStatus?.setText("正在写入…");
		try {
			await this.plugin.goalService.updateGoalDetails(goal.path, { name });
			this.saveStatus?.setText("已写入目标笔记");
			await this.onChanged();
		} catch (error) {
			this.saveStatus?.setText("写入失败");
			new Notice(String(error), 8000);
		}
	}

	private renderProgress(
		parent: HTMLElement,
		progress: GoalProgress,
		children: readonly GoalProgress[] = []
	): void {
		const section = parent.createDiv({ cls: "tn-goal-detail__progress" });
		section.style.setProperty(
			"--tn-goal-mode-color",
			getStatisticsColor("goal", progress.goal.path)
		);
		const heading = section.createDiv({ cls: "tn-goal-detail__progress-heading" });
		heading.createEl("strong", {
			text:
				(progress.goal.period === "monthly"
					? "本月"
					: progress.goal.period === "quarterly"
						? "本季"
						: "本周") + (children.length ? "合计" : ""),
		});
		heading.createSpan({ text: progressValue(progress) });
		if (progress.target !== null) heading.createSpan({ text: `/ ${targetValue(progress)}` });
		else if (children.length) {
			const total = children.reduce((sum, child) => sum + (child.target ?? 0), 0);
			heading.createSpan({ text: `/ 子目标合计 ${total.toFixed(1)}h` });
		}
		const bar = section.createDiv({ cls: "tn-goal-card__bar" });
		const fill = bar.createDiv({ cls: "tn-goal-card__fill" });
		fill.style.width = `${Math.min(1, progress.ratio) * 100}%`;
		if (
			progress.state !== "complete" &&
			progress.goal.mode !== "count" &&
			progress.state !== "paused"
		) {
			const pace = bar.createSpan({ cls: "tn-goal-card__pace" });
			pace.style.left = `${progress.pace * 100}%`;
		}
		if (children.length) {
			const childList = section.createDiv({ cls: "tn-goal-detail__children-progress" });
			for (const child of children) {
				const row = childList.createDiv({ cls: "tn-goal-detail__child-progress" });
				row.style.setProperty(
					"--tn-goal-mode-color",
					getStatisticsColor("goal", child.goal.path)
				);
				const copy = row.createDiv({ cls: "tn-goal-detail__child-heading" });
				copy.createSpan({ text: child.goal.name });
				copy.createSpan({ text: child.goal.scope.join(" / ") });
				copy.createSpan({ text: `${progressValue(child)} / ${targetValue(child)}` });
				const childBar = row.createDiv({ cls: "tn-goal-card__bar" });
				const childFill = childBar.createDiv({ cls: "tn-goal-card__fill" });
				childFill.style.width = `${Math.min(1, child.ratio) * 100}%`;
				if (
					child.state !== "complete" &&
					child.goal.mode !== "count" &&
					child.state !== "paused"
				) {
					const pace = childBar.createSpan({ cls: "tn-goal-card__pace" });
					pace.style.left = `${child.pace * 100}%`;
				}
			}
		}
	}

	private renderAddMilestone(parent: HTMLElement, goal: GoalDefinition): void {
		const disclosure = parent.createEl("details", { cls: "tn-goal-detail__disclosure" });
		disclosure.createEl("summary", { text: "+ 添加里程碑" });
		const form = disclosure.createDiv({ cls: "tn-goal-detail__add-milestone" });
		const state: MilestoneDraftState = { name: "", kind: "number", tiers: [""] };
		const editor = form.createDiv();
		const feedback = form.createDiv({
			cls: "tn-goal-modal__feedback",
			attr: { role: "status" },
		});
		const add = form.createEl("button", {
			text: "添加里程碑",
			cls: "mod-cta",
			attr: { type: "button" },
		});
		add.disabled = true;
		renderMilestoneDraft(
			editor,
			state,
			() => {
				add.disabled = !parseMilestoneDraft(state);
				feedback.setText(add.disabled ? "填写指标名称；数值型需递增正数档位" : "");
			},
			() => {
				disclosure.open = false;
			}
		);
		add.addEventListener("click", () => {
			const draft = parseMilestoneDraft(state);
			if (!draft || add.disabled) return;
			add.disabled = true;
			void this.plugin.goalService
				.addMilestone(goal.path, draft)
				.then(async () => {
					await this.onChanged();
					await this.render();
				})
				.catch((error) => {
					add.disabled = false;
					feedback.setText("添加失败，请重试");
					new Notice(String(error), 8000);
				});
		});
	}

	private renderDeleteWarning(goal: GoalDefinition, remove: HTMLButtonElement): void {
		if (this.contentEl.querySelector(".tn-goal-detail__delete-warning")) return;
		const warning = this.contentEl.createDiv({
			cls: "tn-goal-detail__delete-warning",
			attr: { role: "alert" },
		});
		const header = this.contentEl.querySelector(".tn-goal-detail__header");
		header?.insertAdjacentElement("afterend", warning);
		const copy = warning.createDiv();
		copy.createEl("strong", { text: `删除「${goal.name}」？` });
		copy.createSpan({
			text: goal.children.length
				? `将删除目标及 ${goal.children.length} 个子目标文件，可选择保留子目标。计时记录与标签不受影响；删除文件进入回收站。`
				: "将删除目标文件及其里程碑记录，计时记录与标签不受影响。删除文件进入回收站。",
		});
		const actions = warning.createDiv({ cls: "tn-goal-detail__delete-actions" });
		const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
		const confirm = actions.createEl("button", {
			cls: "mod-warning",
			text: goal.children.length ? `删除 ${goal.children.length + 1} 个文件` : "确认删除",
			attr: { type: "button" },
		});
		let preserve = false;
		let pending = false;
		let checkbox: HTMLInputElement | undefined;
		if (goal.children.length) {
			const label = copy.createEl("label");
			checkbox = label.createEl("input", { attr: { type: "checkbox" } });
			checkbox.addEventListener("change", () => {
				preserve = checkbox?.checked ?? false;
				confirm.setText(
					preserve ? "仅删除父目标" : `删除 ${goal.children.length + 1} 个文件`
				);
			});
			label.appendText("保留子目标为独立目标");
		}
		cancel.addEventListener("click", () => {
			if (!pending) {
				warning.remove();
				remove.focus();
			}
		});
		confirm.addEventListener("click", () => {
			if (pending) return;
			pending = true;
			confirm.disabled = true;
			cancel.disabled = true;
			remove.disabled = true;
			if (checkbox) checkbox.disabled = true;
			confirm.setText("正在删除…");
			void this.plugin.goalService
				.deleteGoal(goal.path, preserve)
				.then(async () => {
					await this.onChanged();
					this.close();
				})
				.catch((error) => {
					pending = false;
					confirm.disabled = false;
					cancel.disabled = false;
					remove.disabled = false;
					if (checkbox) checkbox.disabled = false;
					confirm.setText("重试删除");
					new Notice(String(error), 8000);
				});
		});
		cancel.focus({ preventScroll: true });
	}

	private renderScopePicker(
		parent: HTMLElement,
		goal: GoalDefinition,
		goals: readonly GoalDefinition[]
	): void {
		const disclosure = parent.createEl("details", { cls: "tn-goal-detail__scope-picker" });
		disclosure.createEl("summary", { text: `选择标签 · ${goal.scope.length} 个` });
		const search = disclosure.createEl("input", {
			cls: "tn-goal-modal__tag-search",
			attr: {
				type: "search",
				placeholder: "搜索标签，或输入新标签后回车",
				"aria-label": "搜索目标标签",
			},
		});
		const list = disclosure.createDiv({ cls: "tn-goal-modal__tag-list" });
		let pending = false;
		const save = async (scope: string[]): Promise<void> => {
			if (pending) return;
			pending = true;
			try {
				await this.plugin.goalService.updateGoalScope(goal.path, scope);
				await this.onChanged();
				await this.render();
			} catch (error) {
				new Notice(String(error), 8000);
				draw();
			} finally {
				pending = false;
			}
		};
		const draw = (): void => {
			list.empty();
			const query = search.value.trim().replace(/^#+/u, "");
			const tags = [
				...new Set(
					[...goal.scope, ...this.plugin.cacheManager.getAllTags()].map((tag) =>
						tag.replace(/^#+/u, "")
					)
				),
			].sort((left, right) => left.localeCompare(right));
			for (const tag of tags.filter((value) =>
				value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
			)) {
				const owner = this.plugin.goalService.findScopeOwner(goals, tag);
				const blocked = Boolean(owner && owner.path !== goal.path);
				const label = list.createEl("label", {
					cls: `tn-goal-modal__tag${goal.scope.includes(tag) ? " is-selected" : ""}${blocked ? " is-disabled" : ""}`,
				});
				const checkbox = label.createEl("input", {
					attr: { type: "checkbox", "aria-label": tag },
				});
				checkbox.checked = goal.scope.includes(tag);
				checkbox.disabled = blocked;
				label.createSpan({ text: tag });
				if (blocked)
					label.createSpan({
						cls: "tn-goal-modal__tag-owner",
						text: `已属于 ${owner?.name ?? "其他目标"}`,
					});
				checkbox.addEventListener("change", () => {
					checkbox.disabled = true;
					void save(
						checkbox.checked
							? [...goal.scope, tag]
							: goal.scope.filter((value) => value !== tag)
					);
				});
			}
		};
		search.addEventListener("input", draw);
		search.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			const tag = search.value.trim().replace(/^#+/u, "");
			if (!tag || goal.scope.includes(tag) || pending) return;
			const owner = this.plugin.goalService.findScopeOwner(goals, tag);
			if (owner && owner.path !== goal.path) {
				new Notice(`标签已属于 ${owner.name}`);
				return;
			}
			void save([...goal.scope, tag]);
		});
		draw();
	}

	private async render(): Promise<void> {
		const version = ++this.renderVersion;
		const scroll =
			this.contentEl.querySelector<HTMLElement>(".tn-goal-detail__body")?.scrollTop ?? 0;
		const goal = await this.plugin.goalService.getGoal(this.goalPath);
		if (version !== this.renderVersion) return;
		if (!goal) {
			this.close();
			return;
		}
		const tasks = await this.plugin.cacheManager.getAllTasks();
		const liveGoals = await this.plugin.goalService.listGoals();
		const history = await this.plugin.goalService.getAdjustmentHistory(goal.path);
		if (version !== this.renderVersion) return;
		this.contentEl.empty();
		const now = new Date();
		const range = getGoalPeriodRange(
			goal,
			now,
			this.plugin.settings.calendarViewSettings.firstDay ?? 0
		);
		const result = {
			progress: buildGoalProgress(
				liveGoals,
				buildTimeStatisticsSegments(tasks, range, now),
				calculateGoalPace(range.start, range.end, now)
			),
		};
		const segments = buildTimeStatisticsSegments(
			tasks,
			{ start: getGoalHistoryStart(liveGoals, tasks, now), end: now },
			now
		);
		const invested = goalInvestedHours(
			goal,
			liveGoals,
			attributeGoalSegments(liveGoals, segments)
		);
		const progress = result.progress.find((item) => item.goal.path === goal.path);
		const header = this.contentEl.createDiv({ cls: "tn-goal-detail__header" });
		header.createSpan({ cls: "tn-goal-detail__eyebrow", text: "目标" });
		const title = header.createEl("input", {
			cls: "tn-goal-detail__title",
			attr: { type: "text", value: goal.name, required: "", "aria-label": "目标名称" },
		});
		header.createSpan({
			cls: "tn-goal-detail__role",
			text: goal.mode ? goalCopy(this.plugin, goal.mode) : "父目标 · 合计",
		});
		header.createSpan({
			cls: "tn-goal-detail__period-chip",
			text: goal.period === "monthly" ? "月" : goal.period === "quarterly" ? "季" : "周",
		});
		this.saveStatus = header.createSpan({
			cls: "tn-goal-detail__save-status",
			text: "改动即写入目标笔记",
			attr: { role: "status", "aria-live": "polite" },
		});
		const pause = header.createEl("button", {
			cls: "tn-goal-detail__pause",
			text: goal.status === "paused" ? "恢复跟踪" : "暂停跟踪",
			attr: { type: "button" },
		});
		pause.addEventListener("click", () => {
			pause.disabled = true;
			void this.plugin.goalService
				.setGoalStatus(goal.path, goal.status === "paused" ? "active" : "paused")
				.then(async () => {
					await this.onChanged();
					await this.render();
				})
				.catch((error) => {
					pause.disabled = false;
					new Notice(String(error), 8000);
				});
		});
		const remove = header.createEl("button", { cls: "tn-goal-detail__delete", text: "删除" });
		remove.addEventListener("click", () => {
			this.renderDeleteWarning(goal, remove);
		});
		const body = this.contentEl.createDiv({ cls: "tn-goal-detail__body" });
		const primary = body.createDiv({ cls: "tn-goal-detail__primary" });
		if (progress) {
			this.renderProgress(
				primary,
				progress,
				result.progress.filter((item) => item.goal.parent === goal.name)
			);
		}
		for (const [index] of goal.milestones.entries())
			renderGoalMilestoneCard(primary, this.plugin, goal, index, {
				detail: true,
				investedHours: invested,
				onChanged: async () => {
					await this.onChanged();
					await this.render();
				},
			});
		this.renderAddMilestone(primary, goal);
		const side = body.createDiv({ cls: "tn-goal-detail__side" });
		side.createSpan({ cls: "tn-goal-detail__section-label", text: "配置" });
		const config = side.createDiv({ cls: "tn-goal-detail__config" });
		config.createSpan({ text: "周期" });
		const periods = config.createDiv({ cls: "tn-goals-view__segments" });
		for (const value of ["weekly", "monthly", "quarterly"] as const) {
			const button = periods.createEl("button", {
				text: goalCopy(this.plugin, value),
				cls: (goal.period ?? "weekly") === value ? "is-selected" : "",
				attr: {
					type: "button",
					"aria-pressed": String((goal.period ?? "weekly") === value),
				},
			});
			button.disabled = Boolean(goal.parent);
			button.addEventListener("click", () => {
				button.disabled = true;
				void this.plugin.goalService
					.updateGoalSettings(goal.path, { period: value })
					.then(async () => {
						await this.onChanged();
						await this.render();
					})
					.catch((error) => {
						button.disabled = false;
						new Notice(String(error), 8000);
					});
			});
		}
		if (goal.parent)
			side.createSpan({
				cls: "tn-goal-detail__hint",
				text: "周期与父目标同步，请在父目标中修改",
			});
		if (goal.mode) {
			config.createSpan({ text: "目标值" });
			const targetRow = config.createDiv({ cls: "tn-goal-detail__target-row" });
			const target = targetRow.createEl("input", {
				attr: {
					type: "number",
					min: goal.mode === "count" ? "1" : "0.1",
					step: goal.mode === "count" ? "1" : "any",
					"aria-label": "目标值",
					value: String(parseGoalTarget(goal) ?? 0),
				},
			});
			targetRow.createSpan({ text: goal.mode === "count" ? "次" : "h" });
			target.addEventListener(
				"change",
				() =>
					void (async () => {
						await this.plugin.goalService.updateGoalSettings(goal.path, {
							target: Number(target.value),
						});
						await this.onChanged();
						await this.render();
					})().catch((error) => {
						new Notice(String(error), 8000);
					})
			);
			config.createSpan({ text: "标签" });
			const scopes = config.createDiv({ cls: "tn-goal-detail__scope" });
			this.renderScopePicker(scopes, goal, liveGoals);
		} else {
			config.createSpan({ text: "子目标" });
			const children = config.createDiv();
			for (const childProgress of result.progress.filter(
				(item) => item.goal.parent === goal.name
			)) {
				const row = children.createDiv({
					cls: "tn-goal-detail__milestone-action tn-goal-detail__child-target",
				});
				row.createSpan({ text: childProgress.goal.name });
				row.createSpan({
					text: `${goal.period === "monthly" ? "每月" : goal.period === "quarterly" ? "每季" : "每周"}${childProgress.goal.mode === "ceiling" ? "最多" : "至少"}`,
				});
				const target = row.createEl("input", {
					attr: {
						type: "number",
						min: childProgress.goal.mode === "count" ? "1" : "0.1",
						step: childProgress.goal.mode === "count" ? "1" : "any",
						"aria-label": `${childProgress.goal.name}目标值`,
						value: String(parseGoalTarget(childProgress.goal) ?? 0),
					},
				});
				row.createSpan({ text: childProgress.goal.mode === "count" ? "次" : "h" });
				target.addEventListener(
					"change",
					() =>
						void (async () => {
							await this.plugin.goalService.updateGoalSettings(
								childProgress.goal.path,
								{ target: Number(target.value) }
							);
							await this.onChanged();
							await this.render();
						})().catch((error) => {
							new Notice(String(error), 8000);
						})
				);
			}
			config.createSpan({ text: "标签" });
			config.createSpan({ text: "父目标不持有标签 · 去子目标改" });
		}
		title.addEventListener("change", () => void this.saveDetails(goal, title.value));
		side.createSpan({ cls: "tn-goal-detail__hint", text: "改动即写入目标 Markdown" });
		side.createSpan({ cls: "tn-goal-detail__section-label", text: "调整记录" });
		const historyEl = side.createDiv({ cls: "tn-goal-detail__history" });
		for (const entry of history.slice(0, 6)) historyEl.createSpan({ text: entry });
		body.scrollTop = scroll;
	}
}
