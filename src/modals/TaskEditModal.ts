/* eslint-disable @typescript-eslint/no-non-null-assertion -- Modal lifecycle initializes required controls before event handlers run. */
import { App, Notice, setIcon, TFile } from "obsidian";
import TaskNotesPlugin from "../main";
import { TaskModal } from "./TaskModal";
import { TaskDependency, TaskInfo } from "../types";
import {
	formatDateTimeForDisplay,
	formatTimestampForDisplay,
	getCurrentTimestamp,
} from "../utils/dateUtils";
import { extractTaskInfo, calculateTotalTimeSpent, formatTime } from "../utils/helpers";
import { stringifyUnknown } from "../utils/stringUtils";
import { showConfirmationModal } from "./ConfirmationModal";
import { createCompletionsCalendarSection } from "./taskEditCompletions";
import { BlockingUpdates } from "./taskEditChanges";
import { showTaskModalReminderContextMenu } from "./taskModalActionMenus";
import { buildTaskEditChangesFromModalState } from "./taskEditChangeState";
import { buildTaskEditFormStateFromTask } from "./taskEditFormState";
import { applyTaskEditSubtaskChanges, hasTaskEditSubtaskChanges } from "./taskEditSubtasks";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { createTaskModalValueField, type TaskModalFieldControl } from "./taskModalPropertyFields";

const tasknotesLogger = createTaskNotesLogger({ tag: "Modals/TaskEditModal" });

export interface TaskEditOptions {
	task: TaskInfo;
	onTaskUpdated?: (task: TaskInfo) => void;
}

export class TaskEditModal extends TaskModal {
	private task: TaskInfo;
	private options: TaskEditOptions;
	private metadataContainer: HTMLElement;
	private editModalKeyboardHandler: ((e: KeyboardEvent) => void) | null = null;
	// Changed from Set to array for consistency with other state management
	private completedInstancesChanges: string[] = [];
	private skippedInstancesChanges: string[] = [];
	private initialBlockedBy: TaskDependency[] = [];
	private initialBlockingPaths: string[] = [];
	private pendingBlockingUpdates: BlockingUpdates = { added: [], removed: [], raw: {} };
	private unresolvedBlockingEntries: string[] = [];
	private initialTags = "";
	private isConvertingNoteToTask = false;
	private autoSaveReady = false;
	private autoSaveTimer: number | null = null;
	private autoSaveInFlight: Promise<boolean> | null = null;
	private autoSaveQueued = false;
	private formChangeVersion = 0;
	private savedFormChangeVersion = 0;
	private closeInProgress = false;
	private navigationCleanupScheduled = false;
	private static readonly AUTO_SAVE_DELAY_MS = 450;

	constructor(app: App, plugin: TaskNotesPlugin, options: TaskEditOptions) {
		super(app, plugin);
		this.task = options.task;
		this.options = options;
	}

	protected getCurrentTaskPath(): string | undefined {
		return this.task.path;
	}

	getModalTitle(): string {
		return this.t("modals.taskEdit.title");
	}

	protected isEditMode(): boolean {
		return true;
	}

	protected focusTitleInput(): void {
		if (this.isMobileLikeEnvironment()) {
			return;
		}
		super.focusTitleInput();
	}

