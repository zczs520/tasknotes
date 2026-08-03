import {
	EVENT_POMODORO_COMPLETE,
	EVENT_POMODORO_INTERRUPT,
	EVENT_POMODORO_START,
	EVENT_POMODORO_TICK,
	PomodoroSession,
	PomodoroState,
	TaskInfo,
} from "../types";
import { RequestDeduplicator } from "../utils/RequestDeduplicator";
import { EventRef, setIcon, setTooltip, TFile } from "obsidian";
import { openTaskSelector } from "../modals/TaskSelectorWithCreateModal";
import { formatPomodoroTime } from "../utils/pomodoroTime";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import {
	clampActiveTaskControlPosition,
	type ActiveTaskControlPosition,
} from "./activeTaskControlPosition";

const tasknotesLogger = createTaskNotesLogger({ tag: "Services/StatusBarService" });

interface ActiveTaskDragState {
	pointerId: number;
	startX: number;
	startY: number;
	offsetX: number;
	offsetY: number;
	dragging: boolean;
}

export class StatusBarService {
	private plugin: import("../main").default;
	private statusBarElement: HTMLElement | null = null;
	private pomodoroStatusBarElement: HTMLElement | null = null;
	private activeTaskControlElement: HTMLElement | null = null;
	private requestDeduplicator: RequestDeduplicator;
	private updateTimeout: number | null = null;
	private pomodoroUpdateTimeout: number | null = null;
	private elapsedUpdateInterval: number | null = null;
	private currentTrackedTasks: TaskInfo[] = [];
	private pomodoroEventRefs: EventRef[] = [];
	private activeTaskDragState: ActiveTaskDragState | null = null;
	private activeTaskDragDocument: Document | null = null;
	private activeTaskControlWindow: Window | null = null;
	private suppressActiveTaskClick = false;

	constructor(plugin: import("../main").default) {
		this.plugin = plugin;
		this.requestDeduplicator = new RequestDeduplicator();
	}

	/**
	 * Initialize the status bar service
	 */
	initialize(): void {
		this.ensureTrackedStatusBarElement();
		this.ensurePomodoroStatusBarElement();
		this.ensureActiveTaskControlElement();
		this.registerPomodoroEvents();

		// Initial update
		void this.updateStatusBar();
		this.updatePomodoroStatusBar();
	}

	private ensureTrackedStatusBarElement(): void {
		if (this.statusBarElement || !this.plugin.settings.showTrackedTasksInStatusBar) {
			return;
		}

		this.statusBarElement = this.plugin.addStatusBarItem();
		this.statusBarElement.addClass("tasknotes-status-bar");
		this.statusBarElement.classList.remove(
			"tn-static-cursor-grab-dad79857",
			"tn-static-cursor-pointer-2723efcc"
		);
		this.statusBarElement.classList.add("tn-static-cursor-pointer-3b6a3a65");

		// Add click handler to open tasks view filtered to tracked tasks
		this.statusBarElement.addEventListener("click", () => {
			void this.handleStatusBarClick();
		});
	}

	private ensurePomodoroStatusBarElement(): void {
		if (this.pomodoroStatusBarElement || !this.plugin.settings.showPomodoroInStatusBar) {
			return;
		}

		this.pomodoroStatusBarElement = this.plugin.addStatusBarItem();
		this.pomodoroStatusBarElement.addClass("tasknotes-status-bar");
		this.pomodoroStatusBarElement.addClass("tasknotes-pomodoro-status");
		this.pomodoroStatusBarElement.classList.remove(
			"tn-static-cursor-grab-dad79857",
			"tn-static-cursor-pointer-2723efcc"
		);
		this.pomodoroStatusBarElement.classList.add("tn-static-cursor-pointer-3b6a3a65");
		this.pomodoroStatusBarElement.addEventListener("click", () => {
			void this.plugin.activatePomodoroView();
		});
	}

	private ensureActiveTaskControlElement(): void {
		if (this.activeTaskControlElement) {
			return;
		}

		const workspace = this.plugin.app?.workspace as
			| { containerEl?: HTMLElement }
			| undefined;
		const parent = workspace?.containerEl ?? activeDocument.body;
		const doc = parent.ownerDocument;
		const element = doc.createElement("section");
		element.className = "tasknotes-plugin tasknotes-active-task-control";
		element.hidden = true;
		element.tabIndex = 0;
		element.setAttribute(
			"aria-label",
			this.translate("ui.activeTaskControl.regionLabel", "Active tasks")
		);
		element.setAttribute(
			"title",
			this.translate("ui.activeTaskControl.dragHint", "Drag to move")
		);
		parent.appendChild(element);
		this.activeTaskControlElement = element;
		this.setupActiveTaskControlDragging(element);
		this.applyStoredActiveTaskPosition();
	}

