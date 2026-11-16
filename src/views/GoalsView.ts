import { ItemView, type WorkspaceLeaf } from "obsidian";
import type TaskNotesPlugin from "../main";
import { GOALS_VIEW_TYPE } from "../types";
import { goalCopy } from "../goals/goalCopy";
import { GoalManagementPanel } from "../ui/goals/GoalManagementPanel";

/** Keeps restored workspace tabs and the non-Bases entry point working. */
export class GoalsView extends ItemView {
	private panel: GoalManagementPanel;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: TaskNotesPlugin
	) {
		super(leaf);
		this.panel = this.addChild(new GoalManagementPanel(plugin, this.contentEl));
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
		await this.plugin.onReady();
		if (state.selectedGoalPath) this.panel.openDetail(state.selectedGoalPath);
	}
}
