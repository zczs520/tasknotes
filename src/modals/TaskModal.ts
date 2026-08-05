import { App, Modal, setIcon, setTooltip, TAbstractFile, TFile } from "obsidian";

type Nullable<T> = T | null;

import TaskNotesPlugin from "../main";
import { shouldShowFieldForModal } from "./taskModalFieldConfig";
import type { ModalFieldConfigLike, ModalFieldsConfigLike } from "./taskModalFieldConfig";
import {
	renderTaskModalField,
	renderTaskModalFieldGroups,
	type TaskModalFieldRendererMap,
} from "./taskModalFieldRenderer";
import {
	createTaskModalDetailsEditor,
	destroyTaskModalDetailsEditor,
} from "./taskModalDetailsEditor";
import { splitFrontmatterAndBody } from "../utils/helpers";
import { ProjectSelectModal } from "./ProjectSelectModal";
import { TaskDependency, Reminder } from "../types";
import { DEFAULT_DEPENDENCY_RELTYPE, formatDependencyLink } from "../utils/dependencyUtils";
import { type LinkServices } from "../ui/renderers/linkRenderer";
import { generateLink } from "../utils/linkUtils";
import type { EmbeddableMarkdownEditor } from "../editor/EmbeddableMarkdownEditor";
import {
	createTaskModalBlockedByField,
	createTaskModalBlockingField,
	createTaskModalProjectsField,
	createTaskModalSubtasksField,
	type TaskModalOrganizationFieldContext,
} from "./taskModalOrganizationFields";
import { createTaskCard } from "../ui/TaskCard";
import {
	addDependencyItem,
	createDependencyItemFromDependency as createDependencyItemFromDependencyHelper,
	createDependencyItemFromFile as createDependencyItemFromFileHelper,
	createDependencyItemFromPath as createDependencyItemFromPathHelper,
	DependencyItem,
	getBlockedByDependencyCandidates,
	getBlockingDependencyCandidates,
	removeDependencyItemAtIndex,
	renderDependencyList,
} from "./taskModalDependencies";
import {
	createTaskModalContextsField,
	createTaskModalTagsField,
	createTaskModalTimeEstimateField,
	type TaskModalMetadataFieldContext,
} from "./taskModalMetadataFields";
import {
	createTaskModalConfiguredUserField,
	createTaskModalUserFieldsSection,
	updateTaskModalUserFieldControls,
	type TaskModalUserFieldContext,
	type TaskModalUserFieldToggleControl,
} from "./taskModalUserFieldControls";
import {
	createTaskModalActionButtons,
	type TaskModalActionButtonContext,
	type TaskModalLeadingButton,
} from "./taskModalActionButtons";
import {
	createTaskModalActionIcon,
	createTaskModalActionIcons,
	type TaskModalActionIconSpec,
} from "./taskModalActionBar";
import { updateTaskModalActionIconStates } from "./taskModalActionIconStates";
import {
	buildTaskModalActionIconState,
	createTaskModalActionMenuContext,
	createTaskModalActionMenuState,
} from "./taskModalActionState";
import {
	showTaskModalDateContextMenu,
	showTaskModalPriorityContextMenu,
	showTaskModalRecurrenceContextMenu,
	showTaskModalReminderContextMenu,
	showTaskModalStatusContextMenu,
	type TaskModalActionMenuContext,
	type TaskModalActionMenuState,
} from "./taskModalActionMenus";
import {
	addTaskModalProjectItemsFromStrings,
	createTaskModalProjectItemFromFile,
	getTaskModalProjectsValue,
	hasTaskModalProjectItem,
	removeTaskModalProjectItem,
	renderTaskModalProjectsList,
	type TaskModalProjectItem,
	type TaskModalProjectStringContext,
} from "./taskModalProjects";
import {
	addTaskModalSubtaskFile,
	getTaskModalSubtaskCandidates,
	removeTaskModalSubtaskFile,
	renderTaskModalSubtasksList,
} from "./taskModalSubtasks";
import { openTaskModalTaskSelector } from "./taskModalTaskSelector";
import {
	createTaskModalTitleTextarea,
	type TaskModalTitleInputElement,
} from "./taskModalTitleInput";
import { collapseTaskModalDetailsLayout, expandTaskModalDetailsLayout } from "./taskModalLayout";
import {
	TaskModalFocusGuards,
	type TaskModalMobileKeyboardScrollGuardOptions,
} from "./taskModalFocusGuards";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { formatDateTimeForDisplay } from "../utils/dateUtils";
import { getTaskModalRecurrenceDisplayText } from "./taskModalActionValues";
import {
	createTaskModalChoiceField,
	createTaskModalValueField,
	type TaskModalFieldControl,
} from "./taskModalPropertyFields";

const tasknotesLogger = createTaskNotesLogger({ tag: "Modals/TaskModal" });

export abstract class TaskModal extends Modal {
	plugin: TaskNotesPlugin;
	private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
	private focusGuards: TaskModalFocusGuards;

	// Dependency item definition
	protected createDependencyItemFromFile(
		file: TFile,
		options: { sourcePath?: string } = {}
	): DependencyItem {
		return createDependencyItemFromFileHelper(
			{
				plugin: this.plugin,
				sourcePath: options.sourcePath ?? this.getDependencySourcePath(),
			},
			file
		);
	}

	protected createDependencyItemFromDependency(
		dependency: TaskDependency,
		sourcePath?: string
	): DependencyItem {
		return createDependencyItemFromDependencyHelper(
			{ plugin: this.plugin, sourcePath: sourcePath ?? this.getDependencySourcePath() },
			dependency
		);
	}

	protected createDependencyItemFromPath(path: string): DependencyItem {
		return createDependencyItemFromPathHelper(
			{ plugin: this.plugin, sourcePath: this.getDependencySourcePath() },
			path
		);
	}

	protected getDependencySourcePath(): string {
		return this.getCurrentTaskPath() || this.plugin.app.workspace.getActiveFile()?.path || "";
	}

