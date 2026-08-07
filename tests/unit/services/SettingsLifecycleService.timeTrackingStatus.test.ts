import { jest } from "@jest/globals";
import { SettingsLifecycleService } from "../../../src/services/SettingsLifecycleService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { EVENT_TASK_DELETED, EVENT_TASK_UPDATED, type TaskInfo } from "../../../src/types";

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
	const listeners = new Map<string, Array<(data: any) => void | Promise<void>>>();
	const tasksByPath = new Map((options.tasks ?? []).map((task) => [task.path, task]));
	const stopPersistedTracking = jest.fn(async (task: TaskInfo) => task);
	const plugin = {
		settings: {
			...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
			autoStopTimeTrackingOnComplete: options.autoStopOnComplete ?? false,
		},
		emitter: {
			on: jest.fn((event: string, listener: (data: any) => void | Promise<void>) => {
				const eventListeners = listeners.get(event) ?? [];
				eventListeners.push(listener);
				listeners.set(event, eventListeners);
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
		startTimeTracking: jest.fn(async (task: TaskInfo) => {
			const updatedTask = {
				...task,
				timeEntries: [
					...(task.timeEntries ?? []),
					{ startTime: "2026-07-29T10:00:00+08:00" },
				],
			};
			tasksByPath.set(task.path, updatedTask);
			return updatedTask;
		}),
		stopTimeTracking: jest.fn(async (task: TaskInfo) => {
			const updatedTask = {
				...task,
				timeEntries: (task.timeEntries ?? []).map((entry) => ({
					...entry,
					endTime: entry.endTime ?? "2026-07-29T10:05:00+08:00",
				})),
			};
			tasksByPath.set(task.path, updatedTask);
			return updatedTask;
		}),
		updateTaskProperty: jest.fn(async (task: TaskInfo) => task),
		cacheManager: {
			getAllTasks: jest.fn(async () => Array.from(tasksByPath.values())),
			getTaskInfo: jest.fn(async (path: string) => tasksByPath.get(path) ?? null),
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
	return {
		plugin,
		service,
		listeners,
		listener: listeners.get(EVENT_TASK_UPDATED)![0],
		autoStopListener: listeners.get(EVENT_TASK_UPDATED)?.[1],
		deletedListener: listeners.get(EVENT_TASK_DELETED)![0],
		reconciliation,
		setTask(task: TaskInfo) {
			tasksByPath.set(task.path, task);
		},
	};
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

	it("starts tracking when a task is created in the in-progress status", async () => {
		const { plugin, listener } = createHarness();
		const createdTask = createTask({ status: "in-progress" });

		await listener({ created: true, updatedTask: createdTask });

		expect(plugin.startTimeTracking).toHaveBeenCalledWith(createdTask);
	});

	it("honors an explicit creation event even if startup snapshotting saw the task first", async () => {
		const createdTask = createTask({ status: "in-progress" });
		const { plugin, listener, reconciliation } = createHarness({ tasks: [createdTask] });
		await reconciliation;

		await listener({ created: true, updatedTask: createdTask });

		expect(plugin.startTimeTracking).toHaveBeenCalledWith(createdTask);
	});

	it("does not start tracking when a task is created outside the in-progress status", async () => {
		const { plugin, listener } = createHarness();
		const createdTask = createTask({ status: "open" });

		await listener({ created: true, updatedTask: createdTask });

		expect(plugin.startTimeTracking).not.toHaveBeenCalled();
	});

	it("starts tracking for a task created through a metadata-cache-only path", async () => {
		const { plugin, listener, reconciliation, setTask } = createHarness();
		await reconciliation;
		const createdTask = createTask({ status: "in-progress" });
		setTask(createdTask);

		await listener({ task: createdTask, taskInfo: createdTask, updatedTask: createdTask });

		expect(plugin.startTimeTracking).toHaveBeenCalledWith(createdTask);
	});

	it("starts only once when metadata and explicit creation events race", async () => {
		const { plugin, listener, reconciliation, setTask } = createHarness();
		await reconciliation;
		const createdTask = createTask({ status: "in-progress" });
		setTask(createdTask);

		const metadataEvent = listener({
			task: createdTask,
			taskInfo: createdTask,
			updatedTask: createdTask,
		});
		const explicitCreationEvent = listener({ created: true, updatedTask: createdTask });
		await Promise.all([metadataEvent, explicitCreationEvent]);

		expect(plugin.startTimeTracking).toHaveBeenCalledTimes(1);
	});

	it("detects a metadata-cache-only transition into in-progress", async () => {
		const originalTask = createTask({ status: "open" });
		const { plugin, listener, reconciliation, setTask } = createHarness({
			tasks: [originalTask],
		});
		await reconciliation;
		const updatedTask = createTask({ status: "in-progress" });
		setTask(updatedTask);

		await listener({ task: updatedTask, taskInfo: updatedTask, updatedTask });

		expect(plugin.startTimeTracking).toHaveBeenCalledWith(updatedTask);
	});

	it("does not start twice when metadata and service events report the same transition", async () => {
		const originalTask = createTask({ status: "open" });
		const { plugin, listener, reconciliation, setTask } = createHarness({
			tasks: [originalTask],
		});
		await reconciliation;
		const updatedTask = createTask({ status: "in-progress" });
		setTask(updatedTask);

		await listener({ task: updatedTask, taskInfo: updatedTask, updatedTask });
		await listener({ originalTask, updatedTask });

		expect(plugin.startTimeTracking).toHaveBeenCalledTimes(1);
	});

	it("skips an obsolete start when a task is moved into and immediately out of progress", async () => {
		const originalTask = createTask({ status: "open" });
		const { plugin, listener, reconciliation, setTask } = createHarness({
			tasks: [originalTask],
		});
		await reconciliation;
		const inProgressTask = createTask({ status: "in-progress" });
		setTask(inProgressTask);
		const enterEvent = listener({
			task: inProgressTask,
			taskInfo: inProgressTask,
			updatedTask: inProgressTask,
		});

		const reopenedTask = createTask({ status: "open" });
		setTask(reopenedTask);
		const leaveEvent = listener({
			task: reopenedTask,
			taskInfo: reopenedTask,
			updatedTask: reopenedTask,
		});
		await Promise.all([enterEvent, leaveEvent]);

		expect(plugin.startTimeTracking).not.toHaveBeenCalled();
		expect(plugin.stopTimeTracking).not.toHaveBeenCalled();
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

	it("detects a metadata-cache-only transition out of in-progress", async () => {
		const timeEntries = [{ startTime: "2026-07-29T10:00:00+08:00" }];
		const originalTask = createTask({ status: "in-progress", timeEntries });
		const { plugin, listener, reconciliation, setTask } = createHarness({
			tasks: [originalTask],
		});
		await reconciliation;
		const updatedTask = createTask({ status: "open", timeEntries });
		setTask(updatedTask);

		await listener({ task: updatedTask, taskInfo: updatedTask, updatedTask });

		expect(plugin.stopTimeTracking).toHaveBeenCalledWith(updatedTask);
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
		const { plugin, listener, autoStopListener } = createHarness({ autoStopOnComplete: true });
		const timeEntries = [{ startTime: "2026-07-29T10:00:00+08:00" }];
		const originalTask = createTask({ status: "in-progress", timeEntries });
		const updatedTask = createTask({ status: "done", timeEntries });

		await listener({ originalTask, updatedTask });
		await autoStopListener?.({ originalTask, updatedTask });

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

	it("forgets deleted paths so recreating the same path is treated as a new task", async () => {
		const originalTask = createTask({ status: "open" });
		const { plugin, listener, deletedListener, reconciliation, setTask } = createHarness({
			tasks: [originalTask],
		});
		await reconciliation;
		await deletedListener({ path: originalTask.path });
		const recreatedTask = createTask({ status: "in-progress" });
		setTask(recreatedTask);

		await listener({ task: recreatedTask, taskInfo: recreatedTask, updatedTask: recreatedTask });

		expect(plugin.startTimeTracking).toHaveBeenCalledWith(recreatedTask);
	});
});
