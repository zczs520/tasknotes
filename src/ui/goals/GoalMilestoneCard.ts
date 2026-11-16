import { Notice, setIcon } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { GoalDefinition, GoalMilestone } from "../../goals/goalTypes";
import { milestoneProgress } from "../../goals/goalCalculations";
import { showConfirmationModal } from "../../modals/ConfirmationModal";
import {
	completionStages,
	completionStageDate,
	isGoalMilestoneComplete as isMilestoneComplete,
} from "../../goals/milestoneStages";
import { renderGoalMilestoneEditor } from "./GoalMilestoneEditor";

export { isMilestoneComplete };

export function formatMilestoneValue(value: number, unit?: string): string {
	const normalizedUnit = unit?.trim() ?? "";
	return /^[¥￥$€£₩₹₽]$/u.test(normalizedUnit)
		? `${normalizedUnit}${value}`
		: `${value}${normalizedUnit}`;
}

function achievementDate(milestone: GoalMilestone, tier?: number): string | undefined {
	return typeof milestone.achieved === "string"
		? milestone.achieved
		: tier !== undefined
			? milestone.achieved?.[String(tier)]
			: undefined;
}

function hours(value: number): string {
	return `${Number(value.toFixed(1))}h`;
}

function elapsedWeeks(date: string, now: Date): number {
	const time = new Date(`${date}T00:00:00`).getTime();
	return Number.isFinite(time)
		? Math.max(0, Math.floor((now.getTime() - time) / 604_800_000))
		: 0;
}

export interface GoalMilestoneCardOptions {
	investedHours?: number;
	detail?: boolean;
	onChanged: () => void | Promise<void>;
	onOpenGoal?: (path: string) => void;
}

