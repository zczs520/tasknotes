import { App } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { ModalFieldConfig, FieldGroup, TaskModalFieldsConfig } from "../../types/settings";
import {
	createCard,
	setupCardDragAndDrop,
	createCardSelect,
	createCardToggle,
} from "./CardComponent";
import type { TranslationKey } from "../../i18n";

const GROUP_TRANSLATION_KEYS: Partial<Record<FieldGroup, TranslationKey>> = {
	basic: "settings.modalFields.groups.basic",
	metadata: "settings.modalFields.groups.metadata",
	organization: "settings.modalFields.groups.organization",
	dependencies: "settings.modalFields.groups.dependencies",
	custom: "settings.modalFields.groups.custom",
};

const FIELD_TRANSLATION_KEYS: Record<string, TranslationKey> = {
	title: "settings.modalFields.fields.title",
	status: "settings.modalFields.fields.status",
	priority: "settings.modalFields.fields.priority",
	"due-date": "settings.modalFields.fields.dueDate",
	"scheduled-date": "settings.modalFields.fields.scheduledDate",
	details: "settings.modalFields.fields.details",
	contexts: "settings.modalFields.fields.contexts",
	tags: "settings.modalFields.fields.tags",
	"time-estimate": "settings.modalFields.fields.timeEstimate",
	recurrence: "settings.modalFields.fields.recurrence",
	reminders: "settings.modalFields.fields.reminders",
	"time-tracking": "settings.modalFields.fields.timeTracking",
	projects: "settings.modalFields.fields.projects",
	subtasks: "settings.modalFields.fields.subtasks",
	"blocked-by": "settings.modalFields.fields.blockedBy",
	blocking: "settings.modalFields.fields.blocking",
};

function translate(
	plugin: TaskNotesPlugin,
	key: TranslationKey,
	params?: Record<string, string | number>
): string {
	return plugin.i18n.translate(key, params);
}

function getGroupLabel(
	plugin: TaskNotesPlugin,
	group: TaskModalFieldsConfig["groups"][number]
): string {
	const key = GROUP_TRANSLATION_KEYS[group.id];
	return key ? translate(plugin, key) : group.displayName;
}

function getFieldLabel(plugin: TaskNotesPlugin, field: ModalFieldConfig): string {
	if (field.fieldType === "user") {
		return field.displayName;
	}
	const key = FIELD_TRANSLATION_KEYS[field.id];
	return key ? translate(plugin, key) : field.displayName;
}

/**
 * Creates the field manager UI component for configuring modal fields
 */
export function createFieldManager(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	config: TaskModalFieldsConfig,
	onUpdate: (config: TaskModalFieldsConfig) => void,
	app: App
): void {
	container.empty();
	container.addClass("field-manager");

	// Safety check
	if (!config || !config.groups || !config.fields) {
		container.createDiv({
			text: translate(plugin, "settings.modalFields.errors.invalid"),
		});
		return;
	}

	// Create tabs for different field groups
	const tabsContainer = container.createDiv({ cls: "field-manager__tabs" });
	const contentContainer = container.createDiv({ cls: "field-manager__content" });

	// Sort groups by order
	const sortedGroups = [...config.groups].sort((a, b) => a.order - b.order);

	// Create tabs
	sortedGroups.forEach((group, index) => {
		const tab = tabsContainer.createDiv({ cls: "field-manager__tab" });
		if (index === 0) {
			tab.addClass("field-manager__tab--active");
		}
		tab.setText(getGroupLabel(plugin, group));
		tab.onclick = () => {
			// Update active tab
			tabsContainer.querySelectorAll(".field-manager__tab").forEach((t) => {
				t.removeClass("field-manager__tab--active");
			});
			tab.addClass("field-manager__tab--active");

			// Render fields for this group
			renderFieldGroup(contentContainer, group.id, config, plugin, onUpdate, app);
		};
	});

	// Render first group by default
	if (sortedGroups.length > 0) {
		renderFieldGroup(contentContainer, sortedGroups[0].id, config, plugin, onUpdate, app);
	}
}

