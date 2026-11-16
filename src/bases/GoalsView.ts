import { BasesView, type BasesViewFactory, type QueryController } from "obsidian";
import type TaskNotesPlugin from "../main";
import { GoalManagementPanel } from "../ui/goals/GoalManagementPanel";

/** The Base is an entry point; GoalService remains the source of truth. */
export class GoalsBasesView extends BasesView {
	type = "tasknotesGoals";
	private panel: GoalManagementPanel;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		super(controller);
		this.panel = this.addChild(new GoalManagementPanel(plugin, containerEl));
		this.createFileForView = this.createFileForView.bind(this);
	}

	onDataUpdated(): void {
		this.panel.scheduleRender();
	}

	async createFileForView(): Promise<void> {
		this.panel.openCreation();
	}
}

export function buildGoalsViewFactory(plugin: TaskNotesPlugin): BasesViewFactory {
	return (controller, containerEl) => new GoalsBasesView(controller, containerEl, plugin);
}
