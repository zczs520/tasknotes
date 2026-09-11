import { KanbanView } from "../../../src/bases/KanbanView";

describe("empty Kanban swimlanes", () => {
	it("keeps a creation action below every status and passes the selected column to task creation", async () => {
		const view = Object.create(KanbanView.prototype) as any;
		view.boardEl = document.createElement("div");
		view.plugin = { i18n: { translate: () => "创建新任务" } };
		view.columnWidth = 280;
		view.maxSwimlaneHeight = 600;
		view.applyStatusTone = jest.fn();
		view.isUnknownStatusGroup = () => false;
		view.renderGroupTitleWrapper = jest.fn();
		view.renderColumnCount = jest.fn();
		view.setupColumnHeaderDragHandlers = jest.fn();
		view.getVisibleProperties = () => [];
		view.openTaskCreationForKanbanCell = jest.fn().mockResolvedValue(undefined);
		await view.renderSwimLaneTable(new Map(), ["open", "done"], new Map(), "note.status");
		const buttons = view.boardEl.querySelectorAll("button.kanban-view__empty-create-task");
		expect(buttons).toHaveLength(2);
		buttons[1].click();
		expect(view.openTaskCreationForKanbanCell).toHaveBeenCalledWith("note.status", "done");
	});
});