	// Overridden by subclasses that manage an existing task
	protected getCurrentTaskPath(): string | undefined {
		return undefined;
	}

	protected getModalEditorFile(): Nullable<TFile> {
		const currentTaskPath = this.getCurrentTaskPath();
		if (!currentTaskPath) {
			return this.app.workspace.getActiveFile();
		}

		const file = this.app.vault.getAbstractFileByPath(currentTaskPath);
		return file instanceof TFile ? file : this.app.workspace.getActiveFile();
	}

	protected async openTaskNote(): Promise<void> {
		// Creation modals do not have an existing task note to open.
	}

	protected renderDependencyLists(): void {
		this.renderBlockedByList();
		this.renderBlockingList();
	}

	protected getLinkServices(): LinkServices {
		return {
			metadataCache: this.plugin.app.metadataCache,
			workspace: this.plugin.app.workspace,
			sourcePath:
				this.getCurrentTaskPath() || this.plugin.app.workspace.getActiveFile()?.path || "",
		};
	}

	protected renderBlockedByList(): void {
		void this.renderDependencyList(this.blockedByList, this.blockedByItems, (index) => {
			this.blockedByItems = removeDependencyItemAtIndex(this.blockedByItems, index);
			this.renderBlockedByList();
			this.onFormStateChanged();
		});
	}

	protected renderBlockingList(): void {
		void this.renderDependencyList(this.blockingList, this.blockingItems, (index) => {
			this.blockingItems = removeDependencyItemAtIndex(this.blockingItems, index);
			this.renderBlockingList();
			this.onFormStateChanged();
		});
	}

	private async renderDependencyList(
		listEl: HTMLElement | undefined,
		items: DependencyItem[],
		onRemove: (index: number) => void
	): Promise<void> {
		if (!listEl) {
			return;
		}

		await renderDependencyList({
			plugin: this.plugin,
			listEl,
			items,
			linkServices: this.getLinkServices(),
			translate: (key, params) => this.t(key, params),
			onRemove,
		});
	}

	protected extractDetailsFromContent(content: string): string {
		const { body } = splitFrontmatterAndBody(content);
		return body.replace(/\r\n/g, "\n").trimEnd();
	}

	protected normalizeDetails(value: string): string {
		return value.replace(/\r\n/g, "\n").trimEnd();
	}

	protected addBlockedByTask(file: TFile): void {
		const dependency: TaskDependency = {
			uid: formatDependencyLink(
				this.plugin.app,
				this.getDependencySourcePath(),
				file.path,
				this.plugin.settings.useFrontmatterMarkdownLinks
			),
			reltype: DEFAULT_DEPENDENCY_RELTYPE,
		};
		this.addBlockedByDependency(dependency);
	}

	protected addBlockingTask(file: TFile): void {
		this.addBlockingTaskFromPath(file.path);
	}

	protected addBlockedByDependency(dependency: TaskDependency): void {
		const sourcePath = this.getDependencySourcePath();
		const item = this.createDependencyItemFromDependency(dependency, sourcePath);
		const nextItems = addDependencyItem(this.blockedByItems, item);
		if (nextItems.length === this.blockedByItems.length) {
			return;
		}
		this.blockedByItems = nextItems;
		this.renderBlockedByList();
		this.onFormStateChanged();
	}

	protected addBlockingTaskFromPath(path: string): void {
		const currentPath = this.getCurrentTaskPath();
		if (currentPath && path === currentPath) {
			return;
		}
		const item = this.createDependencyItemFromPath(path);
		const nextItems = addDependencyItem(this.blockingItems, item);
		if (nextItems.length === this.blockingItems.length) {
			return;
		}
		this.blockingItems = nextItems;
		this.renderBlockingList();
		this.onFormStateChanged();
	}

	protected async openBlockedBySelector(): Promise<void> {
		const sourcePath = this.getDependencySourcePath();

		await openTaskModalTaskSelector({
			plugin: this.plugin,
			getCandidates: (allTasks) =>
				getBlockedByDependencyCandidates({
					plugin: this.plugin,
					sourcePath,
					allTasks,
					existingItems: this.blockedByItems,
					currentPath: this.getCurrentTaskPath(),
				}),
			onSelect: (selected) => {
				const dependency: TaskDependency = {
					uid: formatDependencyLink(this.plugin.app, sourcePath, selected.path),
					reltype: DEFAULT_DEPENDENCY_RELTYPE,
				};
				this.addBlockedByDependency(dependency);
			},
			translate: (key) => this.t(key),
			noEligibleTasksMessageKey: "contextMenus.task.dependencies.notices.noEligibleTasks",
			openFailedMessageKey: "contextMenus.task.dependencies.notices.updateFailed",
			logOperation: "open-blocked-by-selector",
		});
	}

	protected async openBlockingSelector(): Promise<void> {
		const sourcePath = this.getDependencySourcePath();

		await openTaskModalTaskSelector({
			plugin: this.plugin,
			getCandidates: (allTasks) =>
				getBlockingDependencyCandidates({
					plugin: this.plugin,
					sourcePath,
					allTasks,
					existingItems: this.blockingItems,
					currentPath: this.getCurrentTaskPath(),
				}),
			onSelect: (selected) => {
				this.addBlockingTaskFromPath(selected.path);
			},
			translate: (key) => this.t(key),
			noEligibleTasksMessageKey: "contextMenus.task.dependencies.notices.noEligibleTasks",
			openFailedMessageKey: "contextMenus.task.dependencies.notices.updateFailed",
			logOperation: "open-blocking-selector",
		});
	}

	// Core task properties
	protected title = "";
	protected details = "";
	protected originalDetails = "";
	protected dueDate = "";
	protected scheduledDate = "";
	protected priority = "normal";
	protected status = "open";
	protected contexts = "";
	protected projects = "";
	protected tags = "";
	protected timeEstimate = 0;
	protected recurrenceRule = "";
	protected recurrenceAnchor: "scheduled" | "completion" = "scheduled";
	protected reminders: Reminder[] = [];

