import type { EventRef } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { TaskInfo } from "../types";
import { EVENT_TASK_UPDATED } from "../types";
import type { TaskNotesSettings } from "../types/settings";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { publishUserNotice } from "../core/userNotices";

const tasknotesLogger = createTaskNotesLogger({ tag: "Services/SettingsLifecycleService" });

interface TaskUpdateEventData {
	path?: string;
	originalTask?: TaskInfo;
	updatedTask?: TaskInfo;
}

interface CacheSettingsSnapshot {
	taskTag: string;
	excludedFolders: string;
	disableNoteIndexing: boolean;
	storeTitleInFilename: boolean;
	fieldMapping: TaskNotesSettings["fieldMapping"];
}

interface TimeTrackingSettingsSnapshot {
	autoStopTimeTrackingOnComplete: boolean;
}

export type StatusTimeTrackingAction = "start" | "stop" | null;

export function planStatusTimeTrackingAction(input: {
	wasInProgress: boolean;
	isInProgress: boolean;
	isTracking: boolean;
}): StatusTimeTrackingAction {
	if (!input.wasInProgress && input.isInProgress && !input.isTracking) {
		return "start";
	}
	if (input.wasInProgress && !input.isInProgress && input.isTracking) {
		return "stop";
	}
	return null;
}

export class SettingsLifecycleService {
	private previousCacheSettings: CacheSettingsSnapshot | null = null;
	private previousTimeTrackingSettings: TimeTrackingSettingsSnapshot | null = null;
	private autoStopTimeTrackingListener: unknown = null;
	private statusTimeTrackingListener: unknown = null;
	private statusTimeTrackingReconciliation: Promise<void> | null = null;
	private saveSettingsPromise: Promise<void> | null = null;
	private saveSettingsRequested = false;

	constructor(private plugin: TaskNotesPlugin) {}

	captureCurrentSettings(): void {
		this.updatePreviousCacheSettings();
		this.updatePreviousTimeTrackingSettings();
	}

	setupTimeTrackingEventListeners(): void {
		if (this.autoStopTimeTrackingListener) {
			this.plugin.emitter.offref(this.autoStopTimeTrackingListener as EventRef);
			this.autoStopTimeTrackingListener = null;
		}

		if (this.statusTimeTrackingListener) {
			this.plugin.emitter.offref(this.statusTimeTrackingListener as EventRef);
			this.statusTimeTrackingListener = null;
		}

		this.statusTimeTrackingListener = this.plugin.emitter.on(
			EVENT_TASK_UPDATED,
			async (data: TaskUpdateEventData) => {
				await this.handleStatusTimeTrackingLink(data);
			}
		);

		if (this.plugin.settings.autoStopTimeTrackingOnComplete) {
			this.autoStopTimeTrackingListener = this.plugin.emitter.on(
				EVENT_TASK_UPDATED,
				async (data: TaskUpdateEventData) => {
					await this.handleAutoStopTimeTracking(data);
				}
			);
		}

		if (!this.statusTimeTrackingReconciliation) {
			this.statusTimeTrackingReconciliation = this.reconcileStatusTimeTrackingState().finally(
				() => {
					this.statusTimeTrackingReconciliation = null;
				}
			);
		}

		this.updatePreviousTimeTrackingSettings();
	}

	async saveSettings(): Promise<void> {
		this.saveSettingsRequested = true;
		if (!this.saveSettingsPromise) {
			this.saveSettingsPromise = this.drainSettingsSaves();
		}

		await this.saveSettingsPromise;
	}

	private async drainSettingsSaves(): Promise<void> {
		try {
			while (this.saveSettingsRequested) {
				this.saveSettingsRequested = false;
				await this.plugin.saveSettingsDataOnly();

				if (this.saveSettingsRequested) {
					continue;
				}

				this.applySettingsSideEffects();
			}
		} finally {
			this.saveSettingsPromise = null;
			if (this.saveSettingsRequested) {
				await this.saveSettings();
			}
		}
	}

