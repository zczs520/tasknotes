import { App, Notice, setIcon, TFile } from "obsidian";
import TaskNotesPlugin from "../main";
import { TaskModal } from "./TaskModal";
import { TaskInfo } from "../types";
import { sanitizeTags } from "../utils/helpers";
import {
	NaturalLanguageParser,
	ParsedTaskData as NLParsedTaskData,
} from "../services/NaturalLanguageParser";
import { combineDateAndTime } from "../utils/dateUtils";

import type {
	EmbeddableMarkdownEditor,
	MarkdownEditorProps,
} from "../editor/EmbeddableMarkdownEditor";
import { createNLPAutocomplete } from "../editor/NLPCodeMirrorAutocomplete";
import { buildCreationBlockingUpdates, buildTaskCreationData } from "./taskCreationData";
import {
	buildTaskCreationFormState,
	type TaskCreationPrepopulatedValues,
} from "./taskCreationFormState";
import { applyTaskCreationSubtaskAssignments } from "./taskCreationSubtasks";
import { buildTaskEditChangesFromModalState } from "./taskEditChangeState";
import {
	applyTaskEditSubtaskChanges,
	hasTaskEditSubtaskChanges,
} from "./taskEditSubtasks";
import { NLPSuggest } from "./taskCreationSuggest";
import { shouldShowFilenameShortenedNotice } from "../utils/filenameGenerator";
import { setTaskModalDetailsEditorValue } from "./taskModalDetailsEditor";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Modals/TaskCreationModal" });
export type { StatusSuggestion } from "./taskCreationSuggest";

const TASK_CREATION_FAILURE_PREFIX = "Failed to create task: ";
const NLP_AUTOFILL_DEBOUNCE_MS = 150;
const NLP_TAB_ORDER_SELECTOR = [
	"button",
	"a[href]",
	"input",
	"select",
	"textarea",
	"[tabindex]:not([tabindex='-1'])",
	".tn-task-modal__markdown-editor--nlp",
].join(", ");
const NATIVE_FOCUSABLE_TAG_NAMES = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);

type PotentiallyDisabledElement = HTMLElement & { disabled?: boolean };

function isFocusableModalElement(element: HTMLElement): boolean {
	if ((element as PotentiallyDisabledElement).disabled) {
		return false;
	}

	return element.tabIndex >= 0 || NATIVE_FOCUSABLE_TAG_NAMES.has(element.tagName);
}

export function getTaskCreationFailureNoticeMessage(error: unknown): string {
	const rawMessage = error instanceof Error && error.message ? error.message : String(error);
	return rawMessage.startsWith(TASK_CREATION_FAILURE_PREFIX)
		? rawMessage.slice(TASK_CREATION_FAILURE_PREFIX.length)
		: rawMessage;
}

export interface TaskCreationOptions {
	prePopulatedValues?: TaskCreationPrepopulatedValues;
	onTaskCreated?: (task: TaskInfo) => void;
	creationContext?: "manual-creation" | "modal-inline-creation"; // Folder behavior context
}

type OpenTaskAfterCreationMode = TaskNotesPlugin["settings"]["openTaskAfterCreation"];
type CreatedTaskOpenMode = Exclude<OpenTaskAfterCreationMode, "none">;

export function shouldOpenCreatedTaskAfterSave(
	mode: OpenTaskAfterCreationMode | undefined,
	options: { createAnother?: boolean },
	hasCreationCallback: boolean
): mode is CreatedTaskOpenMode {
	return (
		(mode === "same-tab" || mode === "new-tab") &&
		!options.createAnother &&
		!hasCreationCallback
	);
}

export async function openCreatedTaskFileAfterSave(
	app: App,
	file: TFile,
	mode: CreatedTaskOpenMode
): Promise<void> {
	const leaf = mode === "new-tab" ? app.workspace.getLeaf("tab") : app.workspace.getLeaf(false);
	await leaf.openFile(file);
}

function createEmbeddableMarkdownEditor(
	app: App,
	container: HTMLElement,
	options: Partial<MarkdownEditorProps>
): EmbeddableMarkdownEditor {
	// Lazy-load because the editor module resolves Obsidian internals during evaluation.
	/* eslint-disable @typescript-eslint/no-require-imports -- Modal editor is lazy-loaded to avoid evaluating Obsidian internals during import. */
	const editorModule =
		require("../editor/EmbeddableMarkdownEditor") as typeof import("../editor/EmbeddableMarkdownEditor");
	/* eslint-enable @typescript-eslint/no-require-imports -- Re-enable after the isolated lazy import. */
	return new editorModule.EmbeddableMarkdownEditor(app, container, options);
}

