import { setIcon } from "obsidian";
import {
	getOrderedModalGroups,
	type ModalFieldConfigLike,
	type ModalFieldsConfigLike,
} from "./taskModalFieldConfig";
import { getTaskModalPropertyIcon } from "./taskModalPropertyFields";

export type TaskModalFieldRenderer = (
	container: HTMLElement,
	fieldConfig: ModalFieldConfigLike
) => void;

export type TaskModalFieldRendererMap = Record<string, TaskModalFieldRenderer>;

export interface RenderTaskModalFieldOptions {
	container: HTMLElement;
	fieldConfig: ModalFieldConfigLike;
	fieldRenderers: Partial<TaskModalFieldRendererMap>;
	renderUserField: TaskModalFieldRenderer;
}

export interface RenderTaskModalFieldGroupsOptions {
	container: HTMLElement;
	config: ModalFieldsConfigLike;
	isCreationMode: boolean;
	fieldRenderers: Partial<TaskModalFieldRendererMap>;
	renderUserField: TaskModalFieldRenderer;
}

export interface RenderTaskModalFieldGroupsResult {
	groupsRendered: number;
	fieldsRendered: number;
	ignoredFieldIds: string[];
}

const BASIC_MODAL_LAYOUT_FIELD_IDS = new Set(["title", "details"]);
const DEFAULT_VISIBLE_TASK_MODAL_FIELD_IDS = new Set([
	"status",
	"priority",
	"scheduled-date",
	"tags",
]);
const DEFAULT_VISIBLE_TASK_MODAL_FIELD_ORDER = [
	"status",
	"priority",
	"scheduled-date",
	"tags",
] as const;

export function isDefaultVisibleTaskModalField(fieldId: string): boolean {
	return DEFAULT_VISIBLE_TASK_MODAL_FIELD_IDS.has(fieldId);
}

export function renderTaskModalField(options: RenderTaskModalFieldOptions): boolean {
	const { container, fieldConfig, fieldRenderers, renderUserField } = options;
	const renderer = fieldRenderers[fieldConfig.id];

	if (renderer) {
		renderer(container, fieldConfig);
		decorateTaskModalFieldLabel(container, fieldConfig.id);
		return true;
	}

	if (fieldConfig.fieldType === "user") {
		renderUserField(container, fieldConfig);
		decorateTaskModalFieldLabel(container, fieldConfig.id);
		return true;
	}

	return false;
}

function decorateTaskModalFieldLabel(container: HTMLElement, fieldId: string): void {
	const label = container.querySelector<HTMLElement>(
		".tn-task-modal__property-label, .setting-item-name"
	);
	if (!label || label.querySelector(".tn-task-modal__property-label-icon")) {
		return;
	}

	label.classList.add("tn-task-modal__property-label");
	const icon = activeDocument.createElement("span");
	icon.className = "tn-task-modal__property-label-icon";
	setIcon(icon, getTaskModalPropertyIcon(fieldId));
	label.prepend(icon);
}

export function renderTaskModalFieldGroups(
	options: RenderTaskModalFieldGroupsOptions
): RenderTaskModalFieldGroupsResult {
	const configuredGroups = getOrderedModalGroups(options.config, options.isCreationMode).map(
		(groupConfig) => ({
			...groupConfig,
			fields:
				groupConfig.id === "basic"
					? groupConfig.fields.filter(
							(field) => !BASIC_MODAL_LAYOUT_FIELD_IDS.has(field.id)
						)
					: groupConfig.fields,
		})
	);
	const fieldsById = new Map(
		configuredGroups.flatMap((group) => group.fields).map((field) => [field.id, field])
	);
	const essentialFields = DEFAULT_VISIBLE_TASK_MODAL_FIELD_ORDER.map((fieldId) =>
		fieldsById.get(fieldId)
	).filter((field): field is ModalFieldConfigLike => Boolean(field));
	const groupsToRender = [
		...(essentialFields.length > 0 ? [{ id: "essential", fields: essentialFields }] : []),
		...configuredGroups
			.map((group) => ({
				...group,
				fields: group.fields.filter((field) => !isDefaultVisibleTaskModalField(field.id)),
			}))
			.filter((group) => group.fields.length > 0),
	];
	const result: RenderTaskModalFieldGroupsResult = {
		groupsRendered: 0,
		fieldsRendered: 0,
		ignoredFieldIds: [],
	};

	for (const groupConfig of groupsToRender) {
		const fields = groupConfig.fields;

		if (fields.length === 0) {
			continue;
		}

		const groupContainer = options.container.createDiv({
			cls: fields.some((field) => isDefaultVisibleTaskModalField(field.id))
				? "task-modal__field-group task-modal__field-group--has-essential"
				: "task-modal__field-group task-modal__field-group--advanced-only",
		});
		result.groupsRendered += 1;

		for (const field of fields) {
			const fieldContainer = groupContainer.createDiv({
				cls: isDefaultVisibleTaskModalField(field.id)
					? "tn-task-modal__field tn-task-modal__field--essential"
					: "tn-task-modal__field tn-task-modal__field--advanced",
				attr: { "data-task-modal-field-id": field.id },
			});
			const rendered = renderTaskModalField({
				container: fieldContainer,
				fieldConfig: field,
				fieldRenderers: options.fieldRenderers,
				renderUserField: options.renderUserField,
			});

			if (rendered) {
				result.fieldsRendered += 1;
			} else {
				fieldContainer.remove();
				result.ignoredFieldIds.push(field.id);
			}
		}
	}

	return result;
}