	async initializeFormData(): Promise<void> {
		const formState = buildTaskEditFormStateFromTask({
			app: this.app,
			task: this.task,
			details: this.details,
			settings: {
				taskIdentificationMethod: this.plugin.settings.taskIdentificationMethod,
				taskTag: this.plugin.settings.taskTag,
				hideIdentifyingTagsMode: this.plugin.settings.hideIdentifyingTagsMode,
				userFields: this.plugin.settings?.userFields,
			},
			normalizeDetails: (value) => this.normalizeDetails(value),
		});

		this.title = formState.title;
		this.dueDate = formState.dueDate;
		this.scheduledDate = formState.scheduledDate;
		this.priority = formState.priority;
		this.status = formState.status;
		this.contexts = formState.contexts;

		// Initialize projects using the new method that handles both old and new formats
		if (formState.hasValidProjects) {
			this.initializeProjectsFromStrings(formState.projectValues);
		} else {
			this.projects = "";
			this.selectedProjectItems = [];
		}

		this.tags = formState.tags;
		this.initialTags = formState.initialTags;
		this.timeEstimate = formState.timeEstimate;
		this.recurrenceRule = formState.recurrenceRule;
		this.recurrenceAnchor = formState.recurrenceAnchor;
		this.reminders = formState.reminders;
		this.details = formState.details;
		this.originalDetails = formState.originalDetails;
		this.userFields = formState.userFields;

		// Initialize subtasks (tasks that have this task as a project)
		await this.initializeSubtasks();

		this.blockedByItems = (this.task.blockedBy ?? []).map((dependency) =>
			this.createDependencyItemFromDependency(dependency, this.task.path)
		);
		this.initialBlockedBy = this.blockedByItems.map((item) => ({ ...item.dependency }));

		this.blockingItems = (this.task.blocking ?? []).map((path) =>
			this.createDependencyItemFromPath(path)
		);
		this.initialBlockingPaths = this.blockingItems
			.filter((item) => item.path)
			.map((item) => item.path!);
		this.pendingBlockingUpdates = { added: [], removed: [], raw: {} };
		this.unresolvedBlockingEntries = [];
	}

	protected showReminderContextMenu(event: MouseEvent): void {
		// Override parent method to use the actual task with its path
		// Update the task object with current form values before showing menu
		showTaskModalReminderContextMenu(this.getActionMenuContext(), event, this.task);
	}

	onOpen(): void {
		void this.openEditModal();
	}

	private async openEditModal(): Promise<void> {
		// Clear any previous completion changes
		this.completedInstancesChanges = [];
		this.skippedInstancesChanges = [];

		// Refresh task data from file before opening
		await this.refreshTaskData();

		this.isExpanded = true;
		this.advancedFieldsExpanded = false;
		this.containerEl.addClass(
			"tasknotes-plugin",
			"minimalist-task-modal",
			"expanded",
			"tn-task-modal--advanced-collapsed",
			"tn-task-modal--edit"
		);
		this.modalEl.addClass("mod-tasknotes");

		// Set the modal title using the standard Obsidian approach (preserves close button)
		this.titleEl.setText(this.getModalTitle());
		this.titleEl.addClass("tn-task-modal__visually-hidden-title");
		this.createHeaderOpenNoteButton();

		// Add global keyboard shortcut handler for CMD/Ctrl+Enter
		this.editModalKeyboardHandler = (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				void this.flushAutoSave();
			}
		};
		this.containerEl.addEventListener("keydown", this.editModalKeyboardHandler);