	private setupActiveTaskControlDragging(element: HTMLElement): void {
		element.addEventListener("pointerdown", this.handleActiveTaskPointerDown);
		element.addEventListener("click", this.handleActiveTaskClickCapture, true);
		element.addEventListener("keydown", this.handleActiveTaskPositionKeydown);
		this.activeTaskControlWindow = element.ownerDocument.defaultView ?? window;
		this.activeTaskControlWindow.addEventListener("resize", this.handleActiveTaskResize);
	}

	private readonly handleActiveTaskPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0 || !this.activeTaskControlElement) return;
		const target = event.target as Element | null;
		if (target?.closest(".tasknotes-active-task-control__end")) return;

		const rect = this.activeTaskControlElement.getBoundingClientRect();
		this.activeTaskDragState = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top,
			dragging: false,
		};
		this.activeTaskDragDocument = this.activeTaskControlElement.ownerDocument;
		this.activeTaskDragDocument.addEventListener("pointermove", this.handleActiveTaskPointerMove);
		this.activeTaskDragDocument.addEventListener("pointerup", this.handleActiveTaskPointerUp);
		this.activeTaskDragDocument.addEventListener("pointercancel", this.handleActiveTaskPointerUp);
	};

	private readonly handleActiveTaskPointerMove = (event: PointerEvent): void => {
		const state = this.activeTaskDragState;
		const element = this.activeTaskControlElement;
		if (!state || !element || state.pointerId !== event.pointerId) return;

		if (!state.dragging) {
			const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
			if (distance < 4) return;
			state.dragging = true;
			element.addClass("is-dragging");
		}

		event.preventDefault();
		const parent = element.parentElement;
		if (!parent) return;
		const parentRect = parent.getBoundingClientRect();
		const position = clampActiveTaskControlPosition(
			{
				x: event.clientX - parentRect.left - state.offsetX,
				y: event.clientY - parentRect.top - state.offsetY,
			},
			{ width: parentRect.width, height: parentRect.height },
			{ width: element.offsetWidth, height: element.offsetHeight }
		);
		this.setActiveTaskControlPosition(position);
	};

	private readonly handleActiveTaskPointerUp = (event: PointerEvent): void => {
		const state = this.activeTaskDragState;
		if (!state || state.pointerId !== event.pointerId) return;
		if (state.dragging) {
			this.activeTaskControlElement?.removeClass("is-dragging");
			this.suppressActiveTaskClick = true;
			this.persistActiveTaskControlPosition();
			const win = this.activeTaskControlElement?.ownerDocument.defaultView ?? window;
			win.setTimeout(() => (this.suppressActiveTaskClick = false), 0);
		}
		this.cleanupActiveTaskDragListeners();
	};

	private readonly handleActiveTaskClickCapture = (event: MouseEvent): void => {
		if (!this.suppressActiveTaskClick) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.suppressActiveTaskClick = false;
	};

	private readonly handleActiveTaskPositionKeydown = (event: KeyboardEvent): void => {
		if (!this.activeTaskControlElement || !event.key.startsWith("Arrow")) return;
		if ((event.target as Element | null)?.closest("button")) return;
		const current = this.getCurrentActiveTaskControlPosition();
		if (!current) return;
		const step = event.shiftKey ? 40 : 10;
		const next = { ...current };
		if (event.key === "ArrowLeft") next.x -= step;
		else if (event.key === "ArrowRight") next.x += step;
		else if (event.key === "ArrowUp") next.y -= step;
		else if (event.key === "ArrowDown") next.y += step;
		else return;
		event.preventDefault();
		this.setClampedActiveTaskControlPosition(next);
		this.persistActiveTaskControlPosition();
	};

	private readonly handleActiveTaskResize = (): void => this.applyStoredActiveTaskPosition();

	private setClampedActiveTaskControlPosition(position: ActiveTaskControlPosition): void {
		const element = this.activeTaskControlElement;
		const parent = element?.parentElement;
		if (!element || !parent) return;
		const parentRect = parent.getBoundingClientRect();
		this.setActiveTaskControlPosition(
			clampActiveTaskControlPosition(
				position,
				{ width: parentRect.width, height: parentRect.height },
				{ width: element.offsetWidth, height: element.offsetHeight }
			)
		);
	}

	private setActiveTaskControlPosition(position: ActiveTaskControlPosition): void {
		const element = this.activeTaskControlElement;
		if (!element) return;
		element.style.left = `${position.x}px`;
		element.style.top = `${position.y}px`;
		element.setCssProps({ right: "auto" });
	}

	private getCurrentActiveTaskControlPosition(): ActiveTaskControlPosition | null {
		const element = this.activeTaskControlElement;
		const parent = element?.parentElement;
		if (!element || !parent) return null;
		const elementRect = element.getBoundingClientRect();
		const parentRect = parent.getBoundingClientRect();
		return { x: elementRect.left - parentRect.left, y: elementRect.top - parentRect.top };
	}

	private applyStoredActiveTaskPosition(): void {
		const stored = this.plugin.settings.activeTaskControlPosition;
		if (!stored || !Number.isFinite(stored.x) || !Number.isFinite(stored.y)) return;
		this.setClampedActiveTaskControlPosition(stored);
	}

	private persistActiveTaskControlPosition(): void {
		const position = this.getCurrentActiveTaskControlPosition();
		if (!position) return;
		this.plugin.settings.activeTaskControlPosition = {
			x: Math.round(position.x),
			y: Math.round(position.y),
		};
		void this.plugin.saveSettingsDataOnly();
	}

	private cleanupActiveTaskDragListeners(): void {
		this.activeTaskDragDocument?.removeEventListener(
			"pointermove",
			this.handleActiveTaskPointerMove
		);
		this.activeTaskDragDocument?.removeEventListener("pointerup", this.handleActiveTaskPointerUp);
		this.activeTaskDragDocument?.removeEventListener(
			"pointercancel",
			this.handleActiveTaskPointerUp
		);
		this.activeTaskDragDocument = null;
		this.activeTaskDragState = null;
	}

	private registerPomodoroEvents(): void {
		if (this.pomodoroEventRefs.length > 0) {
			return;
		}

		if (!this.plugin.emitter?.on) {
			return;
		}

		const requestUpdate = () => this.requestPomodoroUpdate();
		this.pomodoroEventRefs = [
			this.plugin.emitter.on(EVENT_POMODORO_START, requestUpdate),
			this.plugin.emitter.on(EVENT_POMODORO_TICK, requestUpdate),
			this.plugin.emitter.on(EVENT_POMODORO_COMPLETE, requestUpdate),
			this.plugin.emitter.on(EVENT_POMODORO_INTERRUPT, requestUpdate),
		];
	}

	/**
	 * Update the status bar display
	 */
	private async updateStatusBar(): Promise<void> {
		this.ensureActiveTaskControlElement();
		if (!this.plugin.settings.showTrackedTasksInStatusBar) {
			this.hide();
		}

		try {
			// Use request deduplicator to prevent excessive updates
			const trackedTasks = await this.requestDeduplicator.execute("update-status-bar", () =>
				this.getTrackedTasks(),
				0
			);

			this.renderTrackedTaskSurfaces(trackedTasks);
		} catch (error) {
			tasknotesLogger.error("Error updating status bar:", {
				category: "internal",
				operation: "updating-status-bar",
				error: error,
			});
		}
	}

	private updatePomodoroStatusBar(): void {
		if (!this.plugin.settings.showPomodoroInStatusBar) {
			this.hidePomodoroStatusBar();
			return;
		}

		this.ensurePomodoroStatusBarElement();
		if (!this.pomodoroStatusBarElement || !this.plugin.pomodoroService) {
			return;
		}

		const state = this.plugin.pomodoroService.getState();
		if (!state.currentSession) {
			this.hidePomodoroStatusBar();
			return;
		}

		this.showElement(this.pomodoroStatusBarElement);
		this.renderPomodoroStatusBar(state);
	}

	/**
	 * Get all currently tracked tasks (tasks with active time sessions)
	 */
	private async getTrackedTasks(): Promise<TaskInfo[]> {
		// Force a fresh lookup of all tasks to avoid stale data
		const allTasks = await this.plugin.cacheManager.getAllTasks();

		return allTasks.filter((task) => {
			// Skip archived tasks
			if (task.archived) return false;

			// Check if task has an active time session
			const activeSession = this.plugin.getActiveTimeSession(task);
			return activeSession !== null;
		});
	}

	/**
	 * Render the status bar with tracked tasks information
	 */
	private renderStatusBar(trackedTasks: TaskInfo[]): void {
		if (!this.statusBarElement) return;

		const count = trackedTasks.length;

		if (count === 0) {
			// Hide status bar when no tasks are being tracked
			this.statusBarElement.classList.remove(
				"tn-static-display-block-2a1b75c9",
				"tn-static-display-flex-4d51fc62",
				"tn-static-display-flex-75816cae",
				"tn-static-display-flex-8bb39979",
				"tn-static-display-inline-block-60e32dcb",
				"tn-static-display-inline-cccfa456",
				"tn-static-display-inline-flex-f984c520",
				"tn-static-min-height-800px-997b4c8c"
			);
			this.statusBarElement.classList.add("tn-static-display-none-6b99de8b");
			return;
		}

		// Show status bar
		this.statusBarElement.classList.remove(
			"tn-static-display-block-2a1b75c9",
			"tn-static-display-flex-4d51fc62",
			"tn-static-display-flex-75816cae",
			"tn-static-display-flex-8bb39979",
			"tn-static-display-inline-block-60e32dcb",
			"tn-static-display-inline-cccfa456",
			"tn-static-display-inline-flex-f984c520",
			"tn-static-display-none-6b99de8b",
			"tn-static-min-height-800px-997b4c8c"
		);
		this.statusBarElement.style.removeProperty("display");

		// Clear previous content
		this.statusBarElement.empty();

		// Create icon
		const iconEl = this.statusBarElement.createEl("span", {
			cls: "tasknotes-status-icon",
		});
		setIcon(iconEl, "timer");

		// Create text content
		const textEl = this.statusBarElement.createEl("span", {
			cls: "tasknotes-status-text",
		});

		if (count === 1) {
			const task = trackedTasks[0];
			const truncatedTitle =
				task.title.length > 30 ? task.title.substring(0, 30) + "..." : task.title;
			const elapsed = this.formatElapsedDuration(this.getActiveElapsedMs(task));
			textEl.setText(`Tracking: ${truncatedTitle} (${elapsed})`);

			// Add tooltip with full title
			setTooltip(
				this.statusBarElement,
				`Currently tracking: ${task.title}\nElapsed: ${elapsed}`,
				{
					placement: "top",
				}
			);
		} else {
			const totalElapsed = this.formatElapsedDuration(
				trackedTasks.reduce((sum, task) => sum + this.getActiveElapsedMs(task), 0)
			);
			textEl.setText(`Tracking ${count} tasks (${totalElapsed} total)`);

			// Add tooltip with task titles
			const taskTitles = trackedTasks
				.slice(0, 5) // Show max 5 in tooltip
				.map(
					(task) =>
						`${task.title} - ${this.formatElapsedDuration(this.getActiveElapsedMs(task))}`
				)
				.join("\n");
			const tooltipText = count > 5 ? `${taskTitles}\n... and ${count - 5} more` : taskTitles;
			setTooltip(this.statusBarElement, `Currently tracking:\n${tooltipText}`, {
				placement: "top",
			});
		}
	}

	private renderTrackedTaskSurfaces(trackedTasks: TaskInfo[]): void {
		this.currentTrackedTasks = [...trackedTasks];
		if (trackedTasks.length > 0) {
			this.startElapsedTicker();
		} else {
			this.stopElapsedTicker();
		}

		if (this.plugin.settings.showTrackedTasksInStatusBar) {
			this.renderStatusBar(trackedTasks);
		} else {
			this.hide();
		}
		this.renderActiveTaskControl(trackedTasks);
	}

	private renderActiveTaskControl(trackedTasks: TaskInfo[]): void {
		this.ensureActiveTaskControlElement();
		const container = this.activeTaskControlElement;
		if (!container) {
			return;
		}

		if (trackedTasks.length === 0) {
			container.hidden = true;
			container.replaceChildren();
			return;
		}

		container.hidden = false;
		const rows = Array.from(
			container.querySelectorAll<HTMLElement>(".tasknotes-active-task-control__task")
		);
		const pathsUnchanged =
			rows.length === trackedTasks.length &&
			rows.every((row, index) => row.dataset.taskPath === trackedTasks[index]?.path);
		if (pathsUnchanged) {
			rows.forEach((row, index) => {
				const task = trackedTasks[index];
				const title = row.querySelector<HTMLElement>(
					".tasknotes-active-task-control__title"
				);
				const elapsed = row.querySelector<HTMLElement>(
					".tasknotes-active-task-control__elapsed"
				);
				const openButton = row.querySelector<HTMLElement>(
					".tasknotes-active-task-control__open"
				);
				const endButton = row.querySelector<HTMLElement>(
					".tasknotes-active-task-control__end"
				);
				if (task && title && elapsed) {
					title.textContent = task.title;
					elapsed.textContent = this.formatElapsedDuration(
						this.getActiveElapsedMs(task)
					);
					openButton?.setAttribute(
						"aria-label",
						this.translate(
							"ui.activeTaskControl.openTask",
							`Open task: ${task.title}`,
							{ title: task.title }
						)
					);
					endButton?.setAttribute(
						"aria-label",
						this.translate(
							"ui.activeTaskControl.endTask",
							`End task: ${task.title}`,
							{ title: task.title }
						)
					);
				}
			});
			this.applyStoredActiveTaskPosition();
			return;
		}

		container.replaceChildren();
		if (trackedTasks.length > 1) {
			const summary = activeDocument.createElement("div");
			summary.className = "tasknotes-active-task-control__summary";
			summary.textContent = this.translate(
				"ui.activeTaskControl.multipleLabel",
				`${trackedTasks.length} active tasks`,
				{ count: trackedTasks.length }
			);
			container.appendChild(summary);
		}

		for (const task of trackedTasks) {
			container.appendChild(this.createActiveTaskRow(task));
		}
		this.applyStoredActiveTaskPosition();
	}

	private createActiveTaskRow(task: TaskInfo): HTMLElement {
		const row = activeDocument.createElement("div");
		row.className = "tasknotes-active-task-control__task";
		row.dataset.taskPath = task.path;

		const marker = activeDocument.createElement("span");
		marker.className = "tasknotes-active-task-control__marker";
		marker.setAttribute("aria-hidden", "true");
		row.appendChild(marker);

		const openButton = activeDocument.createElement("button");
		openButton.type = "button";
		openButton.className = "tasknotes-active-task-control__open";
		openButton.setAttribute(
			"aria-label",
			this.translate(
				"ui.activeTaskControl.openTask",
				`Open task: ${task.title}`,
				{ title: task.title }
			)
		);
		openButton.addEventListener("click", () => {
			void this.openTrackedTask(task);
		});

		const title = activeDocument.createElement("span");
		title.className = "tasknotes-active-task-control__title";
		title.textContent = task.title;
		openButton.appendChild(title);

		const elapsed = activeDocument.createElement("span");
		elapsed.className = "tasknotes-active-task-control__elapsed";
		elapsed.textContent = this.formatElapsedDuration(this.getActiveElapsedMs(task));
		openButton.appendChild(elapsed);
		row.appendChild(openButton);

		const endButton = activeDocument.createElement("button");
		endButton.type = "button";
		endButton.className = "tasknotes-active-task-control__end";
		endButton.textContent = this.translate("ui.activeTaskControl.endAction", "End task");
		endButton.setAttribute(
			"aria-label",
			this.translate(
				"ui.activeTaskControl.endTask",
				`End task: ${task.title}`,
				{ title: task.title }
			)
		);
		endButton.addEventListener("click", () => {
			void this.endTrackedTask(task, endButton);
		});
		row.appendChild(endButton);

		return row;
	}

	private async openTrackedTask(task: TaskInfo): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
		if (file instanceof TFile) {
			await this.plugin.app.workspace.getLeaf(false).openFile(file);
		}
	}

	private async endTrackedTask(task: TaskInfo, button: HTMLButtonElement): Promise<void> {
		button.disabled = true;
		button.closest(".tasknotes-active-task-control__task")?.setAttribute("aria-busy", "true");

		try {
			await this.plugin.endTask(task);

			this.renderTrackedTaskSurfaces(
				this.currentTrackedTasks.filter((candidate) => candidate.path !== task.path)
			);
			this.requestUpdate();
		} catch (error) {
			tasknotesLogger.error("Failed to end tracked task:", {
				category: "persistence",
				operation: "end-tracked-task",
				details: { taskPath: task.path },
				error,
			});
			if (button.isConnected) {
				button.disabled = false;
				button
					.closest(".tasknotes-active-task-control__task")
					?.removeAttribute("aria-busy");
			}
		}
	}

	private translate(
		key: string,
		fallback: string,
		params?: Record<string, string | number>
	): string {
		const translated = this.plugin.i18n?.translate?.(key, params);
		return translated && translated !== key ? translated : fallback;
	}

	private renderPomodoroStatusBar(state: PomodoroState): void {
		if (!this.pomodoroStatusBarElement || !state.currentSession) {
			return;
		}

		this.pomodoroStatusBarElement.empty();

		const iconEl = this.pomodoroStatusBarElement.createEl("span", {
			cls: "tasknotes-status-icon",
		});
		setIcon(iconEl, state.currentSession.type === "work" ? "timer" : "coffee");

		const textEl = this.pomodoroStatusBarElement.createEl("span", {
			cls: "tasknotes-status-text",
		});
		const timeRemaining = formatPomodoroTime(state.timeRemaining);
		const sessionLabel = this.getPomodoroSessionLabel(state.currentSession.type);
		const stateLabel = state.isRunning ? sessionLabel : `${sessionLabel} paused`;
		textEl.setText(`${stateLabel}: ${timeRemaining}`);

		setTooltip(
			this.pomodoroStatusBarElement,
			`${stateLabel}\nRemaining: ${timeRemaining}\nClick to open Pomodoro`,
			{
				placement: "top",
			}
		);
	}

	private getPomodoroSessionLabel(type: PomodoroSession["type"]): string {
		if (type === "work") {
			return "Focus";
		}

		if (type === "short-break") {
			return "Short break";
		}

		return "Long break";
	}

	private showElement(element: HTMLElement): void {
		element.classList.remove(
			"tn-static-display-block-2a1b75c9",
			"tn-static-display-flex-4d51fc62",
			"tn-static-display-flex-75816cae",
			"tn-static-display-flex-8bb39979",
			"tn-static-display-inline-block-60e32dcb",
			"tn-static-display-inline-cccfa456",
			"tn-static-display-inline-flex-f984c520",
			"tn-static-display-none-6b99de8b",
			"tn-static-min-height-800px-997b4c8c"
		);
		element.style.removeProperty("display");
	}

	private getActiveElapsedMs(task: TaskInfo): number {
		const activeSession = this.plugin.getActiveTimeSession(task);
		if (!activeSession?.startTime) {
			return 0;
		}

		const startMs = Date.parse(activeSession.startTime);
		if (!Number.isFinite(startMs)) {
			return 0;
		}

		return Math.max(0, Date.now() - startMs);
	}

	private formatElapsedDuration(durationMs: number): string {
		const totalSeconds = Math.floor(durationMs / 1000);
		const seconds = totalSeconds % 60;
		const totalMinutes = Math.floor(totalSeconds / 60);
		const minutes = totalMinutes % 60;
		const hours = Math.floor(totalMinutes / 60);

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
				.toString()
				.padStart(2, "0")}`;
		}

		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	private startElapsedTicker(): void {
		if (this.elapsedUpdateInterval !== null) {
			return;
		}

		this.elapsedUpdateInterval = window.setInterval(() => {
			if (this.currentTrackedTasks.length === 0) {
				this.stopElapsedTicker();
				return;
			}

			this.renderTrackedTaskSurfaces(this.currentTrackedTasks);
		}, 1000);
	}

	private stopElapsedTicker(): void {
		if (this.elapsedUpdateInterval !== null) {
			window.clearInterval(this.elapsedUpdateInterval);
			this.elapsedUpdateInterval = null;
		}
		this.currentTrackedTasks = [];
	}

	/**
	 * Handle click on status bar - open task note(s)
	 */
	private async handleStatusBarClick(): Promise<void> {
		try {
			// Get tracked tasks
			const trackedTasks = await this.getTrackedTasks();

			if (trackedTasks.length === 0) {
				return;
			}

			if (trackedTasks.length === 1) {
				// Single tracked task - open its note directly
				const task = trackedTasks[0];
				const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
				if (file instanceof TFile) {
					await this.plugin.app.workspace.getLeaf(false).openFile(file);
				}
			} else {
				// Multiple tracked tasks - show selector modal
				openTaskSelector(this.plugin, trackedTasks, (selectedTask) => {
					void (async () => {
						if (selectedTask) {
							const file = this.plugin.app.vault.getAbstractFileByPath(
								selectedTask.path
							);
							if (file instanceof TFile) {
								await this.plugin.app.workspace.getLeaf(false).openFile(file);
							}
						}
					})();
				});
			}
		} catch (error) {
			tasknotesLogger.error("Error handling status bar click:", {
				category: "internal",
				operation: "handling-status-bar-click",
				error: error,
			});
		}
	}

	/**
	 * Request an update to the status bar (debounced)
	 */
	requestUpdate(): void {
		// Clear existing timeout
		if (this.updateTimeout) {
			window.clearTimeout(this.updateTimeout);
		}

		// Debounce updates to prevent excessive re-renders
		this.updateTimeout = window.setTimeout(() => {
			void this.updateStatusBar();
		}, 100);
	}

	requestPomodoroUpdate(): void {
		if (this.pomodoroUpdateTimeout) {
			window.clearTimeout(this.pomodoroUpdateTimeout);
		}

		this.pomodoroUpdateTimeout = window.setTimeout(() => {
			this.updatePomodoroStatusBar();
		}, 100);
	}

	/**
	 * Show or hide the status bar based on settings
	 */
	updateVisibility(): void {
		if (this.plugin.settings.showTrackedTasksInStatusBar) {
			this.ensureTrackedStatusBarElement();
		} else {
			this.hide();
		}
		this.ensureActiveTaskControlElement();
		void this.updateStatusBar();

		if (this.plugin.settings.showPomodoroInStatusBar) {
			this.ensurePomodoroStatusBarElement();
			this.updatePomodoroStatusBar();
		} else {
			this.hidePomodoroStatusBar();
		}
	}

	/**
	 * Hide the status bar
	 */
	private hide(): void {
		if (this.statusBarElement) {
			this.statusBarElement.classList.remove(
				"tn-static-display-block-2a1b75c9",
				"tn-static-display-flex-4d51fc62",
				"tn-static-display-flex-75816cae",
				"tn-static-display-flex-8bb39979",
				"tn-static-display-inline-block-60e32dcb",
				"tn-static-display-inline-cccfa456",
				"tn-static-display-inline-flex-f984c520",
				"tn-static-min-height-800px-997b4c8c"
			);
			this.statusBarElement.classList.add("tn-static-display-none-6b99de8b");
		}
	}

	private hidePomodoroStatusBar(): void {
		if (this.pomodoroStatusBarElement) {
			this.pomodoroStatusBarElement.classList.remove(
				"tn-static-display-block-2a1b75c9",
				"tn-static-display-flex-4d51fc62",
				"tn-static-display-flex-75816cae",
				"tn-static-display-flex-8bb39979",
				"tn-static-display-inline-block-60e32dcb",
				"tn-static-display-inline-cccfa456",
				"tn-static-display-inline-flex-f984c520",
				"tn-static-min-height-800px-997b4c8c"
			);
			this.pomodoroStatusBarElement.classList.add("tn-static-display-none-6b99de8b");
		}
	}

	/**
	 * Cleanup when service is destroyed
	 */
	destroy(): void {
		if (this.updateTimeout) {
			window.clearTimeout(this.updateTimeout);
			this.updateTimeout = null;
		}
		if (this.pomodoroUpdateTimeout) {
			window.clearTimeout(this.pomodoroUpdateTimeout);
			this.pomodoroUpdateTimeout = null;
		}
		this.stopElapsedTicker();
		this.cleanupActiveTaskDragListeners();
		this.activeTaskControlWindow?.removeEventListener("resize", this.handleActiveTaskResize);
		this.activeTaskControlWindow = null;
		if (this.plugin.emitter?.offref) {
			this.pomodoroEventRefs.forEach((ref) => this.plugin.emitter.offref(ref));
		}
		this.pomodoroEventRefs = [];

		if (this.requestDeduplicator) {
			this.requestDeduplicator.cancelAll();
		}

		// Status bar element is automatically cleaned up by Obsidian when plugin unloads
		this.activeTaskControlElement?.remove();
		this.activeTaskControlElement = null;
		this.statusBarElement = null;
		this.pomodoroStatusBarElement = null;
	}
}