	// User-defined fields (dynamic based on settings)
	protected userFields: Record<string, unknown> = {};
	protected userFieldInputs = new Map<string, HTMLInputElement>();
	protected userFieldToggles = new Map<string, TaskModalUserFieldToggleControl>();

	// Dependency fields
	protected blockedByItems: DependencyItem[] = [];
	protected blockingItems: DependencyItem[] = [];
	protected blockedByList: HTMLElement | undefined = undefined;
	protected blockingList: HTMLElement | undefined = undefined;

	// Project link storage
	protected selectedProjectItems: TaskModalProjectItem[] = [];

	// Subtask storage - tracks tasks that should become subtasks of this task
	protected selectedSubtaskFiles: TAbstractFile[] = [];
	protected initialSubtaskFiles: TAbstractFile[] = [];

	// UI elements
	protected titleInput: TaskModalTitleInputElement =
		undefined as unknown as TaskModalTitleInputElement;
	protected detailsInput: HTMLTextAreaElement = undefined as unknown as HTMLTextAreaElement; // Legacy - kept for compatibility
	protected detailsMarkdownEditor: EmbeddableMarkdownEditor | null = null;
	private deferDetailsEditorCleanup = false;
	protected contextsInput: HTMLInputElement = undefined as unknown as HTMLInputElement;
	protected projectsInput: HTMLInputElement = undefined as unknown as HTMLInputElement;
	protected tagsInput: HTMLInputElement = undefined as unknown as HTMLInputElement;
	protected timeEstimateInput: HTMLInputElement = undefined as unknown as HTMLInputElement;
	protected projectsList: HTMLElement = undefined as unknown as HTMLElement;
	protected subtasksList: HTMLElement = undefined as unknown as HTMLElement;
	protected actionBar: HTMLElement = undefined as unknown as HTMLElement;
	protected detailsContainer: HTMLElement = undefined as unknown as HTMLElement;
	protected isExpanded = false;
	protected advancedFieldsExpanded = false;
	private propertyFieldControls = new Map<string, TaskModalFieldControl>();

	constructor(app: App, plugin: TaskNotesPlugin) {
		super(app);
		this.plugin = plugin;
		this.focusGuards = new TaskModalFocusGuards({
			containerEl: this.containerEl,
			modalEl: this.modalEl,
			contentEl: this.contentEl,
		});
	}

	/**
	 * Get the Obsidian app instance - useful for dependency injection in tests
	 */
	protected getApp(): App {
		return this.app;
	}

	/**
	 * Get the plugin instance - useful for dependency injection in tests
	 */
	protected getPlugin(): TaskNotesPlugin {
		return this.plugin;
	}

	protected t(key: string, params?: Record<string, string | number>): string {
		return this.plugin.i18n.translate(key, params);
	}

	/**
	 * Get a file by path - useful for testing with mocked vault
	 */
	protected getFileByPath(path: string): unknown {
		return this.app.vault.getAbstractFileByPath(path);
	}

	/**
	 * Get all markdown files - useful for testing with mocked vault
	 */
	protected getMarkdownFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	/**
	 * Get file cache - useful for testing with mocked metadataCache
	 */
	protected getFileCache(file: TFile): unknown {
		return this.app.metadataCache.getFileCache(file);
	}

	/**
	 * Resolve a link to a file - useful for testing with mocked metadataCache
	 */
	protected resolveLink(linkPath: string, sourcePath: string): unknown {
		return this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
	}

	protected isEditMode(): boolean {
		return false;
	}

	protected isCreationMode(): boolean {
		return false;
	}

	abstract initializeFormData(): Promise<void>;
	abstract handleSave(): Promise<void>;
	abstract getModalTitle(): string;

	/** Called after a user-facing form value changes. Edit mode uses this for autosave. */
	protected onFormStateChanged(): void {
		// Creation mode remains explicitly submitted.
	}

	protected async handleSubmitShortcut(_shift: boolean): Promise<void> {
		await this.handleSave();
	}

	onOpen(): void {
		this.isExpanded = true;
		this.advancedFieldsExpanded = false;
		this.containerEl.addClass(
			"tasknotes-plugin",
			"minimalist-task-modal",
			"expanded",
			"tn-task-modal--advanced-collapsed",
			this.isCreationMode() ? "tn-task-modal--creation" : "tn-task-modal--edit"
		);
		this.modalEl.addClass("mod-tasknotes");

		// Set the modal title using the standard Obsidian approach (preserves close button)
		this.titleEl.setText(this.getModalTitle());

		// Add global keyboard shortcut handler for CMD/Ctrl+Enter
		this.keyboardHandler = (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				// Skip if event comes from a markdown editor (which has its own handler)
				const target = e.target as HTMLElement;
				if (target.closest(".cm-editor")) {
					return;
				}
				e.preventDefault();
				void this.handleSubmitShortcut(e.shiftKey);
			}
		};
		this.containerEl.addEventListener("keydown", this.keyboardHandler);