		void this.initializeFormData().then(() => {
			this.createModalContent();
			// Render projects list after modal content is created
			this.renderProjectsList();
			// Update icon states after creating the action bar
			this.updateIconStates();
			this.autoSaveReady = true;
			this.focusTitleInput();
		});
	}

	private async refreshTaskData(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.task.path);
			if (!file || !(file instanceof TFile)) {
				tasknotesLogger.warn("Could not find file for task:", {
					category: "stale-data",
					operation: "find-file-task",
					details: { value: this.task.path },
				});
				return;
			}

			const content = await this.app.vault.read(file);
			this.details = this.extractDetailsFromContent(content);
			this.originalDetails = this.details;

			// Check if this file is actually a task (has task tag/property)
			// If not, keep the original task data (e.g., for "convert note to task" flow)
			const metadata = this.app.metadataCache.getFileCache(file);
			const isRecognizedTask =
				metadata?.frontmatter && this.plugin.cacheManager.isTaskFile(metadata.frontmatter);

			if (!isRecognizedTask) {
				// File is not yet a task - keep the original task data passed to constructor
				// This preserves user's default settings for status/priority during conversion
				this.isConvertingNoteToTask = true;
				this.task.details = this.details;
				return;
			}

			this.isConvertingNoteToTask = false;

			const cachedTaskInfo = await this.plugin.cacheManager.getTaskInfo(this.task.path);

			if (cachedTaskInfo) {
				cachedTaskInfo.details = this.details;
				this.task = cachedTaskInfo;
				this.options.task = cachedTaskInfo;
			} else {
				const freshTaskInfo = extractTaskInfo(
					this.app,
					content,
					this.task.path,
					file,
					this.plugin.fieldMapper,
					this.plugin.settings.storeTitleInFilename,
					this.plugin.settings.defaultTaskStatus
				);

				if (freshTaskInfo) {
					freshTaskInfo.details = this.details;
					this.task = freshTaskInfo;
					this.options.task = freshTaskInfo;
				}
			}
		} catch (error) {
			tasknotesLogger.warn("Could not refresh task data:", {
				category: "stale-data",
				operation: "refresh-task-data",
				error: error,
			});
		}
	}

	private createHeaderOpenNoteButton(): void {
		const header = this.titleEl.parentElement;
		if (!header) return;

		header.querySelector(".tn-task-modal__header-open-note")?.remove();
		const openButton = header.createEl("button", {
			cls: "tn-task-modal__header-open-note",
			attr: {
				type: "button",
				"aria-label": this.t("modals.task.buttons.openNote"),
				title: this.t("modals.task.buttons.openNote"),
			},
		});
		const icon = openButton.createSpan("tn-task-modal__header-open-note-icon");
		setIcon(icon, "file-text");
		openButton.createSpan({
			cls: "tn-task-modal__header-open-note-label",
			text: this.t("modals.task.buttons.openNote"),
		});
		openButton.addEventListener("click", () => {
			void this.openTaskNote();
		});
		header.insertBefore(openButton, this.titleEl);
	}

	protected createPrimaryInput(container: HTMLElement): void {
		super.createPrimaryInput(container);
	}

	protected createTimeTrackingField(container: HTMLElement): void {
		const getLabel = (): string =>
			this.plugin.getActiveTimeSession(this.task)
				? this.t("contextMenus.task.stopTimeTracking")
				: this.t("contextMenus.task.startTimeTracking");

		const control: TaskModalFieldControl = createTaskModalValueField({
			container,
			fieldId: "time-tracking",
			label: this.t("modals.task.fields.timeTracking"),
			value: getLabel(),
			emptyText: getLabel(),
			icon: "timer",
			onClick: () => {
				void (async () => {
					this.task = this.plugin.getActiveTimeSession(this.task)
						? await this.plugin.stopTimeTracking(this.task)
						: await this.plugin.startTimeTracking(this.task);
					this.options.task = this.task;
					this.status = this.task.status;
					this.updateIconStates();
					control.update(getLabel());
				})();
			},
		});
	}

	/**
	 * Add completions calendar and metadata sections after details
	 */
	protected createAdditionalSections(container: HTMLElement): void {
		createCompletionsCalendarSection(container, {
			task: this.task,
			plugin: this.plugin,
			completedInstancesChanges: this.completedInstancesChanges,
			skippedInstancesChanges: this.skippedInstancesChanges,
			translate: (key, params) => this.t(key, params),
			onChange: () => this.onFormStateChanged(),
		});
		this.createMetadataSection(container);
	}

	/** Close immediately after a successful flush or destructive task action. */
	forceClose(): void {
		super.close();
	}

	private scheduleNavigationModalCleanup(): void {
		if (this.navigationCleanupScheduled) return;
		this.navigationCleanupScheduled = true;
		const cleanupWindow = this.containerEl.ownerDocument.defaultView ?? window;
		const cleanup = (): void => {
			this.deferDetailsEditorCleanupOnClose();
			this.forceClose();
		};

		if (typeof cleanupWindow.requestIdleCallback === "function") {
			cleanupWindow.requestIdleCallback(cleanup, { timeout: 200 });
		} else {
			cleanupWindow.setTimeout(cleanup, 50);
		}
	}

	/** Save the latest edit before closing, matching normal note-editing behavior. */
	close(): void {
		if (this.closeInProgress) return;

		this.closeInProgress = true;
		void this.flushAutoSave().then((saved) => {
			this.closeInProgress = false;
			if (saved) this.forceClose();
		});
	}

	protected onFormStateChanged(): void {
		if (!this.autoSaveReady || this.closeInProgress) return;
		this.formChangeVersion += 1;

		if (this.autoSaveTimer !== null) {
			window.clearTimeout(this.autoSaveTimer);
		}
		this.autoSaveTimer = window.setTimeout(() => {
			this.autoSaveTimer = null;
			void this.flushAutoSave();
		}, TaskEditModal.AUTO_SAVE_DELAY_MS);
	}

	private async flushAutoSave(): Promise<boolean> {
		if (this.autoSaveTimer !== null) {
			window.clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}

		if (this.autoSaveInFlight) {
			this.autoSaveQueued = true;
			return this.autoSaveInFlight;
		}

		this.autoSaveInFlight = this.runAutoSaveLoop();
		try {
			return await this.autoSaveInFlight;
		} finally {
			this.autoSaveInFlight = null;
		}
	}

	private async runAutoSaveLoop(): Promise<boolean> {
		let saved = true;
		do {
			this.autoSaveQueued = false;
			const savingVersion = this.formChangeVersion;
			saved = await this.savePendingChanges();
			if (saved) {
				this.savedFormChangeVersion = savingVersion;
			}
		} while (saved && this.autoSaveQueued);
		return saved;
	}

	onClose(): void {
		this.autoSaveReady = false;
		if (this.autoSaveTimer !== null) {
			window.clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}

		// Clean up keyboard handler
		if (this.editModalKeyboardHandler) {
			this.containerEl.removeEventListener("keydown", this.editModalKeyboardHandler);
			this.editModalKeyboardHandler = null;
		}

		// Base class handles detailsMarkdownEditor cleanup
		super.onClose();
	}

	private createMetadataSection(container: HTMLElement): void {
		this.metadataContainer = container.createDiv("metadata-container");

		const metadataLabel = this.metadataContainer.createDiv("detail-label");
		metadataLabel.textContent = this.t("modals.taskEdit.sections.taskInfo");

		const metadataContent = this.metadataContainer.createDiv("metadata-content");
		const timeFormat = this.plugin.settings.calendarViewSettings?.timeFormat ?? "24";

		// Total tracked time
		const totalTimeSpent = calculateTotalTimeSpent(this.task.timeEntries || []);
		if (totalTimeSpent > 0) {
			this.createMetadataItem(
				metadataContent,
				this.t("modals.taskEdit.metadata.totalTrackedTime"),
				formatTime(totalTimeSpent)
			);
		}

		// Due date
		if (this.task.due) {
			this.createMetadataItem(
				metadataContent,
				this.t("modals.taskEdit.metadata.due"),
				formatDateTimeForDisplay(this.task.due, { userTimeFormat: timeFormat })
			);
		}

		// Scheduled date
		if (this.task.scheduled) {
			this.createMetadataItem(
				metadataContent,
				this.t("modals.taskEdit.metadata.scheduled"),
				formatDateTimeForDisplay(this.task.scheduled, { userTimeFormat: timeFormat })
			);
		}

		// Created date
		if (this.task.dateCreated) {
			this.createMetadataItem(
				metadataContent,
				this.t("modals.taskEdit.metadata.created"),
				formatTimestampForDisplay(this.task.dateCreated)
			);
		}

		// Modified date
		if (this.task.dateModified) {
			this.createMetadataItem(
				metadataContent,
				this.t("modals.taskEdit.metadata.modified"),
				formatTimestampForDisplay(this.task.dateModified)
			);
		}

		// File path (if available)
		if (this.task.path) {
			this.createMetadataItem(
				metadataContent,
				this.t("modals.taskEdit.metadata.file"),
				this.task.path
			);
		}
	}

	private createMetadataItem(container: HTMLElement, key: string, value: string): void {
		const item = container.createDiv("metadata-item");
		item.createSpan("metadata-key").textContent = `${key} `;
		item.createSpan("metadata-value").textContent = value;
	}

	async handleSave(): Promise<void> {
		await this.flushAutoSave();
	}

	private async savePendingChanges(): Promise<boolean> {
		if (!this.validateForm()) {
			new Notice(this.t("modals.taskEdit.notices.titleRequired"));
			return false;
		}

		try {
			const changes = this.getChanges({ includeConversionWrite: true });
			const hasBlockingChanges =
				this.pendingBlockingUpdates.added.length > 0 ||
				this.pendingBlockingUpdates.removed.length > 0;
			const hasTaskChanges = Object.keys(changes).length > 0;
			const hasSubtaskChanges = this.hasSubtaskChanges();

			if (this.unresolvedBlockingEntries.length > 0 && !hasBlockingChanges) {
				new Notice(
					this.t("modals.taskEdit.notices.blockingUnresolved", {
						entries: this.unresolvedBlockingEntries.join(", "),
					})
				);
				this.unresolvedBlockingEntries = [];
			}

			if (!hasTaskChanges && !hasBlockingChanges && !hasSubtaskChanges) {
				return true;
			}

			let updatedTask = this.task;

			if (hasTaskChanges) {
				updatedTask = await this.plugin.taskService.updateTask(this.task, changes);
				this.task = updatedTask;
				if (Object.prototype.hasOwnProperty.call(changes, "details")) {
					const updatedDetails = stringifyUnknown(
						(changes as Record<string, unknown>).details
					);
					this.originalDetails = updatedDetails;
				}
			}

			if (hasBlockingChanges) {
				await this.plugin.taskService.updateBlockingRelationships(
					updatedTask,
					this.pendingBlockingUpdates.added,
					this.pendingBlockingUpdates.removed,
					this.pendingBlockingUpdates.raw
				);

				const refreshed = await this.plugin.cacheManager.getTaskInfo(updatedTask.path);
				if (refreshed) {
					updatedTask = refreshed;
					this.task = refreshed;
				}
			}

			if (hasSubtaskChanges) {
				await this.applySubtaskChanges(updatedTask);
			}

			if (this.unresolvedBlockingEntries.length > 0) {
				new Notice(
					this.t("modals.taskEdit.notices.blockingUnresolved", {
						entries: this.unresolvedBlockingEntries.join(", "),
					})
				);
			}

			if (this.options.onTaskUpdated) {
				this.options.onTaskUpdated(updatedTask);
			}

			this.task = updatedTask;
			this.options.task = updatedTask;
			this.initialTags = this.tags;
			this.initialBlockedBy = this.blockedByItems.map((item) => ({ ...item.dependency }));
			this.initialBlockingPaths = this.blockingItems
				.filter((item) => item.path)
				.map((item) => item.path!);
			this.initialSubtaskFiles = [...this.selectedSubtaskFiles];
			this.completedInstancesChanges.splice(0);
			this.skippedInstancesChanges.splice(0);
			this.pendingBlockingUpdates = { added: [], removed: [], raw: {} };
			this.unresolvedBlockingEntries = [];
			return true;
		} catch (error) {
			tasknotesLogger.error("Failed to update task:", {
				category: "validation",
				operation: "update-task",
				error: error,
			});
			const message = error instanceof Error && error.message ? error.message : String(error);
			new Notice(this.t("modals.taskEdit.notices.updateFailure", { message }));
			return false;
		}
	}

	private getChanges(options: { includeConversionWrite?: boolean } = {}): Partial<TaskInfo> {
		const result = buildTaskEditChangesFromModalState({
			app: this.app,
			task: this.task,
			title: this.title,
			dueDate: this.dueDate,
			scheduledDate: this.scheduledDate,
			priority: this.priority,
			status: this.status,
			contexts: this.contexts,
			projects: this.projects,
			tags: this.tags,
			initialTags: this.initialTags,
			timeEstimate: this.timeEstimate,
			recurrenceRule: this.recurrenceRule,
			recurrenceAnchor: this.recurrenceAnchor,
			reminders: this.reminders,
			blockedByItems: this.blockedByItems,
			initialBlockedBy: this.initialBlockedBy,
			blockingItems: this.blockingItems,
			initialBlockingPaths: this.initialBlockingPaths,
			details: this.details,
			originalDetails: this.originalDetails,
			completedInstancesChanges: this.completedInstancesChanges,
			skippedInstancesChanges: this.skippedInstancesChanges,
			userFields: this.userFields,
			settings: {
				userFields: this.plugin.settings?.userFields,
				taskIdentificationMethod: this.plugin.settings.taskIdentificationMethod,
				taskTag: this.plugin.settings.taskTag,
				hideIdentifyingTagsMode: this.plugin.settings.hideIdentifyingTagsMode,
				maintainDueDateOffsetInRecurring:
					this.plugin.settings.maintainDueDateOffsetInRecurring,
			},
			normalizeDetails: (value) => this.normalizeDetails(value),
		});

		this.pendingBlockingUpdates = result.blockingUpdates;
		this.unresolvedBlockingEntries = result.unresolvedBlockingEntries;

		if (
			options.includeConversionWrite &&
			this.isConvertingNoteToTask &&
			Object.keys(result.changes).length === 0
		) {
			result.changes.dateModified = getCurrentTimestamp();
		}

		return result.changes;
	}

	protected async openTaskNote(): Promise<void> {
		try {
			// Persist any edit that has not reached the debounced autosave yet. Resolve
			// the file afterwards because saving a title can rename the task note.
			const hasPendingEdits =
				this.formChangeVersion !== this.savedFormChangeVersion ||
				this.autoSaveInFlight !== null;
			if (hasPendingEdits) {
				const saved = await this.flushAutoSave();
				if (!saved) {
					return;
				}
			}

			const file = this.app.vault.getAbstractFileByPath(this.task.path);

			if (!(file instanceof TFile)) {
				new Notice(this.t("modals.taskEdit.notices.fileMissing", { path: this.task.path }));
				return;
			}

			// Hide the modal and start navigation before Obsidian performs its
			// synchronous modal/editor teardown. Reusing the active leaf also avoids
			// the layout cost of creating a new tab for every navigation.
			this.containerEl.hidden = true;
			const leaf = this.app.workspace.getLeaf(false);
			const openPromise = leaf.openFile(file);
			this.scheduleNavigationModalCleanup();
			await openPromise;
		} catch (error) {
			tasknotesLogger.error("Failed to open task note:", {
				category: "persistence",
				operation: "open-task-note",
				error: error,
			});
			new Notice(this.t("modals.taskEdit.notices.openNoteFailure"));
		}
	}

	private async archiveTask(): Promise<void> {
		try {
			const updatedTask = await this.plugin.taskService.toggleArchive(this.task);

			// Update the task reference
			this.task = updatedTask;

			// Notify parent component if callback exists
			if (this.options.onTaskUpdated) {
				this.options.onTaskUpdated(updatedTask);
			}

			// Show success message
			const actionKey = updatedTask.archived
				? "modals.taskEdit.archiveAction.archived"
				: "modals.taskEdit.archiveAction.unarchived";
			const actionText = this.t(actionKey);
			new Notice(this.t("modals.taskEdit.notices.archiveSuccess", { action: actionText }));

			// Close the modal
			this.close();
		} catch (error) {
			tasknotesLogger.error("Failed to archive task:", {
				category: "persistence",
				operation: "archive-task",
				error: error,
			});
			new Notice(this.t("modals.taskEdit.notices.archiveFailure"));
		}
	}

	private async deleteTask(): Promise<void> {
		const confirmed = await showConfirmationModal(this.app, {
			title: this.t("modals.taskEdit.deleteConfirmation.title"),
			message: this.t("modals.taskEdit.deleteConfirmation.message", {
				title: this.task.title,
			}),
			confirmText: this.t("modals.taskEdit.deleteConfirmation.confirm"),
			cancelText: this.t("common.cancel"),
			isDestructive: true,
		});

		if (!confirmed) {
			return;
		}

		try {
			await this.plugin.taskService.deleteTask(this.task);
			new Notice(this.t("modals.taskEdit.notices.deleteSuccess", { title: this.task.title }));
			this.forceClose();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			tasknotesLogger.error("Failed to delete task:", {
				category: "persistence",
				operation: "delete-task",
				error: error,
			});
			new Notice(this.t("modals.taskEdit.notices.deleteFailure", { message }));
		}
	}

	protected createActionButtons(_container: HTMLElement): void {
		// Edit mode persists continuously and uses the native top-right close button.
	}

	protected async initializeSubtasks(): Promise<void> {
		try {
			const taskFile = this.app.vault.getAbstractFileByPath(this.task.path);
			if (!(taskFile instanceof TFile)) return;

			const subtasks =
				await this.plugin.projectSubtasksService.getTasksLinkedToProject(taskFile);
			const sortedSubtasks = this.plugin.projectSubtasksService.sortTasks([...subtasks]);
			this.selectedSubtaskFiles = [];
			this.initialSubtaskFiles = [];

			for (const subtask of sortedSubtasks) {
				const subtaskFile = this.app.vault.getAbstractFileByPath(subtask.path);
				if (subtaskFile) {
					this.selectedSubtaskFiles.push(subtaskFile);
					this.initialSubtaskFiles.push(subtaskFile);
				}
			}
		} catch (error) {
			tasknotesLogger.error("Error initializing subtasks:", {
				category: "persistence",
				operation: "initializing-subtasks",
				error: error,
			});
		}
	}

	protected hasSubtaskChanges(): boolean {
		return hasTaskEditSubtaskChanges(this.initialSubtaskFiles, this.selectedSubtaskFiles);
	}

	protected async applySubtaskChanges(task: TaskInfo): Promise<void> {
		const currentTaskFile = this.app.vault.getAbstractFileByPath(task.path);
		if (!(currentTaskFile instanceof TFile)) return;

		const result = await applyTaskEditSubtaskChanges({
			parentTaskFile: currentTaskFile,
			selectedSubtaskFiles: this.selectedSubtaskFiles,
			initialSubtaskFiles: this.initialSubtaskFiles,
			getTaskInfo: (path) => this.plugin.cacheManager.getTaskInfo(path),
			buildProjectReference: (parentTaskFile, subtaskPath) =>
				this.buildProjectReference(parentTaskFile, subtaskPath),
			updateTaskProjects: (subtaskInfo, updatedProjects) =>
				this.plugin.updateTaskProperty(subtaskInfo, "projects", updatedProjects),
			onAddError: (error) => {
				tasknotesLogger.error("Failed to add subtask relation:", {
					category: "persistence",
					operation: "add-subtask-relation",
					error: error,
				});
			},
			onRemoveError: (error) => {
				tasknotesLogger.error("Failed to remove subtask relation:", {
					category: "persistence",
					operation: "remove-subtask-relation",
					error: error,
				});
			},
		});

		this.initialSubtaskFiles = result.nextInitialSubtaskFiles;
	}

	// Start expanded for edit modal - override parent property
	protected isExpanded = true;
}