/**
 * Renders fields for a specific group
 */
function renderFieldGroup(
	container: HTMLElement,
	groupId: FieldGroup,
	config: TaskModalFieldsConfig,
	plugin: TaskNotesPlugin,
	onUpdate: (config: TaskModalFieldsConfig) => void,
	app: App
): void {
	container.empty();

	// Get fields for this group
	const groupFields = config.fields
		.filter((f) => f.group === groupId)
		.sort((a, b) => a.order - b.order);

	if (groupFields.length === 0) {
		const emptyState = container.createDiv({ cls: "field-manager__empty" });
		emptyState.setText(translate(plugin, "settings.modalFields.emptyGroup"));
		return;
	}

	// Create container for field cards
	const cardsContainer = container.createDiv({ cls: "field-manager__cards" });

	// Render each field as a card
	groupFields.forEach((field, index) => {
		createFieldCard(cardsContainer, field, index, config, plugin, onUpdate, app, groupId);
	});
}

/**
 * Creates a card for a single field using the CardComponent system
 */
function createFieldCard(
	container: HTMLElement,
	field: ModalFieldConfig,
	index: number,
	config: TaskModalFieldsConfig,
	plugin: TaskNotesPlugin,
	onUpdate: (config: TaskModalFieldsConfig) => void,
	app: App,
	groupId: FieldGroup
): void {
	// Create type badge
	const typeBadge = activeDocument.createElement("span");
	typeBadge.classList.add("field-card__type");
	typeBadge.classList.add(`field-card__type--${field.fieldType}`);
	typeBadge.textContent = translate(plugin, `settings.modalFields.fieldTypes.${field.fieldType}`);

	// Create toggle switches with callbacks
	const enabledToggle = createCardToggle(field.enabled, (value) => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].enabled = value;
			onUpdate(config);
			// Re-render to update visibility
			const activeTab = activeDocument.querySelector(
				".field-manager__tab--active"
			) as HTMLElement;
			if (activeTab) {
				const tabParent = activeTab.parentElement;
				const contentParent = container.parentElement;
				if (!tabParent || !contentParent) {
					return;
				}
				const tabIndex = Array.from(tabParent.children).indexOf(activeTab);
				const groups = [...config.groups].sort((a, b) => a.order - b.order);
				const groupToRender = groups[tabIndex];
				if (groupToRender) {
					renderFieldGroup(
						contentParent,
						groupToRender.id,
						config,
						plugin,
						onUpdate,
						app
					);
				}
			}
		}
	});

	const creationToggle = createCardToggle(field.visibleInCreation, (value) => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].visibleInCreation = value;
			onUpdate(config);
		}
	});

	const editToggle = createCardToggle(field.visibleInEdit, (value) => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].visibleInEdit = value;
			onUpdate(config);
		}
	});

	// Create group selector
	const groupSelect = createCardSelect(
		config.groups.map((group) => ({ value: group.id, label: getGroupLabel(plugin, group) })),
		field.group
	);
	groupSelect.onchange = () => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].group = groupSelect.value as FieldGroup;
			onUpdate(config);
			// Re-render to show field in new group
			const activeTab = activeDocument.querySelector(
				".field-manager__tab--active"
			) as HTMLElement;
			if (activeTab) {
				activeTab.click();
			}
		}
	};

	// Determine if this field can be reordered
	// Title and details anchor the task sheet; the remaining basic fields can be reordered.
	const canReorder = field.id !== "title" && field.id !== "details";

	// Create the card using CardComponent
	const card = createCard(container, {
		id: field.id,
		draggable: canReorder,
		header: {
			primaryText: getFieldLabel(plugin, field),
			secondaryText: getFieldSecondaryText(field, plugin),
			meta: [typeBadge],
		},
		content: {
			sections: [
				{
					rows: [
						{
							label: translate(plugin, "settings.modalFields.controls.enabled"),
							input: enabledToggle,
						},
					],
				},
				...(field.enabled
					? [
							{
								rows: [
									{
										label: translate(
											plugin,
											"settings.modalFields.controls.showInCreation"
										),
										input: creationToggle,
									},
									{
										label: translate(
											plugin,
											"settings.modalFields.controls.showInEdit"
										),
										input: editToggle,
									},
									{
										label: translate(
											plugin,
											"settings.modalFields.controls.group"
										),
										input: groupSelect,
										fullWidth: true,
									},
								],
							},
						]
					: []),
			],
		},
	});

	// Setup drag and drop for reordering (only for fields that can be reordered)
	if (canReorder) {
		setupCardDragAndDrop(
			card,
			container,
			(draggedId: string, targetId: string, insertBefore: boolean) => {
				const draggedIndex = config.fields.findIndex(
					(f) => f.id === draggedId && f.group === groupId
				);
				const targetIndex = config.fields.findIndex(
					(f) => f.id === targetId && f.group === groupId
				);

				if (draggedIndex === -1 || targetIndex === -1) return;

				// Get only fields in this group
				const groupFields = config.fields.filter((f) => f.group === groupId);

				// Find positions within the group
				const draggedGroupIndex = groupFields.findIndex((f) => f.id === draggedId);
				const targetGroupIndex = groupFields.findIndex((f) => f.id === targetId);

				// Reorder within group
				const [movedField] = groupFields.splice(draggedGroupIndex, 1);
				const insertIndex = targetGroupIndex + (insertBefore ? 0 : 1);
				groupFields.splice(insertIndex, 0, movedField);

				// Update order values
				groupFields.forEach((f, i) => {
					const fieldIndex = config.fields.findIndex((cf) => cf.id === f.id);
					if (fieldIndex !== -1) {
						config.fields[fieldIndex].order = i;
					}
				});

				onUpdate(config);
				// Re-render the group
				renderFieldGroup(container, groupId, config, plugin, onUpdate, app);
			}
		);
	}
}

