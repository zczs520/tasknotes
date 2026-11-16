import type { GoalDraftMilestone, GoalMilestone } from "../../goals/goalTypes";
import { completionStages } from "../../goals/milestoneStages";
import {
	parseMilestoneDraft,
	renderMilestoneDraft,
	type MilestoneDraftState,
} from "./GoalMilestoneDraft";

export function renderGoalMilestoneEditor(
	parent: HTMLElement,
	milestone: GoalMilestone,
	onSave: (draft: GoalDraftMilestone) => void,
	onCancel: () => void
): HTMLElement {
	const form = parent.createEl("form", { cls: "tn-goal-stock__editor" });
	const draft: MilestoneDraftState = {
		name: milestone.name,
		kind: milestone.kind,
		tiers: (milestone.tiers ?? []).map(String),
		unit: milestone.unit,
		stages:
			milestone.kind === "boolean"
				? completionStages(milestone).map((stage) => ({ ...stage }))
				: undefined,
	};
	let save: HTMLButtonElement;
	renderMilestoneDraft(
		form,
		draft,
		() => {
			if (save) save.disabled = !parseMilestoneDraft(draft);
		},
		onCancel,
		{ lockKind: true, removeLabel: "取消编辑" }
	);
	form.createDiv({
		cls: "tn-goal-stock__note",
		text: "保留档位的完成记录会保留；移除档位会同时移除该档完成记录。",
	});
	const actions = form.createDiv({ cls: "tn-goal-stock__entry" });
	save = actions.createEl("button", {
		text: "保存修改",
		cls: "mod-cta",
		attr: { type: "submit" },
	});
	save.disabled = !parseMilestoneDraft(draft);
	const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
	cancel.addEventListener("click", onCancel);
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const parsed = parseMilestoneDraft(draft);
		if (parsed) onSave(parsed);
	});
	return form;
}
