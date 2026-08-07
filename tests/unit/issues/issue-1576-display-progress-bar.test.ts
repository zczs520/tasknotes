import { createTaskCard, updateTaskCard } from "../../../src/ui/TaskCard";
import { TaskFactory } from "../../helpers/mock-factories";
import { App, MockObsidian } from "../../helpers/obsidian-runtime";

jest.mock("../../../src/utils/helpers", () => ({
	calculateTotalTimeSpent: jest.fn(() => 0),
	getEffectiveTaskStatus: jest.fn((task) => task.status || "open"),
	shouldUseRecurringTaskUI: jest.fn(() => false),
	getRecurringTaskCompletionText: jest.fn(() => "Not completed for this date"),
	getRecurrenceDisplayText: jest.fn(() => "Daily"),
	filterEmptyProjects: jest.fn((projects) => projects?.filter((p: string) => p && p.trim()) || []),
	sanitizeForCssClass: jest.fn((value: string) => value.toLowerCase().replace(/\s+/g, "-")),
}));

jest.mock("../../../src/utils/dateUtils", () => ({
	isTodayTimeAware: jest.fn(() => false),
	isOverdueTimeAware: jest.fn(() => false),
	formatDateTimeForDisplay: jest.fn(() => "Jan 15"),
	getDatePart: jest.fn(() => ""),
	getTimePart: jest.fn(() => null),
	formatDateForStorage: jest.fn((value: Date | string) => {
		if (value instanceof Date) {
			return value.toISOString().split("T")[0];
		}
		return value?.split("T")[0] || "";
	}),
}));

jest.mock("../../../src/components/TaskContextMenu", () => ({
	TaskContextMenu: jest.fn().mockImplementation(() => ({
		show: jest.fn(),
	})),
}));

describe("Issue #1576 - Display Progress Bar on task cards", () => {
	let app: App;
	let plugin: any;

	beforeEach(() => {
		jest.clearAllMocks();
		MockObsidian.reset();

		app = new App();
		plugin = {
			app,
			fieldMapper: {
				lookupMappingKey: jest.fn((propertyId: string) => {
					const mapped = new Set(["status", "priority", "due", "scheduled", "contexts", "projects"]);
					return mapped.has(propertyId) ? propertyId : null;
				}),
				isPropertyForField: jest.fn((propertyId: string, field: string) => propertyId === field),
				toUserField: jest.fn((field: string) => field),
				getMapping: jest.fn(() => ({
					status: "status",
					priority: "priority",
					due: "due",
					scheduled: "scheduled",
					contexts: "contexts",
					projects: "projects",
				})),
			},
			statusManager: {
				isCompletedStatus: jest.fn((status: string) => status === "done"),
				getStatusConfig: jest.fn((status: string) => ({
					value: status,
					label: status,
					color: "#666666",
				})),
				getNextStatus: jest.fn(() => "done"),
				getCompletedStatuses: jest.fn(() => ["done"]),
			},
			priorityManager: {
				getPriorityConfig: jest.fn((priority: string) => ({
					value: priority,
					label: priority,
					color: "#ff0000",
				})),
			},
			getActiveTimeSession: jest.fn(() => null),
			cacheManager: {
				getTaskInfo: jest.fn(),
			},
			updateTaskProperty: jest.fn(),
			getTaskByPath: jest.fn(),
			projectSubtasksService: {
				isTaskUsedAsProject: jest.fn().mockResolvedValue(false),
				isTaskUsedAsProjectSync: jest.fn().mockReturnValue(false),
				getSubtaskProgressSync: jest.fn().mockReturnValue(null),
			},
			i18n: {
				translate: jest.fn((key: string) => key),
			},
			settings: {
				singleClickAction: "edit",
				doubleClickAction: "none",
				showExpandableSubtasks: true,
				subtaskChevronPosition: "right",
				hideCompletedFromOverdue: true,
				calendarViewSettings: {
					timeFormat: "24",
				},
			},
		};

		jest.spyOn(console, "error").mockImplementation(() => {});
		jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("renders linked subtask progress instead of Markdown checkbox progress", () => {
		const task = TaskFactory.createTask({
			path: "tasks/progress-task.md",
			title: "Parent task",
		});

		MockObsidian.createTestFile(task.path, "# Parent task");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [{ task: "x", parent: -1 }],
		});
		plugin.projectSubtasksService.getSubtaskProgressSync.mockReturnValue({
			completed: 1,
			total: 2,
			percent: 50,
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);

		const progressEl = card.querySelector(".task-card__progress");
		expect(progressEl).not.toBeNull();
		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("1/2");
		expect((card.querySelector(".task-card__progress-fill") as HTMLElement).style.width).toBe("50%");
	});

	it("does not render progress when the task has no linked subtasks", () => {
		const task = TaskFactory.createTask({
			path: "tasks/nested-only-task.md",
			title: "Nested only",
		});

		MockObsidian.createTestFile(task.path, "# Nested only");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [{ task: "x", parent: -1 }],
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);

		expect(card.querySelector(".task-card__progress")).toBeNull();
		const metadata = card.querySelector(".task-card__metadata") as HTMLElement;
		expect(metadata.style.display).toBe("none");
	});

	it("updates progress after linked subtask statuses change", () => {
		const task = TaskFactory.createTask({
			path: "tasks/update-progress-task.md",
			title: "Update progress",
		});

		MockObsidian.createTestFile(task.path, "# Update progress");
		plugin.projectSubtasksService.getSubtaskProgressSync.mockReturnValue({
			completed: 1,
			total: 2,
			percent: 50,
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);
		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("1/2");

		plugin.projectSubtasksService.getSubtaskProgressSync.mockReturnValue({
			completed: 2,
			total: 2,
			percent: 100,
		});

		updateTaskCard(card, task, plugin, ["checklistProgress"]);

		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("2/2");
		expect((card.querySelector(".task-card__progress-fill") as HTMLElement).style.width).toBe("100%");
	});

	it("renders an empty bar when none of the linked subtasks are complete", () => {
		const task = TaskFactory.createTask({
			path: "tasks/custom-marker-task.md",
			title: "Custom marker",
		});

		plugin.projectSubtasksService.getSubtaskProgressSync.mockReturnValue({
			completed: 0,
			total: 3,
			percent: 0,
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);
		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("0/3");
		expect((card.querySelector(".task-card__progress-fill") as HTMLElement).style.width).toBe("0%");
	});
});