function getFieldSecondaryText(field: ModalFieldConfig, plugin: TaskNotesPlugin): string {
	if (field.fieldType !== "user") {
		return translate(plugin, "settings.modalFields.secondary.id", { id: field.id });
	}

	const userField = plugin.settings.userFields?.find((candidate) => candidate.id === field.id);
	return userField?.key
		? translate(plugin, "settings.modalFields.secondary.key", { key: userField.key })
		: translate(plugin, "settings.modalFields.secondary.noKey");
}

/**
 * Add styles for field manager
 */
export function addFieldManagerStyles(): void {
	const styleId = "field-manager-styles";
	if (activeDocument.getElementById(styleId)) return;

	const style = activeDocument.createElement("style");
	style.id = styleId;
	style.textContent = `
		.field-manager {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}

		.field-manager__tabs {
			display: flex;
			gap: 0.5rem;
			border-bottom: 2px solid var(--background-modifier-border);
			padding-bottom: 0.5rem;
		}

		.field-manager__tab {
			padding: 0.5rem 1rem;
			cursor: pointer;
			border-radius: 4px;
			transition: background-color 0.2s;
		}

		.field-manager__tab:hover {
			background-color: var(--background-modifier-hover);
		}

		.field-manager__tab--active {
			background-color: var(--interactive-accent);
			color: var(--text-on-accent);
		}

		.field-manager__content {
			padding: 1rem 0;
		}

		.field-manager__cards {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
		}

		.field-manager__empty {
			text-align: center;
			padding: 2rem;
			color: var(--text-muted);
		}

		.field-card__type {
			font-size: 0.75rem;
			padding: 0.125rem 0.5rem;
			border-radius: 3px;
			background: var(--background-modifier-border);
		}

		.field-card__type--core {
			background: var(--interactive-accent);
			color: var(--text-on-accent);
		}

			.field-card__type--user {
				background: var(--color-purple);
				color: var(--text-on-accent);
			}

			.field-card__type--dependency {
				background: var(--color-orange);
				color: var(--text-on-accent);
			}

			.field-card__type--organization {
				background: var(--color-green);
				color: var(--text-on-accent);
			}
	`;

	activeDocument.head.appendChild(style);
}