	private applySettingsSideEffects(): void {
		this.plugin.apiService?.syncWebhookSettings?.();

		const cacheSettingsChanged = this.haveCacheSettingsChanged();
		const timeTrackingSettingsChanged = this.haveTimeTrackingSettingsChanged();

		this.plugin.fieldMapper?.updateMapping(this.plugin.settings.fieldMapping);
		this.plugin.fieldMapper?.updateUserFields(this.plugin.settings.userFields ?? []);
		this.plugin.fieldMapper?.updateConfiguredValues(
			this.plugin.settings.customStatuses,
			this.plugin.settings.customPriorities
		);
		this.plugin.statusManager?.updateStatuses(this.plugin.settings.customStatuses);
		this.plugin.priorityManager?.updatePriorities(this.plugin.settings.customPriorities);

		if (cacheSettingsChanged) {
			tasknotesLogger.debug("Cache-related settings changed, updating cache configuration", {
				category: "configuration",
				operation: "cache-related-settings-changed-updating-cache-configuration",
			});
			this.plugin.cacheManager.updateConfig(this.plugin.settings);
			this.plugin.dependencyCache?.updateConfig(this.plugin.settings);
			this.updatePreviousCacheSettings();
		}

		this.plugin.injectCustomStyles();

		if (timeTrackingSettingsChanged) {
			this.setupTimeTrackingEventListeners();
		}

		this.plugin.statusBarService?.updateVisibility();
		void this.plugin.mdbaseSpecService?.onSettingsChanged();
		this.plugin.filterService?.refreshFilterOptions();
		this.plugin.notifyDataChanged();
		this.plugin.emitter.trigger("settings-changed", this.plugin.settings);
	}

	async onExternalSettingsChange(): Promise<void> {
		await this.plugin.loadSettings();
		this.plugin.apiService?.syncWebhookSettings?.();

		this.plugin.fieldMapper?.updateMapping(this.plugin.settings.fieldMapping);
		this.plugin.fieldMapper?.updateUserFields(this.plugin.settings.userFields ?? []);
		this.plugin.fieldMapper?.updateConfiguredValues(
			this.plugin.settings.customStatuses,
			this.plugin.settings.customPriorities
		);
		this.plugin.statusManager?.updateStatuses(this.plugin.settings.customStatuses);
		this.plugin.priorityManager?.updatePriorities(this.plugin.settings.customPriorities);

		this.plugin.cacheManager.updateConfig(this.plugin.settings);
		this.plugin.dependencyCache?.updateConfig(this.plugin.settings);
		this.updatePreviousCacheSettings();
		this.setupTimeTrackingEventListeners();

		this.plugin.injectCustomStyles();
		this.plugin.statusBarService?.updateVisibility();
		this.plugin.filterService?.refreshFilterOptions();

		this.plugin.notifyDataChanged();
		this.plugin.emitter.trigger("settings-changed", this.plugin.settings);
	}

	destroy(): void {
		if (this.autoStopTimeTrackingListener) {
			this.plugin.emitter.offref(this.autoStopTimeTrackingListener as EventRef);
			this.autoStopTimeTrackingListener = null;
		}
		if (this.statusTimeTrackingListener) {
			this.plugin.emitter.offref(this.statusTimeTrackingListener as EventRef);
			this.statusTimeTrackingListener = null;
		}
	}

	private async handleStatusTimeTrackingLink(data: TaskUpdateEventData): Promise<void> {
		const { originalTask, updatedTask } = data;
		if (!originalTask || !updatedTask) {
			return;
		}

		const inProgressStatus = this.plugin.statusManager
			.getAllStatuses()
			.find((status) => status.id === "in-progress");
		if (!inProgressStatus) {
			return;
		}

		const normalizeStatus = (status: string) =>
			this.plugin.statusManager.normalizeStatusValue(status);
		const inProgressValue = normalizeStatus(inProgressStatus.value);
		const wasInProgress = normalizeStatus(originalTask.status) === inProgressValue;
		const isInProgress = normalizeStatus(updatedTask.status) === inProgressValue;
		const isTracking = this.plugin.getActiveTimeSession(updatedTask) !== null;
		const action = planStatusTimeTrackingAction({
			wasInProgress,
			isInProgress,
			isTracking,
		});

		try {
			if (action === "start") {
				await this.plugin.startTimeTracking(updatedTask);
			} else if (action === "stop") {
				await this.plugin.stopTimeTracking(updatedTask);
			}
		} catch (error) {
			tasknotesLogger.error("Error linking task status and time tracking:", {
				category: "configuration",
				operation: "linking-task-status-time-tracking",
				error,
			});
		}
	}

	private async reconcileStatusTimeTrackingState(): Promise<void> {
		const inProgressStatus = this.plugin.statusManager
			.getAllStatuses()
			.find((status) => status.id === "in-progress");
		if (!inProgressStatus) {
			return;
		}

		try {
			const normalizeStatus = (status: string) =>
				this.plugin.statusManager.normalizeStatusValue(status);
			const inProgressValue = normalizeStatus(inProgressStatus.value);
			const tasks = await this.plugin.cacheManager.getAllTasks();
			const inconsistentTasks = tasks.filter(
				(task) =>
					normalizeStatus(task.status) !== inProgressValue &&
					this.plugin.getActiveTimeSession(task) !== null
			);

			for (const task of inconsistentTasks) {
				try {
					await this.plugin.taskService.stopTimeTracking(task);
				} catch (error) {
					tasknotesLogger.error("Error reconciling task status and time tracking:", {
						category: "persistence",
						operation: "reconciling-status-time-tracking-task",
						details: { taskPath: task.path },
						error,
					});
				}
			}
		} catch (error) {
			tasknotesLogger.error(
				"Error loading tasks for status and time tracking reconciliation:",
				{
					category: "stale-data",
					operation: "loading-status-time-tracking-reconciliation",
					error,
				}
			);
		}
	}

