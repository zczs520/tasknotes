import { StatusBarService } from "../../../src/ui/StatusBarService";
import type { TaskInfo } from "../../../src/types";

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Active task",
		status: "in-progress",
		priority: "normal",
		path: "Tasks/active-task.md",
		archived: false,
		timeEntries: [{ startTime: "2026-07-29T10:00:00.000Z" }],
		...overrides,
	};
}

function createHarness(initialTasks: TaskInfo[]) {
	let tasks = initialTasks;
	const workspaceContainer = document.createElement("div");
	document.body.appendChild(workspaceContainer);
	const plugin = {
		settings: {
			showTrackedTasksInStatusBar: false,
			showPomodoroInStatusBar: false,
		},
		addStatusBarItem: jest.fn(),
		saveSettingsDataOnly: jest.fn(async () => undefined),
		cacheManager: {
			getAllTasks: jest.fn(async () => tasks),
		},
		getActiveTimeSession: jest.fn((task: TaskInfo) =>
			(task.timeEntries ?? []).find((entry) => !entry.endTime) ?? null
		),
		stopTimeTracking: jest.fn(async (task: TaskInfo) => ({
			...task,
			timeEntries: (task.timeEntries ?? []).map((entry) => ({
				...entry,
				endTime: entry.endTime ?? "2026-07-29T10:02:05.000Z",
			})),
		})),
		updateTaskProperty: jest.fn(async (task: TaskInfo) => ({ ...task, status: "done" })),
		endTask: jest.fn(async (task: TaskInfo) => ({
			...task,
			status: "done",
			timeEntries: (task.timeEntries ?? []).map((entry) => ({
				...entry,
				endTime: entry.endTime ?? "2026-07-29T10:02:05.000Z",
			})),
		})),
		stopTask: jest.fn(async (task: TaskInfo) => ({
			...task,
			status: "open",
			timeEntries: (task.timeEntries ?? []).map((entry) => ({
				...entry,
				endTime: entry.endTime ?? "2026-07-29T10:02:05.000Z",
			})),
		})),
		toggleRecurringTaskComplete: jest.fn(async (task: TaskInfo) => task),
		statusManager: {
			getAllStatuses: jest.fn(() => [
				{
					id: "done",
					value: "done",
					label: "Done",
					color: "green",
					isCompleted: true,
					order: 2,
					autoArchive: false,
					autoArchiveDelay: 0,
				},
			]),
		},
		i18n: {
			translate: jest.fn((key: string, params?: Record<string, string | number>) => {
				const translations: Record<string, string> = {
					"ui.activeTaskControl.regionLabel": "进行中的任务",
					"ui.activeTaskControl.multipleLabel": "{count} 个任务进行中",
					"ui.activeTaskControl.openTask": "打开任务：{title}",
					"ui.activeTaskControl.endTask": "完成任务：{title}",
					"ui.activeTaskControl.endAction": "完成",
					"ui.activeTaskControl.stopTask": "停止任务：{title}",
					"ui.activeTaskControl.stopAction": "停止",
				};
				return Object.entries(params ?? {}).reduce(
					(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
					translations[key] ?? key
				);
			}),
		},
		emitter: {
			on: jest.fn(() => ({})),
			offref: jest.fn(),
		},
		app: {
			vault: {
				getAbstractFileByPath: jest.fn(() => null),
			},
			workspace: {
				containerEl: workspaceContainer,
				getLeaf: jest.fn(),
			},
		},
	};
	return {
		plugin,
		workspaceContainer,
		setTasks(nextTasks: TaskInfo[]) {
			tasks = nextTasks;
		},
	};
}

describe("active task floating control", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-07-29T10:02:05.000Z"));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("shows the active task and updates elapsed time without the bottom status bar", async () => {
		const task = createTask();
		const { plugin } = createHarness([task]);
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await (service as unknown as { updateStatusBar: () => Promise<void> }).updateStatusBar();

		const control = document.body.querySelector<HTMLElement>(
			".tasknotes-active-task-control"
		);
		expect(control?.hidden).toBe(false);
		expect(control?.querySelector(".tasknotes-active-task-control__title")?.textContent).toBe(
			"Active task"
		);
		expect(control?.querySelector(".tasknotes-active-task-control__elapsed")?.textContent).toBe(
			"2:05"
		);
		expect(control?.querySelector(".tasknotes-active-task-control__stop")?.textContent).toBe(
			"停止"
		);
		expect(
			control?.querySelector(".tasknotes-active-task-control__complete")?.textContent
		).toBe(
			"完成"
		);
		expect(plugin.addStatusBarItem).not.toHaveBeenCalled();

		jest.advanceTimersByTime(1000);
		expect(control?.querySelector(".tasknotes-active-task-control__elapsed")?.textContent).toBe(
			"2:06"
		);
		expect(plugin.cacheManager.getAllTasks).toHaveBeenCalledTimes(1);

		service.destroy();
		expect(document.body.querySelector(".tasknotes-active-task-control")).toBeNull();
	});

	it("mounts outside the workspace so an open creation modal cannot cover it", async () => {
		const task = createTask();
		const { plugin, workspaceContainer } = createHarness([task]);
		const modalContainer = document.createElement("div");
		modalContainer.className = "modal-container";
		document.body.appendChild(modalContainer);
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await (service as unknown as { updateStatusBar: () => Promise<void> }).updateStatusBar();

		const control = document.body.querySelector<HTMLElement>(
			".tasknotes-active-task-control"
		);
		expect(control?.parentElement).toBe(document.body);
		expect(workspaceContainer.contains(control)).toBe(false);
		expect(control?.hidden).toBe(false);

		service.destroy();
	});

	it("stops tracking before marking the task completed", async () => {
		const task = createTask();
		const { plugin } = createHarness([task]);
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await (service as unknown as { updateStatusBar: () => Promise<void> }).updateStatusBar();
		const endButton = document.body.querySelector<HTMLButtonElement>(
			".tasknotes-active-task-control__complete"
		);
		expect(endButton).not.toBeNull();

		await (
			service as unknown as {
				endTrackedTask: (task: TaskInfo, button: HTMLButtonElement) => Promise<void>;
			}
		).endTrackedTask(task, endButton!);

		expect(plugin.endTask).toHaveBeenCalledWith(task);
		expect(
			document.body.querySelector<HTMLElement>(".tasknotes-active-task-control")?.hidden
		).toBe(true);

		service.destroy();
	});

	it("stops tracking and returns the task to pending without completing it", async () => {
		const task = createTask();
		const { plugin } = createHarness([task]);
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await (service as unknown as { updateStatusBar: () => Promise<void> }).updateStatusBar();
		const stopButton = document.body.querySelector<HTMLButtonElement>(
			".tasknotes-active-task-control__stop"
		);

		await (
			service as unknown as {
				stopTrackedTask: (task: TaskInfo, button: HTMLButtonElement) => Promise<void>;
			}
		).stopTrackedTask(task, stopButton!);

		expect(plugin.stopTask).toHaveBeenCalledWith(task);
		expect(plugin.endTask).not.toHaveBeenCalled();
		expect(
			document.body.querySelector<HTMLElement>(".tasknotes-active-task-control")?.hidden
		).toBe(true);

		service.destroy();
	});

	it("drags the floating control and saves its position", async () => {
		const task = createTask();
		const { plugin } = createHarness([task]);
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await (service as unknown as { updateStatusBar: () => Promise<void> }).updateStatusBar();
		const control = document.body.querySelector<HTMLElement>(
			".tasknotes-active-task-control"
		)!;
		const openButton = control.querySelector<HTMLElement>(
			".tasknotes-active-task-control__open"
		)!;
		document.body.getBoundingClientRect = () =>
			({ left: 0, top: 0, width: 1000, height: 700 } as DOMRect);
		Object.defineProperty(control, "offsetWidth", { value: 300 });
		Object.defineProperty(control, "offsetHeight", { value: 50 });
		control.getBoundingClientRect = () => {
			const left = Number.parseInt(control.style.left || "700", 10);
			const top = Number.parseInt(control.style.top || "30", 10);
			return { left, top, width: 300, height: 50 } as DOMRect;
		};
		const drag = service as unknown as {
			handleActiveTaskPointerDown: (event: PointerEvent) => void;
			handleActiveTaskPointerMove: (event: PointerEvent) => void;
			handleActiveTaskPointerUp: (event: PointerEvent) => void;
		};
		drag.handleActiveTaskPointerDown({
			button: 0,
			pointerId: 1,
			clientX: 720,
			clientY: 50,
			target: openButton,
		} as PointerEvent);
		drag.handleActiveTaskPointerMove({
			pointerId: 1,
			clientX: 420,
			clientY: 300,
			preventDefault: jest.fn(),
		} as unknown as PointerEvent);
		drag.handleActiveTaskPointerUp({ pointerId: 1 } as PointerEvent);

		expect(control.style.left).toBe("400px");
		expect(control.style.top).toBe("280px");
		expect(plugin.settings.activeTaskControlPosition).toEqual({ x: 400, y: 280 });
		expect(plugin.saveSettingsDataOnly).toHaveBeenCalledTimes(1);

		service.destroy();
	});

	it("shows a newly restarted task instead of reusing the previous empty result", async () => {
		const task = createTask();
		const { plugin, setTasks } = createHarness([]);
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await (service as unknown as { updateStatusBar: () => Promise<void> }).updateStatusBar();
		jest.advanceTimersByTime(0);

		setTasks([task]);
		await (service as unknown as { updateStatusBar: () => Promise<void> }).updateStatusBar();

		const control = document.body.querySelector<HTMLElement>(
			".tasknotes-active-task-control"
		);
		expect(control?.hidden).toBe(false);
		expect(control?.querySelector(".tasknotes-active-task-control__title")?.textContent).toBe(
			task.title
		);
		expect(plugin.cacheManager.getAllTasks).toHaveBeenCalledTimes(2);

		service.destroy();
	});
});