export class TaskCreationModal extends TaskModal {
	private options: TaskCreationOptions;
	private nlParser: NaturalLanguageParser;
	private nlInput: HTMLTextAreaElement = undefined as unknown as HTMLTextAreaElement; // Legacy - keeping for compatibility
	private nlMarkdownEditor: EmbeddableMarkdownEditor | null = null;
	private nlpSuggest: NLPSuggest | null = null; // Will be replaced with CodeMirror autocomplete
	private nlpAutofillTimer: number | null = null;
	private draftTask: TaskInfo | null = null;
	private draftPath: string | null = null;
	private draftCreationPromise: Promise<boolean> | null = null;
	private autoCreateEnabled = false;
	private autoSaveReady = false;
	private autoSaveTimer: number | null = null;
	private autoSaveInFlight: Promise<boolean> | null = null;
	private autoSaveQueued = false;
	private closeInProgress = false;
	private navigationCleanupScheduled = false;
	private initialTags = "";
	private initialBlockedBy: TaskInfo["blockedBy"] = [];
	private initialBlockingPaths: string[] = [];
	private unresolvedBlockingEntries: string[] = [];
	private static readonly AUTO_SAVE_DELAY_MS = 450;

	// Track event listeners for cleanup
	private eventListeners: Array<{
		element: HTMLElement | HTMLTextAreaElement;
		event: string;
		handler: EventListener;
	}> = [];

	constructor(app: App, plugin: TaskNotesPlugin, options: TaskCreationOptions = {}) {
		super(app, plugin);
		this.options = options;
		this.nlParser = NaturalLanguageParser.fromPlugin(plugin);
	}

	getModalTitle(): string {
		return this.t("modals.taskCreation.title");
	}

	protected isCreationMode(): boolean {
		return true;
	}

	protected getCurrentTaskPath(): string | undefined {
		return this.draftTask?.path;
	}

