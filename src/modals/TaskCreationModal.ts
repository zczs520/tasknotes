import { App, Notice, TFile } from "obsidian";
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
		super.focusTitleInput();
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

		if (parsed.title && parsed.title !== this.title) {
			this.title = parsed.title;
			titleChanged = true;
		}
		if (parsed.status && parsed.status !== this.status) {
			this.status = parsed.status;
			propertyStateChanged = true;
		}
		if (parsed.priority && parsed.priority !== this.priority) {
			this.priority = parsed.priority;
			propertyStateChanged = true;
		}

		// Handle due date with time
		if (parsed.dueDate) {
			const dueDate = parsed.dueTime
				? combineDateAndTime(parsed.dueDate, parsed.dueTime)
				: parsed.dueDate;
			if (dueDate !== this.dueDate) {
				this.dueDate = dueDate;
				propertyStateChanged = true;
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
			}
		}

		if (parsed.contexts && parsed.contexts.length > 0) {
			const contexts = parsed.contexts.join(", ");
			if (contexts !== this.contexts) {
				this.contexts = contexts;
				contextsChanged = true;
			}
		}
		// Projects will be handled in the form input update section below
		if (parsed.tags && parsed.tags.length > 0) {
			const tags = sanitizeTags(parsed.tags.join(", "));
			if (tags !== this.tags) {
				this.tags = tags;
				tagsChanged = true;
			}
		}
		if (parsed.details && parsed.details !== this.details) {
			this.details = parsed.details;
			detailsChanged = true;
		}
		if (parsed.recurrence && parsed.recurrence !== this.recurrenceRule) {
			this.recurrenceRule = parsed.recurrence;
			propertyStateChanged = true;
		}
		if (parsed.estimate !== undefined) {
			const timeEstimate = parsed.estimate > 0 ? parsed.estimate : 0;
			if (timeEstimate !== this.timeEstimate) {
				this.timeEstimate = timeEstimate;
				timeEstimateChanged = true;
				propertyStateChanged = true;
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
			}
		}

		if (propertyStateChanged) {
			this.updateIconStates();
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
	}

	protected async handleSubmitShortcut(shift: boolean): Promise<void> {
		await this.handleSave({ createAnother: shift });
	}

	async handleSave(options: { createAnother?: boolean } = {}): Promise<void> {
		// If NLP is enabled and there's content in the NL field, parse it first
		if (this.plugin.settings.enableNaturalLanguageInput) {
			const nlContent = this.getNLPInputValue().trim();
			if (nlContent && !this.title.trim()) {
				// Only auto-parse if no title has been manually entered
				const parsed = this.nlParser.parseInput(nlContent);
				this.applyParsedData(parsed);
			}
		}

		if (!this.validateForm()) {
			new Notice(this.t("modals.taskCreation.notices.titleRequired"));
			return;
		}

		try {
			const taskData = this.buildTaskData();
			// Disable defaults since they were already applied to form fields in initializeFormData()
			const result = await this.plugin.taskService.createTask(taskData, {
				applyDefaults: false,
			});
			let createdTask = result.taskInfo;

			if (
				shouldShowFilenameShortenedNotice(
					this.plugin.settings,
					result.taskInfo.title,
					result.file.basename
				)
			) {
				new Notice(
					this.t("modals.taskCreation.notices.successShortened", {
						title: createdTask.title,
					})
				);
			} else {
				new Notice(
					this.t("modals.taskCreation.notices.success", { title: createdTask.title })
				);
			}

			if (this.blockingItems.length > 0) {
				const blockingUpdates = buildCreationBlockingUpdates(this.blockingItems);

				if (blockingUpdates.added.length > 0) {
					await this.plugin.taskService.updateBlockingRelationships(
						createdTask,
						blockingUpdates.added,
						[],
						blockingUpdates.raw
					);
					const refreshed = await this.plugin.cacheManager.getTaskInfo(createdTask.path);
					if (refreshed) {
						createdTask = refreshed;
					}
				}

				if (blockingUpdates.unresolved.length > 0) {
					new Notice(
						this.t("modals.taskCreation.notices.blockingUnresolved", {
							entries: blockingUpdates.unresolved.join(", "),
						})
					);
				}

				this.blockingItems = [];
			}

			// Handle subtask assignments
			if (this.selectedSubtaskFiles.length > 0) {
				await this.applySubtaskAssignments(createdTask);
			}

			if (this.options.onTaskCreated) {
				this.options.onTaskCreated(createdTask);
			}

			await this.openCreatedTaskIfConfigured(result.file, options);

			this.close();

			if (options.createAnother) {
				window.setTimeout(() => {
					new TaskCreationModal(this.app, this.plugin, this.options).open();
				}, 0);
			}
		} catch (error) {
			tasknotesLogger.error("Failed to create task:", {
				category: "persistence",
				operation: "create-task",
				error: error,
			});
			const message = getTaskCreationFailureNoticeMessage(error);
			new Notice(this.t("modals.taskCreation.notices.failure", { message }));
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

	private buildTaskData(): Partial<TaskInfo> {
		const taskData = buildTaskCreationData({
			title: this.title,
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

	onClose(): void {
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
