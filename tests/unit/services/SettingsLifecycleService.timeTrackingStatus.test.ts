import { jest } from "@jest/globals";
import { SettingsLifecycleService } from "../../../src/services/SettingsLifecycleService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { EVENT_TASK_UPDATED, type TaskInfo } from "../../../src/types";

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

function createHarness(options: { autoStopOnComplete?: boolean; tasks?: TaskInfo[] } = {}) {
	const listeners: Array<(data: unknown) => Promise<void>> = [];
	const stopPersistedTracking = jest.fn(async (task: TaskInfo) => task);
	const plugin = {
		settings: {
			...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
			autoStopTimeTrackingOnComplete: options.autoStopOnComplete ?? false,
		},
		emitter: {
			on: jest.fn((event: string, listener: (data: unknown) => Promise<void>) => {
				expect(event).toBe(EVENT_TASK_UPDATED);
				listeners.push(listener);
				return { event, listener };
			}),
			offref: jest.fn(),
		},
		statusManager: {
			getAllStatuses: jest.fn(() => [
				{ id: "open", value: "open" },
				{ id: "in-progress", value: "in-progress" },
			]),
			normalizeStatusValue: jest.fn((status: unknown) => String(status).trim().toLowerCase()),
		},
		getActiveTimeSession: jest.fn(
			(task: TaskInfo) => (task.timeEntries ?? []).find((entry) => !entry.endTime) ?? null
		),
		startTimeTracking: jest.fn(async (task: TaskInfo) => task),
		stopTimeTracking: jest.fn(async (task: TaskInfo) => task),
		updateTaskProperty: jest.fn(async (task: TaskInfo) => task),
		cacheManager: {
			getAllTasks: jest.fn(async () => options.tasks ?? []),
		},
		taskService: {
			stopTimeTracking: stopPersistedTracking,
		},
	};
	const service = new SettingsLifecycleService(plugin as any);
	service.setupTimeTrackingEventListeners();
	const reconciliation = (
		service as unknown as { statusTimeTrackingReconciliation: Promise<void> }
	).statusTimeTrackingReconciliation;
	return { plugin, service, listeners, listener: listeners[0], reconciliation };
}

describe("status and time tracking linkage", () => {
	it("starts tracking when a task enters the in-progress status", async () => {
		const { plugin, listener } = createHarness();
		const originalTask = createTask({ status: "open" });
		const updatedTask = createTask({ status: "in-progress" });

		await listener({ originalTask, updatedTask });

		expect(plugin.startTimeTracking).toHaveBeenCalledWith(updatedTask);
		expect(plugin.updateTaskProperty).not.toHaveBeenCalled();
	});

	it("stops tracking when a task leaves the in-progress status", async () => {
		const { plugin, listener } = createHarness();
		const timeEntries = [{ startTime: "2026-07-29T10:00:00+08:00" }];
		const originalTask = createTask({ status: "in-progress", timeEntries });
		const updatedTask = createTask({ status: "open", timeEntries });

		await listener({ originalTask, updatedTask });

		expect(plugin.stopTimeTracking).toHaveBeenCalledWith(updatedTask);
		expect(plugin.startTimeTracking).not.toHaveBeenCalled();
	});

	it("leaves tracking-only updates to the task action coordinator", async () => {
		const { plugin, listener } = createHarness();
		const originalTask = createTask({ status: "open", timeEntries: [] });
		const updatedTask = createTask({
			status: "open",
			timeEntries: [{ startTime: "2026-07-29T10:00:00+08:00" }],
		});

		await listener({ originalTask, updatedTask });

		expect(plugin.updateTaskProperty).not.toHaveBeenCalled();
		expect(plugin.startTimeTracking).not.toHaveBeenCalled();
		expect(plugin.stopTimeTracking).not.toHaveBeenCalled();
	});

	it("does not restart tracking when the linked update arrives", async () => {
		const { plugin, listener } = createHarness();
		const timeEntries = [{ startTime: "2026-07-29T10:00:00+08:00" }];
		const originalTask = createTask({ status: "in-progress", timeEntries });
		const updatedTask = createTask({ status: "in-progress", timeEntries });

		await listener({ originalTask, updatedTask });

		expect(plugin.startTimeTracking).not.toHaveBeenCalled();
		expect(plugin.updateTaskProperty).not.toHaveBeenCalled();
	});

	it("lets the linked status listener exclusively stop an in-progress task on completion", async () => {
		const { plugin, listeners } = createHarness({ autoStopOnComplete: true });
		const timeEntries = [{ startTime: "2026-07-29T10:00:00+08:00" }];
		const originalTask = createTask({ status: "in-progress", timeEntries });
		const updatedTask = createTask({ status: "done", timeEntries });

		await listeners[0]({ originalTask, updatedTask });
		await listeners[1]({ originalTask, updatedTask });

		expect(plugin.stopTimeTracking).toHaveBeenCalledTimes(1);
	});

	it("reconciles an existing active timer whose task is no longer in progress", async () => {
		const activeEntry = { startTime: "2026-07-29T10:00:00+08:00" };
		const inconsistentTask = createTask({ status: "open", timeEntries: [activeEntry] });
		const validTask = createTask({
			path: "Tasks/valid.md",
			status: "in-progress",
			timeEntries: [activeEntry],
		});
		const { plugin, reconciliation } = createHarness({
			tasks: [inconsistentTask, validTask],
		});

		await reconciliation;

		expect(plugin.taskService.stopTimeTracking).toHaveBeenCalledTimes(1);
		expect(plugin.taskService.stopTimeTracking).toHaveBeenCalledWith(inconsistentTask);
	});
});
