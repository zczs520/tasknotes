import { TaskActionCoordinator } from "../../../src/ui/TaskActionCoordinator";
import type { TaskInfo } from "../../../src/types";

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Task",
		status: "in-progress",
		priority: "normal",
		path: "Tasks/task.md",
		archived: false,
		timeEntries: [{ startTime: "2026-07-31T10:00:00+08:00" }],
		...overrides,
	};
}

describe("TaskActionCoordinator task lifecycle", () => {
	it("starts tracking before moving a task to in-progress", async () => {
		const task = createTask({ status: "open", timeEntries: [] });
		const trackedTask = {
			...task,
			timeEntries: [{ startTime: "2026-07-31T10:00:00+08:00" }],
		};
		const activeTask = { ...trackedTask, status: "in-progress" };
		const plugin = {
			taskService: {
				startTimeTracking: jest.fn(async () => trackedTask),
			},
			statusManager: {
				getAllStatuses: jest.fn(() => [
					{ id: "open", value: "open" },
					{ id: "in-progress", value: "in-progress" },
				]),
				normalizeStatusValue: jest.fn((value: string) => value.trim().toLowerCase()),
			},
			updateTaskProperty: jest.fn(async () => activeTask),
			i18n: {
				translate: jest.fn((key: string) => key),
			},
			statusBarService: {
				requestUpdate: jest.fn(),
			},
		};
		const coordinator = new TaskActionCoordinator(plugin as never);

		const result = await coordinator.startTask(task);

		expect(plugin.taskService.startTimeTracking).toHaveBeenCalledWith(task);
		expect(plugin.updateTaskProperty).toHaveBeenCalledWith(
			trackedTask,
			"status",
			"in-progress",
			{ silent: true }
		);
		expect(plugin.taskService.startTimeTracking.mock.invocationCallOrder[0]).toBeLessThan(
			plugin.updateTaskProperty.mock.invocationCallOrder[0]
		);
		expect(result).toBe(activeTask);
	});

	it("stops time tracking before completing a normal task", async () => {
		const task = createTask();
		const stoppedTask = {
			...task,
			timeEntries: task.timeEntries?.map((entry) => ({
				...entry,
				endTime: "2026-07-31T10:30:00+08:00",
			})),
		};
		const completedTask = { ...stoppedTask, status: "done" };
		const plugin = {
			getActiveTimeSession: jest.fn(() => task.timeEntries?.[0] ?? null),
			taskService: {
				stopTimeTracking: jest.fn(async () => stoppedTask),
			},
			statusManager: {
				getAllStatuses: jest.fn(() => [
					{
						id: "done",
						value: "done",
						isCompleted: true,
						isSkipped: false,
						order: 1,
					},
				]),
			},
			updateTaskProperty: jest.fn(async () => completedTask),
			i18n: {
				translate: jest.fn((key: string) => key),
			},
			statusBarService: {
				requestUpdate: jest.fn(),
			},
		};
		const coordinator = new TaskActionCoordinator(plugin as never);

		const result = await coordinator.endTask(task);

		expect(plugin.taskService.stopTimeTracking).toHaveBeenCalledWith(task);
		expect(plugin.updateTaskProperty).toHaveBeenCalledWith(
			stoppedTask,
			"status",
			"done",
			{ silent: true }
		);
		expect(plugin.taskService.stopTimeTracking.mock.invocationCallOrder[0]).toBeLessThan(
			plugin.updateTaskProperty.mock.invocationCallOrder[0]
		);
		expect(result).toBe(completedTask);
	});
});
