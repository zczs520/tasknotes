import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import {
	renderTaskCardSecondaryBadges,
	syncTaskCardBlockedByExpansionControls,
	toggleTaskCardBlockedByExpansion,
	updateTaskCardSecondaryBadges,
	type TaskCardSecondaryBadgeHandlers,
} from "../../../src/ui/taskCardSecondaryBadges";

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Task",
		status: "open",
		priority: "normal",
		path: "Tasks/task.md",
		archived: false,
		...overrides,
	};
}

function createPlugin(overrides: Partial<TaskNotesPlugin> = {}): TaskNotesPlugin {
	return {
		settings: {
			showExpandableSubtasks: true,
			expandSubtasksByDefault: false,
			enableDebugLogging: false,
		},
		app: {
			vault: {
				getAbstractFileByPath: jest.fn(() => null),
			},
			metadataCache: {
				getFirstLinkpathDest: jest.fn(() => null),
			},
			workspace: {
				trigger: jest.fn(),
			},
		},
		i18n: {
			translate: jest.fn((key: string, vars?: Record<string, string | number>) => {
				const translations: Record<string, string> = {
					"ui.taskCard.labels.recurrence": "Recurrence",
					"ui.taskCard.recurrenceTooltip": `Recurrence: ${vars?.value ?? ""}`,
					"ui.taskCard.reminderTooltipOne": "1 reminder",
					"ui.taskCard.reminderTooltipMany": `${vars?.count ?? 0} reminders`,
					"ui.taskCard.detailsTooltip": "Has details",
					"ui.taskCard.projectTooltip": "Project",
					"ui.taskCard.expandSubtasks": "Expand subtasks",
					"ui.taskCard.collapseSubtasks": "Collapse subtasks",
					"ui.taskCard.blockingToggle": `Blocking ${vars?.count ?? 0} tasks`,
					"ui.taskCard.blockedBadge": "Blocked",
					"ui.taskCard.trackingActive": "Tracking now",
					"contextMenus.task.startTimeTracking": "Start time tracking",
					"contextMenus.task.stopTimeTracking": "Stop time tracking",
					"ui.activeTaskControl.stopAction": "Stop",
					"ui.activeTaskControl.endAction": "Complete",
				};
				return translations[key] ?? key;
			}),
		},
		projectSubtasksService: {
			isTaskUsedAsProjectSync: jest.fn(() => false),
			isTaskUsedAsProject: jest.fn(async () => false),
		},
		expandedProjectsService: {
			isExpanded: jest.fn(() => false),
			toggle: jest.fn(() => true),
		},
		startTimeTracking: jest.fn(async (task: TaskInfo) => ({
			...task,
			timeEntries: [{ startTime: "2026-07-28T10:00:00.000Z" }],
		})),
		stopTimeTracking: jest.fn(async (task: TaskInfo) => ({
			...task,
			timeEntries: task.timeEntries?.map((entry) => ({
				...entry,
				endTime: entry.endTime ?? "2026-07-28T10:30:00.000Z",
			})),
		})),
		startTask: jest.fn(async (task: TaskInfo) => ({
			...task,
			status: "in-progress",
			timeEntries: [{ startTime: "2026-07-28T10:00:00.000Z" }],
		})),
		stopTask: jest.fn(async (task: TaskInfo) => ({
			...task,
			status: "open",
			timeEntries: task.timeEntries?.map((entry) => ({
				...entry,
				endTime: entry.endTime ?? "2026-07-28T10:30:00.000Z",
			})),
		})),
		endTask: jest.fn(async (task: TaskInfo) => ({
			...task,
			status: "done",
			timeEntries: task.timeEntries?.map((entry) => ({
				...entry,
				endTime: entry.endTime ?? "2026-07-28T10:30:00.000Z",
			})),
		})),
		...overrides,
	} as unknown as TaskNotesPlugin;
}

function createHandlers(): jest.Mocked<TaskCardSecondaryBadgeHandlers> {
	return {
		toggleSubtasks: jest.fn(async () => undefined),
		toggleBlockingTasks: jest.fn(async () => undefined),
		toggleBlockedByTasks: jest.fn(async () => undefined),
	};
}

function createCard() {
	const card = document.createElement("div");
	card.className = "task-card";
	const mainRow = card.createDiv({ cls: "task-card__main-row" });
	const badgesContainer = mainRow.createDiv({ cls: "task-card__badges" });
	document.body.appendChild(card);
	return { card, mainRow, badgesContainer };
}

