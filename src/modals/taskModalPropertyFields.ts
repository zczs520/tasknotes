import { setIcon } from "obsidian";

export interface TaskModalChoiceOption {
	value: string;
	label: string;
	color?: string;
}

export interface TaskModalFieldControl {
	update: (value: string) => void;
}

interface TaskModalPropertyRowOptions {
	container: HTMLElement;
	fieldId: string;
	label: string;
	icon?: string;
}

const TASK_MODAL_PROPERTY_ICONS: Record<string, string> = {
	status: "circle-dot",
	priority: "signal",
	"due-date": "calendar-x",
	"scheduled-date": "calendar-days",
	tags: "tags",
	contexts: "at-sign",
	"time-estimate": "clock-3",
	recurrence: "repeat-2",
	reminders: "bell",
	"time-tracking": "timer",
	projects: "folder",
	subtasks: "list-tree",
	"blocked-by": "shield-alert",
	blocking: "git-branch",
};

export function getTaskModalPropertyIcon(fieldId: string): string {
	return TASK_MODAL_PROPERTY_ICONS[fieldId] ?? "square-pen";
}

export function createTaskModalChoiceField(
	options: TaskModalPropertyRowOptions & {
		choices: readonly TaskModalChoiceOption[];
		value: string;
		onChange: (value: string) => void;
	}
): TaskModalFieldControl {
	const row = createPropertyRow(options);
	const choicesEl = row.createDiv({ cls: "tn-task-modal__choices" });

	for (const choice of options.choices) {
		const button = choicesEl.createEl("button", {
			cls: "tn-task-modal__choice",
			text: choice.label,
			attr: {
				type: "button",
				"data-value": choice.value,
			},
		});
		if (choice.color) {
			button.style.setProperty("--tn-task-modal-choice-color", choice.color);
		}
		button.addEventListener("click", () => {
			options.onChange(choice.value);
			updateChoiceButtons(choicesEl, choice.value);
		});
	}

	updateChoiceButtons(choicesEl, options.value);
	return {
		update: (value) => updateChoiceButtons(choicesEl, value),
	};
}

export function createTaskModalValueField(
	options: TaskModalPropertyRowOptions & {
		value: string;
		emptyText: string;
		icon?: string;
		onClick: (event: MouseEvent) => void;
	}
): TaskModalFieldControl {
	const row = createPropertyRow(options);
	const valueWrap = row.createDiv({ cls: "tn-task-modal__value-wrap" });
	const button = valueWrap.createEl("button", {
		cls: "tn-task-modal__value-button",
		attr: { type: "button" },
	});

	const text = button.createSpan({ cls: "tn-task-modal__value-text" });
	button.addEventListener("click", options.onClick);

	const update = (value: string): void => {
		text.setText(value || options.emptyText);
		button.classList.toggle("is-empty", !value);
	};
	update(options.value);

	return { update };
}

function createPropertyRow(options: TaskModalPropertyRowOptions): HTMLElement {
	const row = options.container.createDiv({
		cls: "tn-task-modal__property-row",
		attr: { "data-field-id": options.fieldId },
	});
	const label = row.createDiv({ cls: "tn-task-modal__property-label" });
	const icon = label.createSpan({ cls: "tn-task-modal__property-label-icon" });
	setIcon(icon, options.icon ?? getTaskModalPropertyIcon(options.fieldId));
	label.createSpan({ cls: "tn-task-modal__property-label-text", text: options.label });
	return row;
}

function updateChoiceButtons(container: HTMLElement, value: string): void {
	container.querySelectorAll<HTMLButtonElement>(".tn-task-modal__choice").forEach((button) => {
		const selected = button.dataset.value === value;
		button.classList.toggle("is-selected", selected);
		button.setAttribute("aria-pressed", String(selected));
	});
}