	onOpen(): void {
		this.autoCreateEnabled = true;
		super.onOpen();
		this.createHeaderOpenNoteButton();
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

	/**
	 * Add an event listener and track it for cleanup
	 */
	private addTrackedEventListener(
		element: HTMLElement | HTMLTextAreaElement,
		event: string,
		handler: EventListener
	): void {
		element.addEventListener(event, handler);
		this.eventListeners.push({ element, event, handler });
	}

	/**
	 * Remove all tracked event listeners
	 */
	private removeAllEventListeners(): void {
		for (const { element, event, handler } of this.eventListeners) {
			element.removeEventListener(event, handler);
		}
		this.eventListeners = [];
	}

	/**
	 * Keep the task title as the visual anchor and expose NLP as an optional capture aid.
	 */
	protected createPrimaryInput(container: HTMLElement): void {
		this.createTitleInput(container);
		if (this.plugin.settings.enableNaturalLanguageInput) {
			this.createNaturalLanguageInput(container);
		}
		this.isExpanded = true;
		this.containerEl.addClass("expanded");
	}

	/**
	 * Override to re-render projects list after modal content is created
	 */
	protected createAdditionalSections(container: HTMLElement): void {
		// Re-render projects list if pre-populated values were applied or defaults are set
		if (
			(this.options.prePopulatedValues && this.options.prePopulatedValues.projects) ||
			this.selectedProjectItems.length > 0
		) {
			this.renderProjectsList();
		}
	}

	private createNaturalLanguageInput(container: HTMLElement): void {
		const nlContainer = container.createDiv("nl-input-container");

		// Create markdown editor container
		const editorContainer = nlContainer.createDiv(
			"tn-task-modal__markdown-editor tn-task-modal__markdown-editor--nlp"
		);
		editorContainer.setAttribute("role", "textbox");
		editorContainer.setAttribute("aria-label", this.t("modals.taskCreation.nlPlaceholder"));
		editorContainer.setAttribute("aria-multiline", "true");

		try {
			// Create NLP autocomplete extension for @, #, +, status triggers
			// Returns array: [autocomplete, keymap]
			const nlpAutocomplete = createNLPAutocomplete(this.plugin);

			// Create embeddable markdown editor with autocomplete
			this.nlMarkdownEditor = createEmbeddableMarkdownEditor(this.app, editorContainer, {
				value: "",
				placeholder: this.t("modals.taskCreation.nlPlaceholder"),
				cls: "nlp-editor",
				extensions: nlpAutocomplete, // Add autocomplete extensions (array)
				enterVimInsertMode: true, // Auto-enter insert mode when vim is enabled (#1410)
				onChange: (value) => {
					this.scheduleNaturalLanguageAutofill(value);
				},
				onSubmit: (_editor, shift) => {
					// Ctrl+Enter - save the task
					void this.handleSubmitShortcut(shift);
				},
				onEscape: () => {
					// ESC - close the modal (only when not in vim insert mode)
					// Vim mode will handle its own ESC to exit insert mode
					this.close();
				},
				onTab: (_editor, shift) => {
					if (shift) {
						return this.focusPreviousNaturalLanguageField(editorContainer);
					}
					return this.focusNextNaturalLanguageField(editorContainer);
				},
				onEnter: (editor, mod, shift) => {
					if (mod) {
						// Ctrl/Cmd+Enter - save (already handled by onSubmit)
						return true;
					}
					if (shift) {
						// Shift+Enter - allow newline
						return false;
					}
					// Normal Enter - allow new line
					return false;
				},
			});
		} catch (error) {
			tasknotesLogger.error("Failed to create NLP markdown editor:", {
				category: "persistence",
				operation: "create-nlp-markdown-editor",
				error: error,
			});
			// Fallback to textarea if editor creation fails
			this.nlInput = editorContainer.createEl("textarea", {
				cls: "nl-input",
				attr: {
					placeholder: this.t("modals.taskCreation.nlPlaceholder"),
					rows: "3",
				},
			});

			// Event listeners for fallback - track them for cleanup
			const inputHandler = () => this.scheduleNaturalLanguageAutofill(this.nlInput.value);
			this.addTrackedEventListener(this.nlInput, "input", inputHandler);

			const keydownHandler = (e: Event) => {
				const input = this.nlInput.value.trim();
				if (!input) return;

				const keyEvent = e as KeyboardEvent;
				if (keyEvent.key === "Enter" && (keyEvent.ctrlKey || keyEvent.metaKey)) {
					keyEvent.preventDefault();
					void this.handleSubmitShortcut(keyEvent.shiftKey);
				} else if (keyEvent.key === "Tab" && keyEvent.shiftKey) {
					keyEvent.preventDefault();
					this.titleInput?.focus();
				}
			};
			this.addTrackedEventListener(this.nlInput, "keydown", keydownHandler);

			// Initialize auto-suggestion for fallback
			this.nlpSuggest = new NLPSuggest(this.app, this.nlInput, this.plugin);
		}
	}

	private focusPreviousNaturalLanguageField(editorContainer: HTMLElement): boolean {
		const root = this.modalEl.contains(editorContainer) ? this.modalEl : this.contentEl;
		const orderedElements = Array.from(
			root.querySelectorAll<HTMLElement>(NLP_TAB_ORDER_SELECTOR)
		);
		const currentIndex = orderedElements.findIndex(
			(element) => element === editorContainer || editorContainer.contains(element)
		);

		if (currentIndex <= 0) {
			return true;
		}

		const previousElement = orderedElements
			.slice(0, currentIndex)
			.reverse()
			.find(isFocusableModalElement);

		if (previousElement) {
			window.setTimeout(() => {
				previousElement.focus();
			}, 50);
		}

		return true;
	}

	private focusNextNaturalLanguageField(editorContainer: HTMLElement): boolean {
		const root = this.modalEl.contains(editorContainer) ? this.modalEl : this.contentEl;
		const orderedElements = Array.from(
			root.querySelectorAll<HTMLElement>(NLP_TAB_ORDER_SELECTOR)
		);
		const currentIndex = orderedElements.findIndex(
			(element) => element === editorContainer || editorContainer.contains(element)
		);
		const nextElement = orderedElements
			.slice(currentIndex + 1)
			.find(isFocusableModalElement);

		if (nextElement) {
			window.setTimeout(() => nextElement.focus(), 50);
		}

		return true;
	}

	protected focusTitleInput(): void {
		if (!this.plugin.settings.enableNaturalLanguageInput) {
			super.focusTitleInput();
			return;
		}

		window.setTimeout(() => {
			const codeMirror = this.nlMarkdownEditor?.editor?.cm;
			if (codeMirror) {
				codeMirror.focus();
				codeMirror.scrollDOM.scrollTop = 0;
				return;
			}
			if (this.nlInput) {
				this.nlInput.focus({ preventScroll: true });
				this.nlInput.select();
				return;
			}
			super.focusTitleInput();
		}, this.getInitialFocusDelay());
	}

	private scheduleNaturalLanguageAutofill(value: string): void {
		if (this.nlpAutofillTimer !== null) {
			window.clearTimeout(this.nlpAutofillTimer);
			this.nlpAutofillTimer = null;
		}

		const input = value.trim();
		if (!input) return;

		this.nlpAutofillTimer = window.setTimeout(() => {
			this.nlpAutofillTimer = null;
			this.parseAndFillForm(input);
		}, NLP_AUTOFILL_DEBOUNCE_MS);
	}

	/**
	 * Get the current NLP input value from either markdown editor or fallback textarea
	 */
	private getNLPInputValue(): string {
		if (this.nlMarkdownEditor) {
			return this.nlMarkdownEditor.value;
		} else if (this.nlInput) {
			return this.nlInput.value;
		}
		return "";
	}

	protected createActionBar(container: HTMLElement): void {
		super.createActionBar(container);
	}

	protected createActionButtons(_container: HTMLElement): void {
		// Creation is committed when the modal opens and every subsequent edit is autosaved.
	}

	private parseAndFillForm(input: string): void {
		const parsed = this.nlParser.parseInput(input);
		this.applyParsedData(parsed);
	}

	private applyParsedData(parsed: NLParsedTaskData): void {
		let titleChanged = false;
		let detailsChanged = false;
		let contextsChanged = false;
		let tagsChanged = false;
		let timeEstimateChanged = false;
		let propertyStateChanged = false;
		let formStateChanged = false;

		if (parsed.title && parsed.title !== this.title) {
			this.title = parsed.title;
			titleChanged = true;
			formStateChanged = true;
		}
		if (parsed.status && parsed.status !== this.status) {
			this.status = parsed.status;
			propertyStateChanged = true;
			formStateChanged = true;
		}
		if (parsed.priority && parsed.priority !== this.priority) {
			this.priority = parsed.priority;
			propertyStateChanged = true;
			formStateChanged = true;
		}

		// Handle due date with time
		if (parsed.dueDate) {
			const dueDate = parsed.dueTime
				? combineDateAndTime(parsed.dueDate, parsed.dueTime)
				: parsed.dueDate;
			if (dueDate !== this.dueDate) {
				this.dueDate = dueDate;
				propertyStateChanged = true;
				formStateChanged = true;
			}
		}

		// Handle scheduled date with time
		if (parsed.scheduledDate) {
			const scheduledDate = parsed.scheduledTime
				? combineDateAndTime(parsed.scheduledDate, parsed.scheduledTime)
				: parsed.scheduledDate;
			if (scheduledDate !== this.scheduledDate) {
				this.scheduledDate = scheduledDate;
				propertyStateChanged = true;
				formStateChanged = true;
			}
		}

		if (parsed.contexts && parsed.contexts.length > 0) {
			const contexts = parsed.contexts.join(", ");
			if (contexts !== this.contexts) {
				this.contexts = contexts;
				contextsChanged = true;
				formStateChanged = true;
			}
		}
		// Projects will be handled in the form input update section below
		if (parsed.tags && parsed.tags.length > 0) {
			const tags = sanitizeTags(parsed.tags.join(", "));
			if (tags !== this.tags) {
				this.tags = tags;
				tagsChanged = true;
				formStateChanged = true;
			}
		}
		if (parsed.details && parsed.details !== this.details) {
			this.details = parsed.details;
			detailsChanged = true;
			formStateChanged = true;
		}
		if (parsed.recurrence && parsed.recurrence !== this.recurrenceRule) {
			this.recurrenceRule = parsed.recurrence;
			propertyStateChanged = true;
			formStateChanged = true;
		}
		if (parsed.estimate !== undefined) {
			const timeEstimate = parsed.estimate > 0 ? parsed.estimate : 0;
			if (timeEstimate !== this.timeEstimate) {
				this.timeEstimate = timeEstimate;
				timeEstimateChanged = true;
				propertyStateChanged = true;
				formStateChanged = true;
			}
			if (timeEstimateChanged && this.timeEstimateInput) {
				this.timeEstimateInput.value =
					this.timeEstimate > 0 ? this.timeEstimate.toString() : "";
			}
		}

		// Update form inputs if they exist
		if (titleChanged && this.titleInput) this.titleInput.value = this.title;
		if (detailsChanged && this.detailsInput) this.detailsInput.value = this.details;
		if (detailsChanged) setTaskModalDetailsEditorValue(this.detailsMarkdownEditor, this.details);
		if (contextsChanged && this.contextsInput) this.contextsInput.value = this.contexts;
		if (tagsChanged && this.tagsInput) this.tagsInput.value = this.tags;

		// Handle projects differently - they use file selection, not text input
		if (parsed.projects && parsed.projects.length > 0) {
			const projectsBeforeUpdate = this.projects;
			this.addProjectsFromStrings(parsed.projects);
			if (this.projects !== projectsBeforeUpdate) {
				this.renderProjectsList();
				formStateChanged = true;
			}
		}

		// Handle user-defined fields
		if (parsed.userFields) {
			let userFieldsChanged = false;
			for (const [fieldId, value] of Object.entries(parsed.userFields)) {
				const userField = this.plugin.settings.userFields?.find((f) => f.id === fieldId);
				if (
					userField &&
					JSON.stringify(this.userFields[userField.key]) !== JSON.stringify(value)
				) {
					this.userFields[userField.key] = value;
					userFieldsChanged = true;
				}
			}
			if (userFieldsChanged) {
				this.updateUserFieldControls();
				formStateChanged = true;
			}
		}

		if (propertyStateChanged) {
			this.updateIconStates();
		}
		if (formStateChanged) {
			this.onFormStateChanged();
		}
	}

	async initializeFormData(): Promise<void> {
		const formState = buildTaskCreationFormState({
			defaultPriority: this.plugin.settings.defaultTaskPriority,
			defaultStatus: this.plugin.settings.defaultTaskStatus,
			taskCreationDefaults: this.plugin.settings.taskCreationDefaults,
			taskTag: this.plugin.settings.taskTag,
			userFields: this.plugin.settings.userFields,
			prePopulatedValues: this.options.prePopulatedValues,
		});

		this.title = formState.title;
		this.dueDate = formState.dueDate;
		this.scheduledDate = formState.scheduledDate;
		this.priority = formState.priority;
		this.status = formState.status;
		this.contexts = formState.contexts;
		this.tags = formState.tags;
		this.timeEstimate = formState.timeEstimate;
		this.recurrenceRule = formState.recurrenceRule;
		this.recurrenceAnchor = formState.recurrenceAnchor;
		this.reminders = formState.reminders;
		this.userFields = formState.userFields;

		if (formState.projectStrings.length > 0) {
			this.initializeProjectsFromStrings(formState.projectStrings);
		}

		this.details = this.normalizeDetails(this.details);
		this.originalDetails = this.details;

		if (this.autoCreateEnabled) {
			await this.ensureDraftCreated();
			this.autoSaveReady = true;
		}
	}

	protected async handleSubmitShortcut(shift: boolean): Promise<void> {
		void shift;
		await this.flushAutoSave();
	}

	async handleSave(_options: { createAnother?: boolean } = {}): Promise<void> {
		if (!this.autoCreateEnabled) {
			this.prepareNaturalLanguageState();
			await this.ensureDraftCreated();
			return;
		}
		await this.flushAutoSave();
	}

	private prepareNaturalLanguageState(): void {
		if (this.nlpAutofillTimer !== null) {
			window.clearTimeout(this.nlpAutofillTimer);
			this.nlpAutofillTimer = null;
		}

		// If NLP is enabled and there's content in the NL field, parse it first
		if (this.plugin.settings.enableNaturalLanguageInput) {
			const nlContent = this.getNLPInputValue().trim();
			if (nlContent && !this.title.trim()) {
				// Only auto-parse if no title has been manually entered
				const parsed = this.nlParser.parseInput(nlContent);
				this.applyParsedData(parsed);
			}
		}
	}

	private getDraftTitle(): string {
		const enteredTitle = this.title.trim();
		if (enteredTitle) return enteredTitle;
		if (this.draftTask?.title) return this.draftTask.title;

		const translated = this.t("modals.task.untitledTitlePlaceholder").trim();
		return translated || "Untitled Task";
	}

	private async ensureDraftCreated(): Promise<boolean> {
		if (this.draftTask) return true;
		if (this.draftCreationPromise) return this.draftCreationPromise;

		this.draftCreationPromise = this.createInitialDraft();
		try {
			return await this.draftCreationPromise;
		} finally {
			this.draftCreationPromise = null;
		}
	}

	private async createInitialDraft(): Promise<boolean> {
		let result: Awaited<ReturnType<TaskNotesPlugin["taskService"]["createTask"]>>;
		try {
			const taskData = this.buildTaskData(this.getDraftTitle());
			result = await this.plugin.taskService.createTask(taskData, {
				applyDefaults: false,
			});
		} catch (error) {
			tasknotesLogger.error("Failed to create task draft:", {
				category: "persistence",
				operation: "create-task-draft",
				error,
			});
			const message = getTaskCreationFailureNoticeMessage(error);
			new Notice(this.t("modals.taskCreation.notices.failure", { message }));
			return false;
		}

		if (!result.taskInfo) {
			const error = new Error("Task creation returned no task data");
			tasknotesLogger.error("Failed to create task draft:", {
				category: "persistence",
				operation: "create-task-draft",
				error,
			});
			new Notice(
				this.t("modals.taskCreation.notices.failure", { message: error.message })
			);
			return false;
		}

		let createdTask = result.taskInfo;
		this.draftTask = createdTask;
		this.draftPath = result.file.path;

		try {
			if (
				shouldShowFilenameShortenedNotice(
					this.plugin.settings,
					createdTask.title,
					result.file.basename
				)
			) {
				new Notice(
					this.t("modals.taskCreation.notices.successShortened", {
						title: createdTask.title,
					})
				);
			}

			createdTask = await this.applyInitialRelationships(createdTask);
			this.draftTask = createdTask;
		} catch (error) {
			tasknotesLogger.error("Failed to apply initial task draft relationships:", {
				category: "persistence",
				operation: "initialize-task-draft-relationships",
				error,
			});
			new Notice(
				this.t("modals.taskCreation.notices.failure", {
					message: error instanceof Error ? error.message : String(error),
				})
			);
		}

		this.originalDetails = createdTask.details ?? this.details;
		if (!this.details && createdTask.details) {
			this.details = createdTask.details;
			this.originalDetails = createdTask.details;
		}
		this.initialTags = this.tags;
		this.initialBlockedBy = (this.blockedByItems ?? []).map((item) => ({
			...item.dependency,
		}));
		this.initialBlockingPaths = this.blockingItems.flatMap((item) =>
			item.path ? [item.path] : []
		);
		this.initialSubtaskFiles = [...this.selectedSubtaskFiles];

		try {
			this.options.onTaskCreated?.(createdTask);
		} catch (error) {
			tasknotesLogger.error("Task-created callback failed:", {
				category: "provider",
				operation: "notify-task-draft-created",
				error,
			});
		}
		return true;
	}

	private async applyInitialRelationships(createdTask: TaskInfo): Promise<TaskInfo> {
		if (this.blockingItems.length > 0) {
			const blockingUpdates = buildCreationBlockingUpdates(this.blockingItems);
			if (blockingUpdates.added.length > 0) {
				await this.plugin.taskService.updateBlockingRelationships(
					createdTask,
					blockingUpdates.added,
					[],
					blockingUpdates.raw
				);
			}
			if (blockingUpdates.unresolved.length > 0) {
				new Notice(
					this.t("modals.taskCreation.notices.blockingUnresolved", {
						entries: blockingUpdates.unresolved.join(", "),
					})
				);
			}
		}

		if (this.selectedSubtaskFiles.length > 0) {
			await this.applySubtaskAssignments(createdTask);
		}

		if (typeof this.plugin.cacheManager.getTaskInfo !== "function") {
			return createdTask;
		}
		return (await this.plugin.cacheManager.getTaskInfo(createdTask.path)) ?? createdTask;
	}

	protected onFormStateChanged(): void {
		if (!this.autoSaveReady || this.closeInProgress) return;

		if (this.autoSaveTimer !== null) {
			window.clearTimeout(this.autoSaveTimer);
		}
		this.autoSaveTimer = window.setTimeout(() => {
			this.autoSaveTimer = null;
			void this.flushAutoSave();
		}, TaskCreationModal.AUTO_SAVE_DELAY_MS);
	}

	private async flushAutoSave(): Promise<boolean> {
		this.prepareNaturalLanguageState();
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
			saved = await this.savePendingChanges();
		} while (saved && this.autoSaveQueued);
		return saved;
	}