describe("taskCardSecondaryBadges", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		jest.clearAllMocks();
	});

	it("renders recurrence, reminder, details, project, chevron, and dependency controls", () => {
		const plugin = createPlugin();
		(plugin.projectSubtasksService.isTaskUsedAsProjectSync as jest.Mock).mockReturnValue(true);
		(plugin.expandedProjectsService?.isExpanded as jest.Mock).mockReturnValue(true);
		const handlers = createHandlers();
		const { card, badgesContainer } = createCard();
		const task = createTask({
			recurrence: "FREQ=DAILY",
			reminders: [
				{
					id: "reminder-1",
					type: "absolute",
					absoluteTime: "2026-05-19T09:00:00",
				},
			],
			blocking: ["Tasks/dependent.md"],
			blockedBy: [{ uid: "Tasks/blocker.md", reltype: "FINISHTOSTART" }],
		});

		renderTaskCardSecondaryBadges({
			card,
			badgesContainer,
			task,
			plugin,
			hasDetails: true,
			propertyOptions: {},
			handlers,
		});

		expect(card.querySelector(".task-card__recurring-indicator")).not.toBeNull();
		expect(card.querySelector(".task-card__reminder-indicator")).not.toBeNull();
		expect(card.querySelector(".task-card__details-indicator")).not.toBeNull();
		expect(card.querySelector(".task-card__project-indicator")).not.toBeNull();
		expect(card.querySelector(".task-card__chevron--expanded")).not.toBeNull();
		expect(card.querySelector(".task-card__blocking-toggle")?.getAttribute("role")).toBe(
			"button"
		);
		expect(card.querySelector(".task-card__blocked-toggle")?.getAttribute("role")).toBe(
			"button"
		);
		expect(handlers.toggleSubtasks).toHaveBeenCalledWith(card, task, true);
	});

	it("shows separate stop and complete actions while tracking", async () => {
		const plugin = createPlugin();
		const handlers = createHandlers();
		const { card, badgesContainer } = createCard();
		const task = createTask();

		renderTaskCardSecondaryBadges({
			card,
			badgesContainer,
			task,
			plugin,
			hasDetails: false,
			propertyOptions: { showTimeTrackingAction: true },
			handlers,
		});

		const startControl = card.querySelector<HTMLButtonElement>(
			".task-card__time-tracking-control"
		);
		expect(startControl?.textContent).toContain("Start time tracking");
		startControl?.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.startTask).toHaveBeenCalledWith(task);
		const activeControl = card.querySelector<HTMLElement>(
			".task-card__time-tracking-control--active"
		);
		const stopControl = activeControl?.querySelector<HTMLButtonElement>(
			".task-card__time-tracking-action--stop"
		);
		const completeControl = activeControl?.querySelector<HTMLButtonElement>(
			".task-card__time-tracking-action--complete"
		);
		expect(activeControl?.textContent).toContain("Tracking now");
		expect(stopControl?.textContent).toContain("Stop");
		expect(completeControl?.textContent).toContain("Complete");
		stopControl?.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.stopTask).toHaveBeenCalledWith(
			expect.objectContaining({ path: task.path, status: "in-progress" })
		);

		badgesContainer.replaceChildren();
		const trackedTask = createTask({
			status: "in-progress",
			timeEntries: [{ startTime: "2026-07-28T10:00:00.000Z" }],
		});
		renderTaskCardSecondaryBadges({
			card,
			badgesContainer,
			task: trackedTask,
			plugin,
			hasDetails: false,
			propertyOptions: { showTimeTrackingAction: true },
			handlers,
		});
		card
			.querySelector<HTMLButtonElement>(".task-card__time-tracking-action--complete")
			?.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.endTask).toHaveBeenCalledWith(trackedTask);
	});

	it("keeps secondary badges omitted when the option is disabled", () => {
		const plugin = createPlugin();
		const handlers = createHandlers();
		const { card, badgesContainer } = createCard();
		const task = createTask({
			recurrence: "FREQ=DAILY",
			blocking: ["Tasks/dependent.md"],
		});

		renderTaskCardSecondaryBadges({
			card,
			badgesContainer,
			task,
			plugin,
			hasDetails: true,
			propertyOptions: { showSecondaryBadges: false },
			handlers,
		});

		expect(badgesContainer.childElementCount).toBe(0);
	});

	it("updates, creates, refreshes, and removes secondary badge controls", async () => {
		const plugin = createPlugin();
		(plugin.projectSubtasksService.isTaskUsedAsProject as jest.Mock).mockResolvedValue(true);
		(plugin.expandedProjectsService?.isExpanded as jest.Mock).mockReturnValue(false);
		const handlers = createHandlers();
		const { card, mainRow } = createCard();
		const expandedBlocking = card.createDiv({ cls: "task-card__blocking" });
		expandedBlocking.textContent = "expanded";
		const task = createTask({
			recurrence: "FREQ=DAILY",
			blocking: ["Tasks/dependent.md"],
			blockedBy: [{ uid: "Tasks/blocker.md", reltype: "FINISHTOSTART" }],
		});

		updateTaskCardSecondaryBadges({
			card,
			mainRow,
			task,
			plugin,
			hasDetails: true,
			propertyOptions: {},
			handlers,
		});
		await Promise.resolve();

		expect(card.querySelector(".task-card__recurring-indicator")).not.toBeNull();
		expect(card.querySelector(".task-card__details-indicator")).not.toBeNull();
		expect(card.querySelector(".task-card__project-indicator")).not.toBeNull();
		expect(card.querySelector(".task-card__chevron")).not.toBeNull();
		expect(card.querySelector(".task-card__blocking-toggle")?.dataset.count).toBe("1");
		expect(card.querySelector(".task-card__blocked-toggle")?.dataset.count).toBe("1");

		updateTaskCardSecondaryBadges({
			card,
			mainRow,
			task: createTask(),
			plugin,
			hasDetails: false,
			propertyOptions: {},
			handlers,
		});
		await Promise.resolve();

		expect(card.querySelector(".task-card__recurring-indicator")).toBeNull();
		expect(card.querySelector(".task-card__details-indicator")).toBeNull();
		expect(card.querySelector(".task-card__blocking-toggle")).toBeNull();
		expect(card.querySelector(".task-card__blocked-toggle")).toBeNull();
		expect(card.querySelector(".task-card__blocking")).toBeNull();
	});

	it("syncs blocked-by expansion controls and toggles via the injected handler", async () => {
		const plugin = createPlugin();
		const handlers = createHandlers();
		const { card } = createCard();
		const toggle = card.createDiv({ cls: "task-card__blocked-toggle" });
		const pill = card.createDiv({ cls: "task-card__metadata-pill--blocked" });
		pill.setAttribute("role", "button");
		const task = createTask({
			blockedBy: [{ uid: "Tasks/blocker.md", reltype: "FINISHTOSTART" }],
		});

		syncTaskCardBlockedByExpansionControls(card, true);
		expect(toggle.classList.contains("task-card__blocked-toggle--expanded")).toBe(true);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(pill.getAttribute("aria-expanded")).toBe("true");

		await toggleTaskCardBlockedByExpansion({ card, task, plugin, handlers });
		expect(handlers.toggleBlockedByTasks).toHaveBeenCalledWith(card, task, true);

		card.createDiv({ cls: "task-card__blocked-by" });
		await toggleTaskCardBlockedByExpansion({ card, task, plugin, handlers });
		expect(handlers.toggleBlockedByTasks).toHaveBeenLastCalledWith(card, task, false);
	});

	it("removes stale secondary badges and relationship containers when updates disable them", () => {
		const plugin = createPlugin();
		const handlers = createHandlers();
		const { card, mainRow } = createCard();
		card.createDiv({ cls: "task-card__recurring-indicator" });
		card.createDiv({ cls: "task-card__blocking-toggle" });
		card.createDiv({ cls: "task-card__blocked-by" });

		updateTaskCardSecondaryBadges({
			card,
			mainRow,
			task: createTask({ recurrence: "FREQ=DAILY" }),
			plugin,
			hasDetails: true,
			propertyOptions: { showSecondaryBadges: false },
			handlers,
		});

		expect(card.querySelector(".task-card__recurring-indicator")).toBeNull();
		expect(card.querySelector(".task-card__blocking-toggle")).toBeNull();
		expect(card.querySelector(".task-card__blocked-by")).toBeNull();
	});
});
