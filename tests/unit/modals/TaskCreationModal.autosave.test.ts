import { TFile, type App } from "obsidian";
import { TaskCreationModal } from "../../../src/modals/TaskCreationModal";
import type { TaskInfo } from "../../../src/types";
import { MockObsidian } from "../../helpers/obsidian-runtime";

function createHarness() {
	const app = MockObsidian.createMockApp() as unknown as App;
	const file = new TFile("TaskNotes/Untitled Task.md");
	let currentTask: TaskInfo = {
		title: "Untitled Task",
		status: "open",
		priority: "normal",
		path: file.path,
		archived: false,
		due: "",
		scheduled: "",
		contexts: [],
		projects: [],
		tags: ["task"],
		details: "",
	} as TaskInfo;

	(app.vault as unknown as { getAbstractFileByPath: jest.Mock }).getAbstractFileByPath =
		jest.fn(() => file);
	(app.metadataCache as unknown as { getFileCache: jest.Mock }).getFileCache = jest.fn(
		() => ({ frontmatter: { tags: ["task"] } })
	);

	const plugin = {
		app,
		settings: {
			defaultTaskPriority: "normal",
			defaultTaskStatus: "open",
			taskTag: "task",
			taskIdentificationMethod: "tag",
			taskCreationDefaults: {
				defaultDueDate: "none",
				defaultScheduledDate: "none",
				defaultContexts: "",
				defaultTags: "",
				defaultTimeEstimate: 0,
				defaultRecurrence: "none",
				defaultReminders: [],
			},
			customStatuses: [],
			customPriorities: [],
			enableNaturalLanguageInput: false,
			userFields: [],
			openTaskAfterCreation: "none",
			useFrontmatterMarkdownLinks: false,
			storeTitleInFilename: false,
		},
		taskService: {
			createTask: jest.fn(async (taskData: Partial<TaskInfo>) => {
				currentTask = { ...currentTask, ...taskData, path: file.path } as TaskInfo;
				return { file, taskInfo: currentTask };
			}),
			updateTask: jest.fn(async (task: TaskInfo, changes: Partial<TaskInfo>) => {
				currentTask = { ...task, ...changes };
				return currentTask;
			}),
			updateBlockingRelationships: jest.fn(),
		},
		cacheManager: {
			getTaskInfo: jest.fn(async () => currentTask),
		},
		updateTaskProperty: jest.fn(),
		i18n: {
		translate: jest.fn((key: string) => {
				if (key === "modals.task.untitledTitlePlaceholder") return "Untitled Task";
				if (key === "modals.task.buttons.openNote") return "Open note";
				return key;
			}),
		},
	};

	const modal = new TaskCreationModal(app, plugin as never);
	Object.assign(modal as unknown as Record<string, unknown>, {
		autoCreateEnabled: true,
	});

	return { modal, plugin, file, getCurrentTask: () => currentTask };
}

describe("TaskCreationModal immediate draft and autosave", () => {
	beforeEach(() => {
		MockObsidian.reset();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("creates an untitled task as soon as the creation form initializes", async () => {
		const { modal, plugin } = createHarness();
		const onTaskCreated = jest.fn();
		Object.assign(modal as unknown as Record<string, unknown>, {
			options: { onTaskCreated },
		});

		await modal.initializeFormData();

		expect(plugin.taskService.createTask).toHaveBeenCalledTimes(1);
		expect(plugin.taskService.createTask).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Untitled Task", status: "open" }),
			{ applyDefaults: false }
		);
		expect(onTaskCreated).toHaveBeenCalledTimes(1);
	});

	it("renders no bottom create or cancel action bar", () => {
		const { modal } = createHarness();
		const container = document.createElement("div");

		(
			modal as unknown as { createActionButtons(container: HTMLElement): void }
		).createActionButtons(container);

		expect(container.children).toHaveLength(0);
	});

	it("renders an Open note action at the start of the modal header", () => {
		const { modal } = createHarness();

		(
			modal as unknown as { createHeaderOpenNoteButton(): void }
		).createHeaderOpenNoteButton();

		const header = modal.titleEl.parentElement;
		const button = header?.querySelector<HTMLButtonElement>(
			".tn-task-modal__header-open-note"
		);
		expect(button?.querySelector(".tn-task-modal__header-open-note-icon")).toBeTruthy();
		expect(button?.querySelector(".tn-task-modal__header-open-note-label")?.textContent).toBe(
			"Open note"
		);
		expect(button?.nextElementSibling).toBe(modal.titleEl);
	});

	it("debounces edits and updates the already-created draft", async () => {
		const { modal, plugin } = createHarness();
		await modal.initializeFormData();

		Object.assign(modal as unknown as Record<string, unknown>, {
			title: "Edited title",
			details: "Details that must not be lost",
			status: "in-progress",
		});
		(
			modal as unknown as { onFormStateChanged(): void }
		).onFormStateChanged();

		await jest.advanceTimersByTimeAsync(449);
		expect(plugin.taskService.updateTask).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(1);
		expect(plugin.taskService.updateTask).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Untitled Task" }),
			expect.objectContaining({
				title: "Edited title",
				details: "Details that must not be lost",
				status: "in-progress",
			})
		);
	});

	it("flushes the latest edit before any close path can dismiss the modal", async () => {
		const { modal, plugin, getCurrentTask } = createHarness();
		await modal.initializeFormData();
		const forceClose = jest.spyOn(modal, "forceClose").mockImplementation(() => undefined);

		Object.assign(modal as unknown as Record<string, unknown>, {
			details: "Last-second edit",
		});
		modal.close();
		await Promise.resolve();
		await Promise.resolve();
		await jest.runAllTimersAsync();

		expect(plugin.taskService.updateTask).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ details: "Last-second edit" })
		);
		expect(getCurrentTask().details).toBe("Last-second edit");
		expect(forceClose).toHaveBeenCalledTimes(1);
	});

	it("flushes edits and opens the created note in the active tab", async () => {
		const { modal, plugin, file } = createHarness();
		await modal.initializeFormData();
		const openFile = jest.fn().mockResolvedValue(undefined);
		const getLeaf = jest.fn(() => ({ openFile }));
		(app.workspace as unknown as { getLeaf: jest.Mock }).getLeaf = getLeaf;
		const scheduleCleanup = jest
			.spyOn(
				modal as unknown as { scheduleNavigationModalCleanup(): void },
				"scheduleNavigationModalCleanup"
			)
			.mockImplementation(() => undefined);
		Object.assign(modal as unknown as Record<string, unknown>, {
			details: "Latest details",
		});

		await (modal as unknown as { openTaskNote(): Promise<void> }).openTaskNote();

		expect(plugin.taskService.updateTask).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ details: "Latest details" })
		);
		expect(modal.containerEl.hidden).toBe(true);
		expect(getLeaf).toHaveBeenCalledWith(false);
		expect(openFile).toHaveBeenCalledWith(file);
		expect(scheduleCleanup).toHaveBeenCalledTimes(1);
	});
});
