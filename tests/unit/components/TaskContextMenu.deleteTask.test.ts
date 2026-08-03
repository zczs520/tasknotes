import { App, Menu } from "obsidian";
import { TaskContextMenu } from "../../../src/components/TaskContextMenu";
import { showConfirmationModal } from "../../../src/modals/ConfirmationModal";

jest.mock("../../../src/modals/ConfirmationModal", () => ({
	showConfirmationModal: jest.fn(),
}));
import { createI18nService } from "../../../src/i18n";
import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";

type MockMenuItem = {
	setTitle?: jest.Mock;
	setIcon?: jest.Mock;
	setWarning?: jest.Mock;
	onClick?: jest.Mock;
};

type MockMenu = {
	items: MockMenuItem[];
};

const menuMock = Menu as unknown as jest.Mock;

function createTask(): TaskInfo {
	return {
		id: "Tasks/delete-from-menu.md",
		path: "Tasks/delete-from-menu.md",
		title: "Delete from menu",
		status: "open",
		priority: "normal",
		archived: false,
		tags: [],
		contexts: [],
		projects: [],
	} as TaskInfo;
}

function createPlugin(): TaskNotesPlugin {
	return {
		app: new App(),
		i18n: createI18nService(),
		settings: {
			customStatuses: [],
			customPriorities: [],
			calendarViewSettings: { enableTimeblocking: false },
			useFrontmatterMarkdownLinks: true,
		},
		statusManager: {
			getAllStatuses: jest.fn(() => []),
			getNonCompletionStatuses: jest.fn(() => []),
			isCompletedStatus: jest.fn(() => false),
		},
		priorityManager: {
			getAllPriorities: jest.fn(() => []),
			getPrioritiesByWeight: jest.fn(() => []),
		},
		taskService: {
			toggleRecurringTaskSkipped: jest.fn(),
			updateBlockingRelationships: jest.fn(),
			deleteTask: jest.fn(),
		},
		cacheManager: {
			getAllContexts: jest.fn(() => []),
			getAllTasks: jest.fn(() => []),
			getTaskInfo: jest.fn(),
		},
		updateTaskProperty: jest.fn(),
		toggleRecurringTaskComplete: jest.fn(),
		getActiveTimeSession: jest.fn(() => null),
		stopTimeTracking: jest.fn(),
		startTimeTracking: jest.fn(),
		openDueDateModal: jest.fn(),
		openScheduledDateModal: jest.fn(),
		openTimeEntryEditor: jest.fn(),
		toggleTaskArchive: jest.fn(),
		openTaskEditModal: jest.fn(),
		openTaskCreationModal: jest.fn(),
	} as unknown as TaskNotesPlugin;
}

describe("TaskContextMenu delete action", () => {
	beforeEach(() => {
		menuMock.mockClear();
		jest.mocked(showConfirmationModal).mockReset();
		jest.mocked(showConfirmationModal).mockResolvedValue(true);
	});

	it("adds a direct destructive delete task action to the main menu", () => {
		new TaskContextMenu({
			task: createTask(),
			plugin: createPlugin(),
			targetDate: new Date("2026-07-30T12:00:00"),
		});

		const menu = menuMock.mock.results[0].value as MockMenu;
		const deleteItem = menu.items.find((item) =>
			item.setTitle?.mock.calls.some(([title]) => title === "Delete task")
		);

		expect(deleteItem).toBeDefined();
		expect(deleteItem?.setIcon).toHaveBeenCalledWith("trash");
		expect(deleteItem?.setWarning).toHaveBeenCalledWith(true);
	});
	it("confirms and deletes from the direct menu action", async () => {
		const plugin = createPlugin();
		const task = createTask();
		new TaskContextMenu({
			task,
			plugin,
			targetDate: new Date("2026-07-30T12:00:00"),
		});

		const menu = menuMock.mock.results[0].value as MockMenu;
		const deleteItem = menu.items.find((item) =>
			item.setTitle?.mock.calls.some(([title]) => title === "Delete task")
		);
		const deleteHandler = deleteItem?.onClick?.mock.calls[0][0] as
			| (() => Promise<void>)
			| undefined;

		expect(deleteHandler).toBeDefined();
		await deleteHandler?.();

		expect(showConfirmationModal).toHaveBeenCalledWith(
			plugin.app,
			expect.objectContaining({ isDestructive: true })
		);
		expect(plugin.taskService.deleteTask).toHaveBeenCalledWith(task);
	});
});