	private async savePendingChanges(): Promise<boolean> {
		if (!(await this.ensureDraftCreated()) || !this.draftTask) return false;

		try {
			const effectiveTitle = this.title.trim() || this.draftTask.title;
			const result = buildTaskEditChangesFromModalState({
				app: this.app,
				task: this.draftTask,
				title: effectiveTitle,
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
				initialBlockedBy: this.initialBlockedBy ?? [],
				blockingItems: this.blockingItems,
				initialBlockingPaths: this.initialBlockingPaths,
				details: this.details,
				originalDetails: this.originalDetails,
				completedInstancesChanges: [],
				skippedInstancesChanges: [],
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
			this.unresolvedBlockingEntries = result.unresolvedBlockingEntries;

			const hasTaskChanges = Object.keys(result.changes).length > 0;
			const hasBlockingChanges =
				result.blockingUpdates.added.length > 0 ||
				result.blockingUpdates.removed.length > 0;
			const hasSubtaskChanges = hasTaskEditSubtaskChanges(
				this.initialSubtaskFiles,
				this.selectedSubtaskFiles
			);

			let updatedTask = this.draftTask;
			if (hasTaskChanges) {
				updatedTask = await this.plugin.taskService.updateTask(updatedTask, result.changes);
			}
			if (hasBlockingChanges) {
				await this.plugin.taskService.updateBlockingRelationships(
					updatedTask,
					result.blockingUpdates.added,
					result.blockingUpdates.removed,
					result.blockingUpdates.raw
				);
				updatedTask =
					(await this.plugin.cacheManager.getTaskInfo(updatedTask.path)) ?? updatedTask;
			}
			if (hasSubtaskChanges) {
				await this.applySubtaskChanges(updatedTask);
			}

			if (this.unresolvedBlockingEntries.length > 0) {
				new Notice(
					this.t("modals.taskCreation.notices.blockingUnresolved", {
						entries: this.unresolvedBlockingEntries.join(", "),
					})
				);
			}

			this.draftTask = updatedTask;
			this.draftPath = updatedTask.path;
			this.originalDetails = this.normalizeDetails(this.details);
			this.initialTags = this.tags;
			this.initialBlockedBy = this.blockedByItems.map((item) => ({ ...item.dependency }));
			this.initialBlockingPaths = this.blockingItems
				.flatMap((item) => (item.path ? [item.path] : []));
			this.initialSubtaskFiles = [...this.selectedSubtaskFiles];
			this.unresolvedBlockingEntries = [];
			return true;
		} catch (error) {
			tasknotesLogger.error("Failed to autosave task draft:", {
				category: "persistence",
				operation: "autosave-task-draft",
				error: error,
			});
			const message = getTaskCreationFailureNoticeMessage(error);
			new Notice(this.t("modals.taskCreation.notices.failure", { message }));
			return false;
		}
	}

	private async applySubtaskChanges(task: TaskInfo): Promise<void> {
		const parentTaskFile = this.app.vault.getAbstractFileByPath(task.path);
		if (!(parentTaskFile instanceof TFile)) return;

		await applyTaskEditSubtaskChanges({
			parentTaskFile,
			selectedSubtaskFiles: this.selectedSubtaskFiles,
			initialSubtaskFiles: this.initialSubtaskFiles,
			getTaskInfo: (path) => this.plugin.cacheManager.getTaskInfo(path),
			buildProjectReference: (targetFile, sourcePath) =>
				this.buildProjectReference(targetFile, sourcePath),
			updateTaskProjects: (subtaskInfo, projects) =>
				this.plugin.updateTaskProperty(subtaskInfo, "projects", projects),
			onAddError: (error) => {
				tasknotesLogger.error("Failed to assign subtask:", {
					category: "persistence",
					operation: "autosave-add-subtask",
					error,
				});
			},
			onRemoveError: (error) => {
				tasknotesLogger.error("Failed to remove subtask:", {
					category: "persistence",
					operation: "autosave-remove-subtask",
					error,
				});
			},
		});
	}

	protected async openTaskNote(): Promise<void> {
		try {
			if (!(await this.flushAutoSave()) || !this.draftTask) return;

			const file = this.app.vault.getAbstractFileByPath(this.draftTask.path);
			if (!(file instanceof TFile)) {
				new Notice(
					this.t("modals.taskEdit.notices.fileMissing", { path: this.draftTask.path })
				);
				return;
			}

			this.containerEl.hidden = true;
			const leaf = this.app.workspace.getLeaf(false);
			const openPromise = leaf.openFile(file);
			this.scheduleNavigationModalCleanup();
			await openPromise;
		} catch (error) {
			tasknotesLogger.error("Failed to open newly created task note:", {
				category: "persistence",
				operation: "open-created-task-note",
				error,
			});
			new Notice(this.t("modals.taskEdit.notices.openNoteFailure"));
		}
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

	private async openCreatedTaskIfConfigured(
		file: TFile,
		options: { createAnother?: boolean }
	): Promise<void> {
		const mode = this.plugin.settings.openTaskAfterCreation ?? "none";
		if (!shouldOpenCreatedTaskAfterSave(mode, options, Boolean(this.options.onTaskCreated))) {
			return;
		}

		try {
			await openCreatedTaskFileAfterSave(this.app, file, mode);
		} catch (error) {
			tasknotesLogger.error("Failed to open created task note:", {
				category: "persistence",
				operation: "open-created-task-note",
				error: error,
			});
			new Notice(this.t("modals.taskCreation.notices.openCreatedTaskFailure"));
		}
	}

	private buildTaskData(titleOverride?: string): Partial<TaskInfo> {
		const taskData = buildTaskCreationData({
			title: titleOverride ?? this.title,
			dueDate: this.dueDate,
			scheduledDate: this.scheduledDate,
			priority: this.priority,
			status: this.status,
			contexts: this.contexts,
			projects: this.projects,
			tags: this.tags,
			timeEstimate: this.timeEstimate,
			recurrenceRule: this.recurrenceRule,
			recurrenceAnchor: this.recurrenceAnchor,
			reminders: this.reminders,
			blockedByItems: this.blockedByItems,
			details: this.details,
			userFields: this.userFields,
			creationContext: this.options.creationContext,
			taskIdentificationMethod: this.plugin.settings.taskIdentificationMethod,
			taskTag: this.plugin.settings.taskTag,
			normalizeDetails: (value) => this.normalizeDetails(value),
		});
		const prePopulatedCustomFrontmatter = this.options.prePopulatedValues?.customFrontmatter;
		if (prePopulatedCustomFrontmatter) {
			taskData.customFrontmatter = {
				...prePopulatedCustomFrontmatter,
				...taskData.customFrontmatter,
			};
		}

		return taskData;
	}

	protected createTitleInput(container: HTMLElement): void {
		super.createTitleInput(container);
	}

	protected async applySubtaskAssignments(createdTask: TaskInfo): Promise<void> {
		const currentTaskFile = this.app.vault.getAbstractFileByPath(createdTask.path);
		if (!(currentTaskFile instanceof TFile)) return;

		await applyTaskCreationSubtaskAssignments({
			currentTaskFile,
			subtaskFiles: this.selectedSubtaskFiles,
			getTaskInfo: (path) => this.plugin.cacheManager.getTaskInfo(path),
			buildProjectReference: (targetFile, sourcePath) =>
				this.buildProjectReference(targetFile, sourcePath),
			updateTaskProjects: (subtaskInfo, projects) =>
				this.plugin.updateTaskProperty(subtaskInfo, "projects", projects),
			onError: (error) => {
				tasknotesLogger.error("Failed to assign subtask:", {
					category: "persistence",
					operation: "assign-subtask",
					error: error,
				});
			},
		});
	}

	/** Close immediately after the draft and all queued edits have been persisted. */
	forceClose(): void {
		super.close();
	}

	close(): void {
		if (!this.autoCreateEnabled) {
			this.forceClose();
			return;
		}
		if (this.closeInProgress) return;

		this.closeInProgress = true;
		void this.flushAutoSave().then(async (saved) => {
			this.closeInProgress = false;
			if (!saved) return;
			const draftFile = this.draftPath
				? this.app.vault.getAbstractFileByPath(this.draftPath)
				: null;
			if (draftFile instanceof TFile) {
				await this.openCreatedTaskIfConfigured(draftFile, {});
			}
			this.forceClose();
		});
	}

	onClose(): void {
		this.autoSaveReady = false;
		if (this.autoSaveTimer !== null) {
			window.clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}
		if (this.nlpAutofillTimer !== null) {
			window.clearTimeout(this.nlpAutofillTimer);
			this.nlpAutofillTimer = null;
		}
		// Clean up markdown editor if it exists
		if (this.nlMarkdownEditor) {
			this.nlMarkdownEditor.destroy();
			this.nlMarkdownEditor = null;
		}

		// Clean up NLP suggest
		if (this.nlpSuggest) {
			// NLPSuggest extends AbstractInputSuggest which has a close method
			this.nlpSuggest.close();
			this.nlpSuggest = null;
		}

		// Remove all tracked event listeners
		this.removeAllEventListeners();

		super.onClose();
	}
}