	private async handleAutoStopTimeTracking(data: TaskUpdateEventData): Promise<void> {
		const { originalTask, updatedTask } = data;
		if (!originalTask || !updatedTask) {
			return;
		}

		const inProgressStatus = this.plugin.statusManager
			.getAllStatuses()
			.find((status) => status.id === "in-progress");
		if (inProgressStatus) {
			const normalizeStatus = (status: string) =>
				this.plugin.statusManager.normalizeStatusValue(status);
			const inProgressValue = normalizeStatus(inProgressStatus.value);
			if (
				normalizeStatus(originalTask.status) === inProgressValue &&
				normalizeStatus(updatedTask.status) !== inProgressValue
			) {
				// The linked status listener owns this transition, avoiding two concurrent stop calls.
				return;
			}
		}

		let wasJustCompleted = false;
		const wasCompleted = this.plugin.statusManager.isCompletedStatus(originalTask.status);
		const isNowCompleted = this.plugin.statusManager.isCompletedStatus(updatedTask.status);
		if (!wasCompleted && isNowCompleted) {
			wasJustCompleted = true;
		}

		if (updatedTask.recurrence) {
			const originalInstances = originalTask.complete_instances || [];
			const updatedInstances = updatedTask.complete_instances || [];
			if (updatedInstances.length > originalInstances.length) {
				wasJustCompleted = true;
			}
		}

		if (!wasJustCompleted) {
			return;
		}

		const activeSession = this.plugin.getActiveTimeSession(updatedTask);
		if (!activeSession) {
			return;
		}

		try {
			await this.plugin.stopTimeTracking(updatedTask);
			if (this.plugin.settings.autoStopTimeTrackingNotification) {
				publishUserNotice(
					this.plugin.emitter,
					`Auto-stopped time tracking for: ${updatedTask.title}`
				);
			}
		} catch (error) {
			tasknotesLogger.error("Error auto-stopping time tracking:", {
				category: "configuration",
				operation: "auto-stopping-time-tracking",
				error: error,
			});
		}
	}

	private haveCacheSettingsChanged(): boolean {
		if (!this.previousCacheSettings) {
			return true;
		}

		const current: CacheSettingsSnapshot = {
			taskTag: this.plugin.settings.taskTag,
			excludedFolders: this.plugin.settings.excludedFolders,
			disableNoteIndexing: this.plugin.settings.disableNoteIndexing,
			storeTitleInFilename: this.plugin.settings.storeTitleInFilename,
			fieldMapping: this.plugin.settings.fieldMapping,
		};

		return (
			current.taskTag !== this.previousCacheSettings.taskTag ||
			current.excludedFolders !== this.previousCacheSettings.excludedFolders ||
			current.disableNoteIndexing !== this.previousCacheSettings.disableNoteIndexing ||
			current.storeTitleInFilename !== this.previousCacheSettings.storeTitleInFilename ||
			JSON.stringify(current.fieldMapping) !==
				JSON.stringify(this.previousCacheSettings.fieldMapping)
		);
	}

	private haveTimeTrackingSettingsChanged(): boolean {
		if (!this.previousTimeTrackingSettings) {
			return true;
		}

		return (
			this.plugin.settings.autoStopTimeTrackingOnComplete !==
			this.previousTimeTrackingSettings.autoStopTimeTrackingOnComplete
		);
	}

	private updatePreviousCacheSettings(): void {
		this.previousCacheSettings = {
			taskTag: this.plugin.settings.taskTag,
			excludedFolders: this.plugin.settings.excludedFolders,
			disableNoteIndexing: this.plugin.settings.disableNoteIndexing,
			storeTitleInFilename: this.plugin.settings.storeTitleInFilename,
			fieldMapping: JSON.parse(JSON.stringify(this.plugin.settings.fieldMapping)),
		};
	}

	private updatePreviousTimeTrackingSettings(): void {
		this.previousTimeTrackingSettings = {
			autoStopTimeTrackingOnComplete: this.plugin.settings.autoStopTimeTrackingOnComplete,
		};
	}
}
