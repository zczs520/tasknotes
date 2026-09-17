import { Notice, setIcon } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { GoalDefinition, GoalMilestone } from "../../goals/goalTypes";
import { milestoneProgress } from "../../goals/goalCalculations";
import { showConfirmationModal } from "../../modals/ConfirmationModal";

export function isMilestoneComplete(milestone: GoalMilestone): boolean {
	if (milestone.kind === "boolean")
		return typeof milestone.achieved === "string" && Boolean(milestone.achieved);
	const tiers = milestone.tiers ?? [];
	return tiers.length > 0 && tiers.every((tier) => Boolean(achievementDate(milestone, tier)));
}

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
			controls.forEach((control) => {
				control.disabled = false;
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
			text: `${formatMilestoneValue(current, unit)} → ${next === undefined ? "全部达成" : formatMilestoneValue(next, unit)}`,
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
		if (options.detail) {
			const labels = card.createDiv({ cls: "tn-goal-stock__tier-labels" });
			for (const tier of tiers) {
				labels.createSpan({
					text: `${formatMilestoneValue(tier, unit)}${achievementDate(milestone, tier) ? ` · ${achievementDate(milestone, tier)}` : ""}`,
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
				attr: { type: "button" },
			});
			undo.addEventListener(
				"click",
				() =>
					void run(() =>
						plugin.goalService.undoMilestoneAchievement(goal.path, index, achievedTier)
					)
			);
		}
	} else if (complete) {
		const date = achievementDate(milestone) ?? "";
		action.createSpan({
			cls: "tn-goal-stock__value",
			text: `${date} 达成 · 历时 ${elapsedWeeks(goal.created, new Date(`${date}T23:59:59`))} 周`,
		});
		card.createDiv({
			cls: "tn-goal-stock__note",
			text: `已达成的不隐藏——它是存量的证据${typeof milestone.hours_at === "number" ? ` · 累计投入 ${hours(milestone.hours_at)}` : ""}。撤销只在详情页`,
		});
		if (options.detail) {
			const undo = action.createEl("button", { text: "撤销达成", attr: { type: "button" } });
			undo.addEventListener(
				"click",
				() => void run(() => plugin.goalService.undoMilestoneAchievement(goal.path, index))
			);
		}
	} else {
		action.createSpan({ cls: "tn-goal-stock__value", text: `已投入 ${hours(invested)}` });
		const done = action.createEl("button", { text: "标记达成", attr: { type: "button" } });
		done.addEventListener(
			"click",
			() =>
				void run(async () => {
					const confirmed = await showConfirmationModal(plugin.app, {
						title: `确认达成「${milestone.name}」？`,
						message:
							"确认后记录达成日期，并回填从目标创建以来的累计投入；可在详情页撤销。",
						confirmText: "确认达成",
					});
					if (!confirmed) return false;
					await plugin.goalService.updateMilestone(goal.path, index, true);
				})
		);
		card.createDiv({
			cls: "tn-goal-stock__note",
			text: "完成型 · 做完就算完，标记时会二次确认并回填累计投入",
		});
	}
	if (options.detail) {
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