/** Stock milestones stay independent of the table's selected reporting period. */
export function renderGoalMilestoneCard(
	parent: HTMLElement,
	plugin: TaskNotesPlugin,
	goal: GoalDefinition,
	index: number,
	options: GoalMilestoneCardOptions
): HTMLElement {
	const milestone = goal.milestones[index];
	const complete = isMilestoneComplete(milestone);
	const card = parent.createDiv({
		cls: `tn-goal-stock${complete && !options.detail ? " is-complete" : ""}`,
	});
	const header = card.createDiv({ cls: "tn-goal-stock__heading" });
	const identity = header.createDiv({ cls: "tn-goal-stock__identity" });
	const flag = identity.createSpan({ cls: complete ? "is-complete" : "" });
	setIcon(flag, complete ? "check" : "flag");
	if (!options.detail) {
		const owner = identity.createEl("a", {
			cls: "tn-goal-stock__owner",
			text: `${goal.name} ›`,
			attr: { href: "#", "aria-label": `查看目标 ${goal.name}` },
		});
		owner.addEventListener("click", (event) => {
			event.preventDefault();
			options.onOpenGoal?.(goal.path);
		});
	}
	identity.createSpan({ cls: "tn-goal-stock__name", text: milestone.name });
	const action = header.createDiv({ cls: "tn-goal-stock__actions" });
	const status = card.createDiv({
		cls: "tn-goal-stock__feedback",
		attr: { role: "status", "aria-live": "polite" },
	});
	let busy = false;
	const run = async (operation: () => Promise<void | false>): Promise<void> => {
		if (busy) return;
		busy = true;
		const controls = [
			...card.querySelectorAll<HTMLInputElement | HTMLButtonElement>("button, input"),
		];
		const disabledStates = controls.map((control) => control.disabled);
		controls.forEach((control) => {
			control.disabled = true;
		});
		status.setText("正在写入…");
		try {
			if ((await operation()) === false) {
				status.setText("");
				return;
			}
			await options.onChanged();
			status.setText("已写入目标笔记");
		} catch (error) {
			status.setText("写入失败，请重试");
			new Notice(String(error), 8000);
		} finally {
			busy = false;
			controls.forEach((control, controlIndex) => {
				control.disabled = disabledStates[controlIndex];
			});
		}
	};
	const now = new Date();
	const staleWeeks = elapsedWeeks(milestone.updatedAt ?? goal.created, now);
	const stale = staleWeeks >= 2 ? `${staleWeeks} 周未更新` : "";
	const invested = options.investedHours ?? 0;
	if (milestone.kind === "number") {
		const current = milestone.current ?? 0;
		const tiers = milestone.tiers ?? [];
		const next = tiers.find((tier) => tier > current);
		const unit = milestone.unit ?? "";
		action.createSpan({
			cls: "tn-goal-stock__value",
			text: `${formatMilestoneValue(current, unit)} → ${complete ? "全部达成" : next === undefined ? "待确认达成" : formatMilestoneValue(next, unit)}`,
		});
		const entry = options.detail ? card.createDiv({ cls: "tn-goal-stock__entry" }) : action;
		const input = entry.createEl("input", {
			attr: {
				type: "number",
				min: "0",
				step: "any",
				placeholder: "更新数值",
				"aria-label": `更新${milestone.name}数值`,
			},
		});
		const update = (): void => {
			if (!input.value.trim() || busy) return;
			const value = Number(input.value);
			if (!Number.isFinite(value) || value < 0) {
				input.setAttribute("aria-invalid", "true");
				status.setText("请输入大于或等于零的数值");
				return;
			}
			input.removeAttribute("aria-invalid");
			void run(async () => {
				const result = await plugin.goalService.updateMilestone(goal.path, index, value);
				if (result.crossedTiers.length)
					new Notice(
						`「${milestone.name}」已达成 ${result.crossedTiers.join(" / ")} 档位`
					);
			});
		};
		input.addEventListener("change", update);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				update();
			}
		});
		if (options.detail) {
			const unitInput = entry.createEl("input", {
				attr: {
					type: "text",
					value: unit,
					placeholder: "单位（可选）",
					"aria-label": `设置${milestone.name}单位`,
					title: "例如：美元、人、个",
				},
			});
			unitInput.addEventListener("change", () => {
				if (unitInput.value.trim() !== unit)
					void run(() =>
						plugin.goalService.updateMilestoneUnit(goal.path, index, unitInput.value)
					);
			});
		}
		const bar = card.createDiv({
			cls: "tn-goal-stock__bar",
			attr: {
				role: "progressbar",
				"aria-label": milestone.name,
				"aria-valuemin": "0",
				"aria-valuemax": "100",
				"aria-valuenow": String(Math.round(milestoneProgress(milestone) * 100)),
			},
		});
		const fill = bar.createDiv({ cls: "tn-goal-stock__fill" });
		fill.style.width = `${milestoneProgress(milestone) * 100}%`;
		for (const [tierIndex, tier] of tiers.entries()) {
			const date = achievementDate(milestone, tier);
			const dot = bar.createSpan({
				cls: `tn-goal-stock__tier${date ? " is-achieved" : ""}`,
				attr: {
					title: `第 ${tierIndex + 1} 档 ${formatMilestoneValue(tier, unit)}${date ? ` · ${date} 达成` : " · 未达成"}`,
				},
			});
			dot.style.left = `${((tierIndex + 1) / tiers.length) * 100}%`;
			dot.createSpan({
				cls: "tn-goal-stock__tier-value",
				text: formatMilestoneValue(tier, unit),
			});
		}
		if (options.detail && tiers.some((tier) => achievementDate(milestone, tier))) {
			const labels = card.createDiv({ cls: "tn-goal-stock__tier-labels" });
			for (const tier of tiers) {
				const date = achievementDate(milestone, tier);
				labels.createSpan({
					text: date ? `${formatMilestoneValue(tier, unit)} · ${date}` : "",
				});
			}
		}
		const achievedTier = [...tiers].reverse().find((tier) => achievementDate(milestone, tier));
		const notes: string[] = [];
		if (achievedTier !== undefined) {
			const hoursAt =
				typeof milestone.hours_at === "object"
					? milestone.hours_at?.[String(achievedTier)]
					: undefined;
			notes.push(
				`第 ${tiers.indexOf(achievedTier) + 1} 档 ${formatMilestoneValue(achievedTier, unit)} 于 ${achievementDate(milestone, achievedTier)} 达成${hoursAt !== undefined ? `，为此投入 ${hours(hoursAt)}` : ""}`
			);
		} else
			notes.push(
				`${tiers.length > 1 ? "多档" : "一档"} ${tiers.map((tier) => formatMilestoneValue(tier, unit)).join(" / ")}`
			);
		if (next !== undefined)
			notes.push(`距下一档 ${formatMilestoneValue(Math.max(0, next - current), unit)}`);
		if (stale && !complete) notes.push(stale);
		if (invested === 0 && !complete && achievedTier === undefined)
			notes.push("还没有时间投入，先看目标那行");
		card.createDiv({ cls: "tn-goal-stock__note", text: notes.join(" · ") });
		if (options.detail) card.appendChild(entry);
		if (options.detail && achievedTier !== undefined) {
			const undo = entry.createEl("button", {
				text: `撤销第 ${tiers.indexOf(achievedTier) + 1} 档`,
				attr: {
					type: "button",
					title: "回退到上一已达成档位，同时撤销本档及后续档位的达成记录",
				},
			});
			undo.addEventListener(
				"click",
				() =>
					void run(() =>
						plugin.goalService.undoMilestoneAchievement(goal.path, index, achievedTier)
					)
			);
		}
	} else {
		const stages = completionStages(milestone);
		const next = stages.find((stage) => !completionStageDate(milestone, stage.id));
		const achieved = stages.filter((stage) => completionStageDate(milestone, stage.id));
		action.createSpan({
			cls: "tn-goal-stock__value",
			text: `${achieved.length}/${stages.length} 档${complete ? " · 全部达成" : ` · 已投入 ${hours(invested)}`}`,
		});
		if (next) {
			const done = action.createEl("button", {
				text: stages.length > 1 ? `标记「${next.name}」达成` : "标记达成",
				attr: { type: "button" },
			});
			done.addEventListener(
				"click",
				() =>
					void run(async () => {
						const confirmed = await showConfirmationModal(plugin.app, {
							title: `确认达成「${milestone.name} · ${next.name}」？`,
							message:
								"确认后记录本档完成日期与从目标创建以来的累计投入；可在详情页撤销。",
							confirmText: "确认达成",
						});
						if (!confirmed) return false;
						if (milestone.stages?.length)
							await plugin.goalService.updateMilestone(
								goal.path,
								index,
								true,
								next.id
							);
						else await plugin.goalService.updateMilestone(goal.path, index, true);
					})
			);
		}
		const bar = card.createDiv({
			cls: "tn-goal-stock__bar",
			attr: {
				role: "progressbar",
				"aria-label": milestone.name,
				"aria-valuemin": "0",
				"aria-valuemax": "100",
				"aria-valuenow": String(Math.round((achieved.length / stages.length) * 100)),
			},
		});
		bar.createDiv({ cls: "tn-goal-stock__fill" }).style.width =
			`${(achieved.length / stages.length) * 100}%`;
		for (const [stageIndex, stage] of stages.entries()) {
			const date = completionStageDate(milestone, stage.id);
			const dot = bar.createSpan({
				cls: `tn-goal-stock__tier${date ? " is-achieved" : ""}`,
				attr: { title: `${stage.name}${date ? ` · ${date} 达成` : " · 未达成"}` },
			});
			dot.style.left = `${((stageIndex + 1) / stages.length) * 100}%`;
			dot.createSpan({ cls: "tn-goal-stock__tier-value", text: stage.name });
		}
		if (achieved.length) {
			const history = card.createDiv({ cls: "tn-goal-stock__stage-history" });
			for (const stage of achieved) {
				const entry = history.createDiv({ cls: "tn-goal-stock__stage-record" });
				const investedAt =
					typeof milestone.hours_at === "number"
						? milestone.hours_at
						: milestone.hours_at?.[stage.id];
				entry.createSpan({
					text: `${stage.name} · ${completionStageDate(milestone, stage.id)}${investedAt !== undefined ? ` · 累计投入 ${hours(investedAt)}` : ""}`,
				});
				if (options.detail) {
					const undo = entry.createEl("button", {
						text: `撤销第 ${stages.indexOf(stage) + 1} 档`,
						attr: { type: "button" },
					});
					undo.addEventListener(
						"click",
						() =>
							void run(() =>
								milestone.stages?.length
									? plugin.goalService.undoMilestoneAchievement(
											goal.path,
											index,
											stage.id
										)
									: plugin.goalService.undoMilestoneAchievement(goal.path, index)
							)
					);
				}
			}
		}
		card.createDiv({
			cls: "tn-goal-stock__note",
			text: next
				? `完成型 · 下一档：${next.name} · 每档单独确认完成`
				: "完成型 · 所有档位已达成",
		});
	}
	if (options.detail) {
		const edit = action.createEl("button", {
			cls: "tn-goal-stock__edit",
			text: "编辑",
			attr: { type: "button", "aria-label": `编辑里程碑${milestone.name}` },
		});
		edit.addEventListener("click", () => {
			if (card.querySelector(".tn-goal-stock__editor")) return;
			const editor = renderGoalMilestoneEditor(
				card,
				milestone,
				(draft) =>
					void run(async () => {
						await plugin.goalService.updateMilestoneDefinition(goal.path, index, draft);
						editor.remove();
					}),
				() => {
					editor.remove();
					edit.focus();
				}
			);
		});
		const remove = action.createEl("button", {
			cls: "tn-goal-stock__remove",
			attr: { type: "button", "aria-label": `删除里程碑${milestone.name}` },
		});
		setIcon(remove, "trash-2");
		remove.addEventListener(
			"click",
			() =>
				void run(async () => {
					const confirmed = await showConfirmationModal(plugin.app, {
						title: `删除里程碑「${milestone.name}」？`,
						message: "仅删除此里程碑及其达成记录，不影响目标、标签和计时记录。",
						confirmText: "删除里程碑",
						isDestructive: true,
					});
					if (!confirmed) return false;
					await plugin.goalService.removeMilestone(goal.path, index);
				})
		);
	}
	card.appendChild(status);
	return card;
}