		void this.initializeFormData().then(() => {
			this.createModalContent();
			this.focusTitleInput();
		});
	}

	// Store references to split layout containers for potential reuse
	protected splitContentWrapper: HTMLElement;
	protected splitLeftColumn: HTMLElement;
	protected splitRightColumn: HTMLElement = undefined as unknown as HTMLElement;

	protected createModalContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Create main container
		const container = contentEl.createDiv("minimalist-modal-container");

		// Create split content wrapper at the top level for wide screen layout
		this.splitContentWrapper = container.createDiv("modal-split-content");
		this.splitLeftColumn = this.splitContentWrapper.createDiv("modal-split-left");

		// Create primary input area (title or NLP) - subclasses can override
		this.createPrimaryInput(this.splitLeftColumn);

		// Create action bar with icons - goes in left column
		this.createActionBar(this.splitLeftColumn);

		this.splitRightColumn = this.splitLeftColumn.createDiv("modal-split-right");

		// Create collapsible details section (fields in left, details editor in right)
		this.createDetailsSection(container);

		// Hook for subclasses to add additional sections to left column
		this.createAdditionalSections(this.splitLeftColumn);

		// Create save/cancel buttons - outside the split, at bottom
		this.createActionButtons(container);
	}

	/**
	 * Creates the primary input area. Override in subclasses for different behavior.
	 * Default: simple title input
	 */
	protected createPrimaryInput(container: HTMLElement): void {
		this.createTitleInput(container);
	}

	/**
	 * Hook for subclasses to add additional sections after the details section.
	 * Default: no-op
	 */
	protected createAdditionalSections(container: HTMLElement): void {
		// Override in subclasses (e.g., TaskEditModal adds completions calendar and metadata)
	}

	protected createTitleInput(container: HTMLElement): void {
		const titleContainer = container.createDiv("title-input-container");

		this.titleInput = this.createTitleTextarea(
			titleContainer,
			"title-input",
			this.t("modals.task.untitledTitlePlaceholder")
		);
	}

	private createTitleTextarea(
		container: HTMLElement,
		cls: string,
		placeholder: string
	): HTMLTextAreaElement {
		return createTaskModalTitleTextarea({
			container,
			className: cls,
			placeholder,
			value: this.title,
			onChange: (value) => {
				this.title = value;
				this.onFormStateChanged();
			},
			attachFocusScrollGuard: (input) => {
				this.attachTitleFocusScrollGuard(input);
				this.attachMobileKeyboardScrollGuard(input, { scrollOnFocus: false });
			},
		});
	}

	protected createActionBar(container: HTMLElement): void {
		this.actionBar = container.createDiv("tn-task-modal__action-bar");
	}

	private createAdvancedFieldsToggle(container: HTMLElement): void {
		const toggle = this.createActionIcon(
			container,
			this.advancedFieldsExpanded ? "chevron-up" : "chevron-down",
			this.getAdvancedFieldsToggleLabel(),
			(icon) => {
				this.advancedFieldsExpanded = !this.advancedFieldsExpanded;
				this.containerEl.classList.toggle(
					"tn-task-modal--advanced-collapsed",
					!this.advancedFieldsExpanded
				);
				icon.setAttribute("aria-expanded", String(this.advancedFieldsExpanded));
				const iconEl = icon.querySelector<HTMLElement>(".icon");
				if (iconEl) {
					setIcon(iconEl, this.advancedFieldsExpanded ? "chevron-up" : "chevron-down");
				}
				setTooltip(icon, this.getAdvancedFieldsToggleLabel(), { placement: "top" });
			}
		);
		toggle.addClass("tn-task-modal__advanced-toggle");
		toggle.setAttribute("aria-expanded", String(this.advancedFieldsExpanded));
	}

	private getAdvancedFieldsToggleLabel(): string {
		return this.advancedFieldsExpanded
			? this.t("modals.taskCreation.actions.hideDetailedOptions")
			: this.t("modals.taskCreation.actions.showDetailedOptions");
	}

	protected createCoreActionIcons(container: HTMLElement): HTMLElement[] {
		return createTaskModalActionIcons(container, this.getCoreActionIconSpecs());
	}

	protected getCoreActionIconSpecs(): TaskModalActionIconSpec[] {
		return [
			{
				iconName: "dot-square",
				tooltip: this.t("modals.task.actions.status"),
				onClick: (_, event) => {
					this.showStatusContextMenu(event);
				},
				dataType: "status",
			},
			{
				iconName: "star",
				tooltip: this.t("modals.task.actions.priority"),
				onClick: (_, event) => {
					this.showPriorityContextMenu(event);
				},
				dataType: "priority",
			},
			{
				iconName: "calendar",
				tooltip: this.t("modals.task.actions.due"),
				onClick: (_, event) => {
					this.showDateContextMenu(event, "due");
				},
				dataType: "due-date",
			},
			{
				iconName: "calendar-clock",
				tooltip: this.t("modals.task.actions.scheduled"),
				onClick: (_, event) => {
					this.showDateContextMenu(event, "scheduled");
				},
				dataType: "scheduled-date",
			},
			{
				iconName: "refresh-ccw",
				tooltip: this.t("modals.task.actions.recurrence"),
				onClick: (_, event) => {
					this.showRecurrenceContextMenu(event);
				},
				dataType: "recurrence",
			},
			{
				iconName: "bell",
				tooltip: this.t("modals.task.actions.reminders"),
				onClick: (_, event) => {
					this.showReminderContextMenu(event);
				},
				dataType: "reminders",
			},
		];
	}

	protected createActionIcon(
		container: HTMLElement,
		iconName: string,
		tooltip: string,
		onClick: (icon: HTMLElement, event: UIEvent) => void,
		dataType?: string
	): HTMLElement {
		return createTaskModalActionIcon(container, {
			iconName,
			tooltip,
			onClick,
			dataType,
		});
	}

	protected createDetailsSection(container: HTMLElement): void {
		this.userFieldInputs.clear();
		this.userFieldToggles.clear();
		this.propertyFieldControls.clear();

		// The details container wraps the expandable fields (for hide/show animation)
		// It goes inside the left column for proper expand/collapse
		this.detailsContainer = this.splitLeftColumn
			? this.splitLeftColumn.createDiv("details-container")
			: container.createDiv("details-container");

		if (!this.isExpanded) {
			collapseTaskModalDetailsLayout({
				detailsContainer: this.detailsContainer,
				splitRightColumn: this.splitRightColumn,
			});
		}

		// Check field configuration to determine which fields to show
		const config = this.plugin.settings.modalFieldsConfig;
		const shouldShowTitle = this.shouldShowField("title", config);
		const shouldShowDetails = this.shouldShowField("details", config);
		this.splitContentWrapper.classList.toggle(
			"modal-split-content--right-empty",
			!shouldShowDetails
		);

		this.splitLeftColumn.classList.toggle("tn-task-modal__title-hidden", !shouldShowTitle);

		// Details editor goes in the right column
		if (shouldShowDetails) {
			const rightColumn = this.splitRightColumn || this.detailsContainer;

			this.detailsMarkdownEditor = createTaskModalDetailsEditor({
				app: this.app,
				parent: rightColumn,
				label: this.t("modals.task.detailsLabel"),
				value: this.details,
				placeholder: this.t("modals.task.detailsPlaceholder"),
				file: this.getModalEditorFile(),
				tabMovesFocus: this.plugin.settings.taskModalTabMovesFocus,
				onChange: (value) => {
					this.details = value;
					this.onFormStateChanged();
				},
				onSubmit: (shift) => {
					void this.handleSubmitShortcut(shift);
				},
				onEscape: () => {
					this.close();
				},
				focusNextField: () => this.focusNextField(),
				focusPreviousField: () => this.focusPreviousField(),
			});
		}

		// Additional form fields (contexts, tags, etc.) go in the details container (left side)
		this.createAdditionalFields(this.detailsContainer);
		if (this.detailsContainer.querySelector(".tn-task-modal__field--advanced")) {
			const toggleBar = this.detailsContainer.createDiv("tn-task-modal__property-toggle-bar");
			this.createAdvancedFieldsToggle(toggleBar);
		}
	}

	/**
	 * Check if a field should be shown based on field configuration
	 */
	protected shouldShowField(fieldId: string, config?: ModalFieldsConfigLike): boolean {
		return shouldShowFieldForModal(fieldId, config, this.isCreationMode());
	}

	protected createAdditionalFields(container: HTMLElement): void {
		// Use field configuration (always initialized via migration in main.ts)
		const config = this.plugin.settings.modalFieldsConfig;
		if (!config) {
			tasknotesLogger.error(
				"TaskModal: modalFieldsConfig is not initialized. This should never happen.",
				{
					category: "configuration",
					operation:
						"taskmodal-modalfieldsconfig-not-initialized-this-should-never-happen",
				}
			);
			return;
		}
		this.createFieldsFromConfig(container, config);
	}

	protected createFieldsFromConfig(container: HTMLElement, config: ModalFieldsConfigLike): void {
		renderTaskModalFieldGroups({
			container,
			config,
			isCreationMode: this.isCreationMode(),
			fieldRenderers: this.getFieldRenderers(),
			renderUserField: (fieldContainer, fieldConfig) => {
				this.createUserFieldByConfig(fieldContainer, fieldConfig);
			},
		});
	}

	protected createField(container: HTMLElement, fieldConfig: ModalFieldConfigLike): void {
		renderTaskModalField({
			container,
			fieldConfig,
			fieldRenderers: this.getFieldRenderers(),
			renderUserField: (fieldContainer, userFieldConfig) => {
				this.createUserFieldByConfig(fieldContainer, userFieldConfig);
			},
		});
	}

	protected getFieldRenderers(): TaskModalFieldRendererMap {
		return {
			status: (container) => this.createStatusField(container),
			priority: (container) => this.createPriorityField(container),
			"due-date": (container) => this.createDateField(container, "due"),
			"scheduled-date": (container) => this.createDateField(container, "scheduled"),
			recurrence: (container) => this.createRecurrenceField(container),
			reminders: (container) => this.createRemindersField(container),
			"time-tracking": (container) => this.createTimeTrackingField(container),
			contexts: (container) => this.createContextsField(container),
			tags: (container) => this.createTagsField(container),
			"time-estimate": (container) => this.createTimeEstimateField(container),
			projects: (container) => this.createProjectsField(container),
			subtasks: (container) => this.createSubtasksField(container),
			"blocked-by": (container) => this.createBlockedByField(container),
			blocking: (container) => this.createBlockingField(container),
		};
	}

	protected createContextsField(container: HTMLElement): void {
		this.contextsInput = createTaskModalContextsField(this.getMetadataFieldContext(), {
			container,
			value: this.contexts,
			onChange: (value) => {
				this.contexts = value;
				this.onFormStateChanged();
			},
		});
	}

	protected createTagsField(container: HTMLElement): void {
		this.tagsInput = createTaskModalTagsField(this.getMetadataFieldContext(), {
			container,
			value: this.tags,
			onChange: (value) => {
				this.tags = value;
				this.onFormStateChanged();
			},
		});
	}

	protected createTimeEstimateField(container: HTMLElement): void {
		this.timeEstimateInput = createTaskModalTimeEstimateField(this.getMetadataFieldContext(), {
			container,
			value: this.timeEstimate,
			onChange: (value) => {
				this.timeEstimate = value;
				this.onFormStateChanged();
			},
		});
	}

	protected createStatusField(container: HTMLElement): void {
		const choices = [...(this.plugin.settings.customStatuses || [])]
			.sort((a, b) => a.order - b.order)
			.map(({ value, label, color }) => ({ value, label, color }));
		this.propertyFieldControls.set(
			"status",
			createTaskModalChoiceField({
				container,
				fieldId: "status",
				label: this.t("modals.task.fields.status"),
				choices,
				value: this.status,
				onChange: (value) => {
					this.status = value;
					this.updateIconStates();
					this.onFormStateChanged();
				},
			})
		);
	}

	protected createPriorityField(container: HTMLElement): void {
		const choices = [...(this.plugin.settings.customPriorities || [])]
			.sort((a, b) => a.weight - b.weight)
			.map(({ value, label, color }) => ({ value, label, color }));
		this.propertyFieldControls.set(
			"priority",
			createTaskModalChoiceField({
				container,
				fieldId: "priority",
				label: this.t("modals.task.fields.priority"),
				choices,
				value: this.priority,
				onChange: (value) => {
					this.priority = value;
					this.updateIconStates();
					this.onFormStateChanged();
				},
			})
		);
	}

	protected createDateField(container: HTMLElement, type: "due" | "scheduled"): void {
		const fieldId = type === "due" ? "due-date" : "scheduled-date";
		const value = type === "due" ? this.dueDate : this.scheduledDate;
		this.propertyFieldControls.set(
			fieldId,
			createTaskModalValueField({
				container,
				fieldId,
				label: this.t(
					type === "due" ? "modals.task.fields.due" : "modals.task.fields.scheduled"
				),
				value: this.formatPropertyDate(value),
				emptyText: this.t("modals.task.notSet"),
				icon: "calendar-days",
				onClick: (event) => this.showDateContextMenu(event, type),
			})
		);
	}

	protected createRecurrenceField(container: HTMLElement): void {
		this.propertyFieldControls.set(
			"recurrence",
			createTaskModalValueField({
				container,
				fieldId: "recurrence",
				label: this.t("modals.task.fields.recurrence"),
				value: this.recurrenceRule
					? getTaskModalRecurrenceDisplayText(this.recurrenceRule)
					: "",
				emptyText: this.t("modals.task.notSet"),
				icon: "repeat-2",
				onClick: (event) => this.showRecurrenceContextMenu(event),
			})
		);
	}

	protected createRemindersField(container: HTMLElement): void {
		this.propertyFieldControls.set(
			"reminders",
			createTaskModalValueField({
				container,
				fieldId: "reminders",
				label: this.t("modals.task.fields.reminders"),
				value: this.getRemindersDisplayText(),
				emptyText: this.t("modals.task.notSet"),
				icon: "bell",
				onClick: (event) => this.showReminderContextMenu(event),
			})
		);
	}

	protected createTimeTrackingField(_container: HTMLElement): void {
		// Time tracking is available only in the edit modal.
	}

	private formatPropertyDate(value: string): string {
		if (!value) return "";
		const timeFormat = this.plugin.settings.calendarViewSettings?.timeFormat ?? "24";
		return formatDateTimeForDisplay(value, { userTimeFormat: timeFormat });
	}

	private getRemindersDisplayText(): string {
		const count = this.reminders?.length ?? 0;
		if (count === 0) return "";
		return count === 1
			? this.t("modals.task.tooltips.remindersSingle")
			: this.t("modals.task.tooltips.remindersPlural", { count });
	}

	private updatePropertyFieldStates(): void {
		this.propertyFieldControls.get("status")?.update(this.status);
		this.propertyFieldControls.get("priority")?.update(this.priority);
		this.propertyFieldControls.get("due-date")?.update(this.formatPropertyDate(this.dueDate));
		this.propertyFieldControls
			.get("scheduled-date")
			?.update(this.formatPropertyDate(this.scheduledDate));
		this.propertyFieldControls
			.get("recurrence")
			?.update(
				this.recurrenceRule ? getTaskModalRecurrenceDisplayText(this.recurrenceRule) : ""
			);
		this.propertyFieldControls.get("reminders")?.update(this.getRemindersDisplayText());
	}

	private getMetadataFieldContext(): TaskModalMetadataFieldContext {
		return {
			app: this.app,
			plugin: this.plugin,
			translate: (key) => this.t(key),
			attachMobileKeyboardScrollGuard: (input) => {
				this.attachMobileKeyboardScrollGuard(input);
			},
		};
	}

	protected createProjectsField(container: HTMLElement): void {
		this.projectsList = createTaskModalProjectsField(this.getOrganizationFieldContext(), {
			container,
			onButtonClick: () => {
				const modal = new ProjectSelectModal(this.app, this.plugin, (file) => {
					this.addProject(file);
				});
				modal.open();
			},
			listElement: this.projectsList,
		});

		this.renderOrganizationLists();
	}

	protected createSubtasksField(container: HTMLElement): void {
		this.subtasksList = createTaskModalSubtasksField(this.getOrganizationFieldContext(), {
			container,
			onButtonClick: () => {
				void this.openSubtaskSelector();
			},
			listElement: this.subtasksList,
		});

		this.renderOrganizationLists();
	}

	private getOrganizationFieldContext(): TaskModalOrganizationFieldContext {
		return {
			translate: (key) => this.t(key),
		};
	}

	private getUserFieldContext(): TaskModalUserFieldContext {
		return {
			app: this.app,
			plugin: this.plugin,
			translate: (key, params) => this.t(key, params),
			attachMobileKeyboardScrollGuard: (input) => {
				this.attachMobileKeyboardScrollGuard(input);
			},
		};
	}

	protected createBlockedByField(container: HTMLElement): void {
		this.blockedByList = createTaskModalBlockedByField(this.getOrganizationFieldContext(), {
			container,
			onButtonClick: () => {
				void this.openBlockedBySelector();
			},
			listElement: this.blockedByList,
		});

		this.renderDependencyLists();
	}

	protected createBlockingField(container: HTMLElement): void {
		this.blockingList = createTaskModalBlockingField(this.getOrganizationFieldContext(), {
			container,
			onButtonClick: () => {
				void this.openBlockingSelector();
			},
			listElement: this.blockingList,
		});

		this.renderDependencyLists();
	}

	protected createUserFieldByConfig(
		container: HTMLElement,
		fieldConfig: ModalFieldConfigLike
	): void {
		const userField = this.plugin.settings.userFields?.find((f) => f.id === fieldConfig.id);
		if (!userField) return;

		createTaskModalConfiguredUserField(this.getUserFieldContext(), {
			container,
			field: userField,
			values: this.userFields,
			inputRefs: this.userFieldInputs,
			toggleRefs: this.userFieldToggles,
			onValueChange: (key, value) => {
				this.userFields[key] = value;
				this.onFormStateChanged();
			},
		});
	}

	protected updateUserFieldControls(): void {
		updateTaskModalUserFieldControls({
			fields: this.plugin.settings?.userFields || [],
			values: this.userFields,
			inputRefs: this.userFieldInputs,
			toggleRefs: this.userFieldToggles,
		});
	}

	protected createUserFields(container: HTMLElement): void {
		createTaskModalUserFieldsSection(this.getUserFieldContext(), {
			container,
			fields: this.plugin.settings?.userFields || [],
			values: this.userFields,
			inputRefs: this.userFieldInputs,
			toggleRefs: this.userFieldToggles,
			onValueChange: (key, value) => {
				this.userFields[key] = value;
				this.onFormStateChanged();
			},
		});
	}

	protected createActionButtons(container: HTMLElement): void {
		const leadingButtons: TaskModalLeadingButton[] = [];
		if (this.isEditMode()) {
			leadingButtons.push({
				className: "tn-task-modal__open-note-button",
				text: this.t("modals.task.buttons.openNote"),
				onClick: () => {
					void this.openTaskNote();
				},
			});
		}

		createTaskModalActionButtons(this.getActionButtonContext(), {
			container,
			leadingButtons,
			saveText: this.isCreationMode()
				? this.t("modals.taskCreation.title")
				: this.t("common.done"),
			cancelText: `Esc ${this.t("common.close")}`,
			onSave: () => this.handleSave(),
			onSaved: () => {
				this.close();
			},
			onCancel: () => {
				this.close();
			},
		});
	}

	protected getActionButtonContext(): TaskModalActionButtonContext {
		return {
			translate: (key: string) => this.t(key),
		};
	}

	protected expandModal(): void {
		if (this.isExpanded) return;

		this.isExpanded = true;
		expandTaskModalDetailsLayout({
			containerEl: this.containerEl,
			detailsContainer: this.detailsContainer,
			splitRightColumn: this.splitRightColumn,
		});
	}

	protected showDateContextMenu(_event: UIEvent, type: "due" | "scheduled"): void {
		showTaskModalDateContextMenu(this.getActionMenuContext(), type);
	}

	protected showStatusContextMenu(event: UIEvent): void {
		showTaskModalStatusContextMenu(this.getActionMenuContext(), event);
	}

	protected showPriorityContextMenu(event: UIEvent): void {
		showTaskModalPriorityContextMenu(this.getActionMenuContext(), event);
	}

	protected showRecurrenceContextMenu(event: UIEvent): void {
		showTaskModalRecurrenceContextMenu(this.getActionMenuContext(), event);
	}

	protected showReminderContextMenu(event: UIEvent): void {
		showTaskModalReminderContextMenu(this.getActionMenuContext(), event);
	}

	protected getActionMenuState(): TaskModalActionMenuState {
		return createTaskModalActionMenuState({
			title: this.title,
			status: this.status,
			priority: this.priority,
			dueDate: this.dueDate,
			scheduledDate: this.scheduledDate,
			recurrenceRule: this.recurrenceRule,
			recurrenceAnchor: this.recurrenceAnchor,
			reminders: this.reminders,
		});
	}

	protected getActionMenuContext(): TaskModalActionMenuContext {
		return createTaskModalActionMenuContext({
			app: this.app,
			plugin: this.plugin,
			translate: (key, params) => this.t(key, params),
			getState: () => this.getActionMenuState(),
			setDueDate: (value) => {
				this.dueDate = value;
			},
			setScheduledDate: (value) => {
				this.scheduledDate = value;
			},
			setStatus: (value) => {
				this.status = value;
			},
			setPriority: (value) => {
				this.priority = value;
			},
			setRecurrenceRule: (value) => {
				this.recurrenceRule = value;
			},
			setRecurrenceAnchor: (anchor) => {
				this.recurrenceAnchor = anchor;
			},
			setReminders: (reminders) => {
				this.reminders = reminders;
			},
			onChange: () => {
				this.updateIconStates();
				this.onFormStateChanged();
			},
		});
	}

	protected updateDateIconState(): void {
		this.updateIconStates();
	}

	protected updateStatusIconState(): void {
		this.updateIconStates();
	}

	protected updatePriorityIconState(): void {
		this.updateIconStates();
	}

	protected updateRecurrenceIconState(): void {
		this.updateIconStates();
	}

	protected updateReminderIconState(): void {
		this.updateIconStates();
	}

	protected updateIconStates(): void {
		const actionMenuState = this.getActionMenuState();

		updateTaskModalActionIconStates(
			this.actionBar,
			{ translate: (key, params) => this.t(key, params) },
			buildTaskModalActionIconState(actionMenuState, {
				statusConfigs: this.plugin.settings.customStatuses || [],
				priorityConfigs: this.plugin.settings.customPriorities || [],
			})
		);
		this.updatePropertyFieldStates();
	}

	protected focusTitleInput(): void {
		this.focusGuards.focusTitleInput(this.titleInput);
	}

	/**
	 * Let navigation paint before tearing down CodeMirror. This is reserved for
	 * flows that immediately replace the current workspace view; normal modal
	 * closes still clean up synchronously.
	 */
	protected deferDetailsEditorCleanupOnClose(): void {
		this.deferDetailsEditorCleanup = true;
	}

	protected getInitialFocusDelay(): number {
		return this.focusGuards.getInitialFocusDelay();
	}

	protected isMobileLikeEnvironment(): boolean {
		return this.focusGuards.isMobileLikeEnvironment();
	}

	private attachTitleFocusScrollGuard(input: TaskModalTitleInputElement): void {
		this.focusGuards.attachTitleFocusScrollGuard(input);
	}

	protected attachMobileKeyboardScrollGuard(
		input: HTMLElement,
		options?: TaskModalMobileKeyboardScrollGuardOptions
	): void {
		this.focusGuards.attachMobileKeyboardScrollGuard(input, options);
	}

	protected addProject(file: TAbstractFile): void {
		if (file instanceof TFile) {
			const projectItem = createTaskModalProjectItemFromFile(
				file,
				this.buildProjectReference(file, this.getCurrentTaskPath() || "")
			);

			if (hasTaskModalProjectItem(this.selectedProjectItems, projectItem)) {
				return;
			}

			this.selectedProjectItems.push(projectItem);
		}
		this.updateProjectsFromFiles();
		this.renderProjectsList();
	}

	protected removeProject(item: TaskModalProjectItem): void {
		this.selectedProjectItems = removeTaskModalProjectItem(this.selectedProjectItems, item);
		this.updateProjectsFromFiles();
		this.renderProjectsList();
	}

	protected updateProjectsFromFiles(): void {
		this.projects = getTaskModalProjectsValue(this.selectedProjectItems);
		this.onFormStateChanged();
	}

	protected buildProjectReference(targetFile: TFile, sourcePath: string): string {
		return generateLink(
			this.app,
			targetFile,
			sourcePath,
			"",
			"",
			this.plugin.settings.useFrontmatterMarkdownLinks
		);
	}

	protected initializeProjectsFromStrings(projects: string[]): void {
		this.selectedProjectItems = [];
		this.addProjectsFromStrings(projects);
		// Don't render immediately - let the caller decide when to render
	}

	protected addProjectsFromStrings(projects: string[]): void {
		this.selectedProjectItems = addTaskModalProjectItemsFromStrings(
			this.selectedProjectItems,
			projects,
			this.getProjectStringContext()
		);
		this.updateProjectsFromFiles();
		// Don't render immediately - let the caller decide when to render
	}

	private getProjectStringContext(): TaskModalProjectStringContext {
		return {
			sourcePath: this.getCurrentTaskPath() || "",
			getMarkdownFiles: () => this.getMarkdownFiles(),
			resolveLink: (linkPath, sourcePath) => this.resolveLink(linkPath, sourcePath),
		};
	}

	protected renderProjectsList(): void {
		renderTaskModalProjectsList({
			app: this.app,
			listEl: this.projectsList,
			items: this.selectedProjectItems,
			sourcePath: this.getCurrentTaskPath() || "",
			translate: (key, params) => this.t(key, params),
			onRemove: (item) => this.removeProject(item),
		});
	}

	// Subtask management methods
	protected async openSubtaskSelector(): Promise<void> {
		await openTaskModalTaskSelector({
			plugin: this.plugin,
			getCandidates: (allTasks) =>
				getTaskModalSubtaskCandidates(
					allTasks,
					this.selectedSubtaskFiles,
					this.getCurrentTaskPath()
				),
			onSelect: (subtask) => {
				const file = this.app.vault.getAbstractFileByPath(subtask.path);
				if (file) {
					this.addSubtask(file);
				}
			},
			translate: (key) => this.t(key),
			noEligibleTasksMessageKey: "modals.task.organization.notices.noEligibleSubtasks",
			openFailedMessageKey: "modals.task.organization.notices.subtaskSelectFailed",
			logOperation: "open-subtask-selector",
		});
	}

	protected addSubtask(file: TAbstractFile): void {
		const nextSubtaskFiles = addTaskModalSubtaskFile(this.selectedSubtaskFiles, file);
		if (nextSubtaskFiles.length === this.selectedSubtaskFiles.length) {
			return;
		}

		this.selectedSubtaskFiles = nextSubtaskFiles;
		void this.renderSubtasksList();
		this.onFormStateChanged();
	}

	protected removeSubtask(file: TAbstractFile): void {
		this.selectedSubtaskFiles = removeTaskModalSubtaskFile(this.selectedSubtaskFiles, file);
		void this.renderSubtasksList();
		this.onFormStateChanged();
	}

	protected async renderSubtasksList(): Promise<void> {
		await renderTaskModalSubtasksList({
			app: this.app,
			listEl: this.subtasksList,
			files: this.selectedSubtaskFiles,
			sourcePath: this.getCurrentTaskPath() || "",
			getCachedTaskInfo: (path) => this.plugin.cacheManager.getCachedTaskInfo(path),
			createTaskCard: (taskInfo) =>
				createTaskCard(taskInfo, this.plugin, undefined, {
					layout: "default",
					showSecondaryBadges: false,
					enableHoverPreview: false,
				}),
			translate: (key, params) => this.t(key, params),
			onRemove: (file) => this.removeSubtask(file),
		});
	}

	protected renderOrganizationLists(): void {
		this.renderProjectsList();
		void this.renderSubtasksList();
	}

	protected toggleProjectsList(): void {
		if (!this.projectsList) return;
		this.projectsList.toggleClass("collapsed", !this.projectsList.hasClass("collapsed"));
	}

	protected toggleSubtasksList(): void {
		if (!this.subtasksList) return;
		this.subtasksList.toggleClass("collapsed", !this.subtasksList.hasClass("collapsed"));
	}

	protected validateForm(): boolean {
		return this.title.trim().length > 0;
	}

	protected focusNextField(): boolean {
		// Try to focus the contexts input as the next field after details
		const nextField = this.contextsInput || this.tagsInput || this.timeEstimateInput;
		if (!nextField) {
			return false;
		}

		window.setTimeout(() => {
			nextField.focus();
		}, 50);
		return true;
	}

	protected focusPreviousField(): boolean {
		if (!this.titleInput) {
			return false;
		}

		window.setTimeout(() => {
			this.titleInput?.focus();
		}, 50);
		return true;
	}

	onClose(): void {
		// Clean up keyboard handler
		if (this.keyboardHandler) {
			this.containerEl.removeEventListener("keydown", this.keyboardHandler);
			this.keyboardHandler = null;
		}
		this.focusGuards.destroy();

		const detailsEditor = this.detailsMarkdownEditor;
		this.detailsMarkdownEditor = null;
		if (this.deferDetailsEditorCleanup && detailsEditor) {
			const cleanupWindow = this.containerEl.ownerDocument.defaultView ?? window;
			if (typeof cleanupWindow.requestIdleCallback === "function") {
				cleanupWindow.requestIdleCallback(
					() => destroyTaskModalDetailsEditor(detailsEditor),
					{ timeout: 50 }
				);
			} else {
				cleanupWindow.setTimeout(() => destroyTaskModalDetailsEditor(detailsEditor), 50);
			}
		} else {
			destroyTaskModalDetailsEditor(detailsEditor);
		}
		super.onClose();
	}
}
