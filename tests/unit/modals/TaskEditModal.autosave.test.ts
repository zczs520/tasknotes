import { TFile, type App } from "obsidian";
import { TaskEditModal } from "../../../src/modals/TaskEditModal";
import type { TaskInfo } from "../../../src/types";
import { MockObsidian } from "../../helpers/obsidian-runtime";

function createTask(): TaskInfo {
	return {
		title: "Original task",
		status: "open",
		priority: "normal",
		path: "test-task.md",
		archived: false,
		due: "",
		scheduled: "",
		contexts: [],
		projects: [],
		tags: ["task"],
		details: "Original details",
	} as TaskInfo;
}

function createPlugin(app: App) {
	return {
		app,
		settings: {
			taskTag: "task",
			taskIdentificationMethod: "tag",
			defaultTaskPriority: "normal",
			defaultTaskStatus: "open",
			useFrontmatterMarkdownLinks: false,
			modalFieldsConfig: {},
			userFields: [],
		},
		taskService: {
			updateTask: jest.fn(async (task: TaskInfo, changes: Partial<TaskInfo>) => ({
				...task,
				...changes,
			})),
			updateBlockingRelationships: jest.fn(),
		},
		cacheManager: {
			getTaskInfo: jest.fn(),
		},
		projectSubtasksService: {
			getTasksLinkedToProject: jest.fn().mockResolvedValue([]),
			sortTasks: jest.fn((tasks: TaskInfo[]) => tasks),
		},
		i18n: {
			translate: jest.fn((key: string) => {
				const translations: Record<string, string> = {
					"modals.task.buttons.openNote": "Open note",
					"modals.taskEdit.notices.titleRequired": "Title is required",
					"modals.taskEdit.notices.updateFailure": "Update failed",
				};
				return translations[key] ?? key;
			}),
		},
	};
}

function initializeModalState(modal: TaskEditModal, task: TaskInfo): void {
	Object.assign(modal as unknown as Record<string, unknown>, {
		task,
		title: task.title,
		status: task.status,
		priority: task.priority,
		dueDate: task.due || "",
		scheduledDate: task.scheduled || "",
		contexts: "",
		projects: "",
		tags: "",
		initialTags: "",
		details: task.details || "",
		originalDetails: task.details || "",
		autoSaveReady: true,
	});
}

describe("TaskEditModal autosave", () => {
	let app: App;
	let task: TaskInfo;

	beforeEach(() => {
		MockObsidian.reset();
		app = MockObsidian.createMockApp() as unknown as App;
		task = createTask();
	});

	it("debounces form changes and saves them without a submit action", async () => {
		jest.useFakeTimers();
		const plugin = createPlugin(app);
		const modal = new TaskEditModal(app, plugin as never, { task });
		initializeModalState(modal, task);

		(modal as unknown as { title: string }).title = "Autosaved title";
		(modal as unknown as { onFormStateChanged(): void }).onFormStateChanged();

		await jest.advanceTimersByTimeAsync(449);
		expect(plugin.taskService.updateTask).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(1);
		expect(plugin.taskService.updateTask).toHaveBeenCalledWith(
			task,
			expect.objectContaining({ title: "Autosaved title" })
		);
		jest.useRealTimers();
	});

	it("queues edits made while an earlier save is still running", async () => {
		const plugin = createPlugin(app);
		let finishFirstSave!: (task: TaskInfo) => void;
		plugin.taskService.updateTask
			.mockImplementationOnce(
				() => new Promise<TaskInfo>((resolve) => (finishFirstSave = resolve))
			)
			.mockImplementation(async (currentTask, changes) => ({ ...currentTask, ...changes }));
		const modal = new TaskEditModal(app, plugin as never, { task });
		initializeModalState(modal, task);

		(modal as unknown as { title: string }).title = "First title";
		const firstFlush = (
			modal as unknown as { flushAutoSave(): Promise<boolean> }
		).flushAutoSave();
		await Promise.resolve();

		(modal as unknown as { title: string }).title = "Latest title";
		const queuedFlush = (
			modal as unknown as { flushAutoSave(): Promise<boolean> }
		).flushAutoSave();
		finishFirstSave({ ...task, title: "First title" });

		await Promise.all([firstFlush, queuedFlush]);
		expect(plugin.taskService.updateTask).toHaveBeenCalledTimes(2);
		expect(plugin.taskService.updateTask).toHaveBeenLastCalledWith(
			expect.objectContaining({ title: "First title" }),
			expect.objectContaining({ title: "Latest title" })
		);
		expect((modal as unknown as { title: string }).title).toBe("Latest title");
	});

	it("flushes the latest change before closing without an unsaved-changes prompt", async () => {
		const plugin = createPlugin(app);
		const modal = new TaskEditModal(app, plugin as never, { task });
		initializeModalState(modal, task);
		const forceClose = jest.spyOn(modal, "forceClose");

		(modal as unknown as { details: string }).details = "Latest details";
		modal.close();
		await Promise.resolve();
		await Promise.resolve();
		await new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(plugin.taskService.updateTask).toHaveBeenCalledWith(
			task,
			expect.objectContaining({ details: "Latest details" })
		);
		expect(forceClose).toHaveBeenCalledTimes(1);
	});

	it("renders no bottom action bar in edit mode", () => {
		const plugin = createPlugin(app);
		const modal = new TaskEditModal(app, plugin as never, { task });
		const container = document.createElement("div");

		(
			modal as unknown as { createActionButtons(container: HTMLElement): void }
		).createActionButtons(container);

		expect(container.children).toHaveLength(0);
	});

	it("renders edit actions in the modal header", () => {
		const plugin = createPlugin(app);
		const modal = new TaskEditModal(app, plugin as never, { task });

		(modal as unknown as { createHeaderOpenNoteButton(): void }).createHeaderOpenNoteButton();

		const button = modal.containerEl.querySelector<HTMLButtonElement>(
			".tn-task-modal__header-open-note"
		);
		expect(button?.querySelector(".tn-task-modal__header-action-icon")).toBeTruthy();
		expect(button?.querySelector(".tn-task-modal__header-action-label")?.textContent).toBe(
			"Open note"
		);
		expect(modal.containerEl.querySelectorAll(".tn-task-modal__header-open-note")).toHaveLength(
			1
		);
		expect(modal.containerEl.querySelectorAll(".tn-task-modal__header-archive")).toHaveLength(
			1
		);
		expect(modal.containerEl.querySelectorAll(".tn-task-modal__header-delete")).toHaveLength(1);
	});

	it("saves pending edits, closes immediately, and reuses the active leaf when opening the note", async () => {
		const plugin = createPlugin(app);
		const modal = new TaskEditModal(app, plugin as never, { task });
		initializeModalState(modal, task);
		Object.assign(modal as unknown as Record<string, unknown>, {
			formChangeVersion: 1,
			savedFormChangeVersion: 0,
		});
		const file = new TFile(task.path);
		const openFile = jest.fn().mockResolvedValue(undefined);
		const getLeaf = jest.fn(() => ({ openFile }));
		(app.vault as unknown as { getAbstractFileByPath: jest.Mock }).getAbstractFileByPath =
			jest.fn(() => file);
		(app.workspace as unknown as { getLeaf: jest.Mock }).getLeaf = getLeaf;
		const flushAutoSave = jest
			.spyOn(modal as unknown as { flushAutoSave(): Promise<boolean> }, "flushAutoSave")
			.mockResolvedValue(true);
		const scheduleCleanup = jest.spyOn(
			modal as unknown as { scheduleNavigationModalCleanup(): void },
			"scheduleNavigationModalCleanup"
		);

		await (modal as unknown as { openTaskNote(): Promise<void> }).openTaskNote();

		expect(flushAutoSave).toHaveBeenCalledTimes(1);
		expect(scheduleCleanup).toHaveBeenCalledTimes(1);
		expect(modal.containerEl.hidden).toBe(true);
		expect(getLeaf).toHaveBeenCalledWith(false);
		expect(openFile).toHaveBeenCalledWith(file);
		expect(openFile.mock.invocationCallOrder[0]).toBeLessThan(
			scheduleCleanup.mock.invocationCallOrder[0]
		);
	});

	it("opens immediately without running change detection when no edits are pending", async () => {
		const plugin = createPlugin(app);
		const modal = new TaskEditModal(app, plugin as never, { task });
		initializeModalState(modal, task);
		const file = new TFile(task.path);
		const openFile = jest.fn().mockResolvedValue(undefined);
		const getLeaf = jest.fn(() => ({ openFile }));
		(app.vault as unknown as { getAbstractFileByPath: jest.Mock }).getAbstractFileByPath =
			jest.fn(() => file);
		(app.workspace as unknown as { getLeaf: jest.Mock }).getLeaf = getLeaf;
		const flushAutoSave = jest.spyOn(
			modal as unknown as { flushAutoSave(): Promise<boolean> },
			"flushAutoSave"
		);
		const scheduleCleanup = jest
			.spyOn(
				modal as unknown as { scheduleNavigationModalCleanup(): void },
				"scheduleNavigationModalCleanup"
			)
			.mockImplementation(() => undefined);

		await (modal as unknown as { openTaskNote(): Promise<void> }).openTaskNote();

		expect(flushAutoSave).not.toHaveBeenCalled();
		expect(scheduleCleanup).toHaveBeenCalledTimes(1);
		expect(modal.containerEl.hidden).toBe(true);
		expect(getLeaf).toHaveBeenCalledWith(false);
		expect(openFile).toHaveBeenCalledWith(file);
	});

	it("keeps the edit modal open when pending changes cannot be saved", async () => {
		const plugin = createPlugin(app);
		const modal = new TaskEditModal(app, plugin as never, { task });
		initializeModalState(modal, task);
		Object.assign(modal as unknown as Record<string, unknown>, {
			formChangeVersion: 1,
			savedFormChangeVersion: 0,
		});
		const getLeaf = jest.fn();
		(app.workspace as unknown as { getLeaf: jest.Mock }).getLeaf = getLeaf;
		jest.spyOn(
			modal as unknown as { flushAutoSave(): Promise<boolean> },
			"flushAutoSave"
		).mockResolvedValue(false);
		const scheduleCleanup = jest.spyOn(
			modal as unknown as { scheduleNavigationModalCleanup(): void },
			"scheduleNavigationModalCleanup"
		);

		await (modal as unknown as { openTaskNote(): Promise<void> }).openTaskNote();

		expect(scheduleCleanup).not.toHaveBeenCalled();
		expect(modal.containerEl.hidden).toBe(false);
		expect(getLeaf).not.toHaveBeenCalled();
	});
});
