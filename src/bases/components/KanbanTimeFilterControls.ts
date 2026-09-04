import { setIcon } from "obsidian";
import type { KanbanTimeFilterField, KanbanTimeFilterPreset } from "../kanbanTimeFilter";

export interface KanbanTimeFilterLabels {
	ariaLabel: string;
	fieldButtonLabel: string;
	today: string;
	yesterday: string;
	thisWeek: string;
	lastWeek: string;
	all: string;
	custom: string;
}

export interface KanbanTimeFilterControlsOptions {
	container: HTMLElement;
	field: KanbanTimeFilterField;
	preset: KanbanTimeFilterPreset;
	labels: KanbanTimeFilterLabels;
	onChooseField: (anchor: HTMLButtonElement) => void;
	onSelectPreset: (preset: KanbanTimeFilterPreset) => void;
}

const FILTER_PRESETS: KanbanTimeFilterPreset[] = [
	"today",
	"yesterday",
	"this-week",
	"last-week",
	"all",
	"custom",
];

function getPresetLabel(preset: KanbanTimeFilterPreset, labels: KanbanTimeFilterLabels): string {
	if (preset === "today") return labels.today;
	if (preset === "yesterday") return labels.yesterday;
	if (preset === "this-week") return labels.thisWeek;
	if (preset === "last-week") return labels.lastWeek;
	if (preset === "all") return labels.all;
	return labels.custom;
}

export class KanbanTimeFilterControls {
	readonly element: HTMLElement;
	readonly fieldButton: HTMLButtonElement;
	private readonly buttons = new Map<KanbanTimeFilterPreset, HTMLButtonElement>();

	constructor(options: KanbanTimeFilterControlsOptions) {
		const doc = options.container.ownerDocument;
		this.element = doc.createElement("div");
		this.element.className = "tn-kanban-time-filter";
		this.element.setAttribute("role", "group");
		this.element.setAttribute("aria-label", options.labels.ariaLabel);

		this.fieldButton = doc.createElement("button");
		this.fieldButton.type = "button";
		this.fieldButton.className = "tn-kanban-time-filter__field-button";
		this.fieldButton.dataset.field = options.field;
		this.fieldButton.setAttribute("aria-haspopup", "menu");
		this.fieldButton.setAttribute("aria-label", options.labels.fieldButtonLabel);
		this.fieldButton.title = options.labels.fieldButtonLabel;

		const icon = doc.createElement("span");
		icon.className = "tn-kanban-time-filter__field-icon";
		icon.setAttribute("aria-hidden", "true");
		setIcon(icon, "calendar-days");
		this.fieldButton.appendChild(icon);

		const chevron = doc.createElement("span");
		chevron.className = "tn-kanban-time-filter__field-chevron";
		chevron.setAttribute("aria-hidden", "true");
		setIcon(chevron, "chevron-down");
		this.fieldButton.appendChild(chevron);
		this.fieldButton.addEventListener("click", () => options.onChooseField(this.fieldButton));
		this.element.appendChild(this.fieldButton);

		for (const preset of FILTER_PRESETS) {
			const button = doc.createElement("button");
			button.type = "button";
			button.className = "tn-kanban-time-filter__button";
			button.dataset.preset = preset;
			button.textContent = getPresetLabel(preset, options.labels);
			button.addEventListener("click", () => options.onSelectPreset(preset));
			this.buttons.set(preset, button);
			this.element.appendChild(button);
		}

		options.container.appendChild(this.element);
		this.update(options.field, options.preset, options.labels);
	}

	update(
		field: KanbanTimeFilterField,
		preset: KanbanTimeFilterPreset,
		labels?: Pick<KanbanTimeFilterLabels, "ariaLabel" | "fieldButtonLabel">
	): void {
		this.fieldButton.dataset.field = field;
		if (labels) {
			this.element.setAttribute("aria-label", labels.ariaLabel);
			this.fieldButton.setAttribute("aria-label", labels.fieldButtonLabel);
			this.fieldButton.title = labels.fieldButtonLabel;
		}

		for (const [buttonPreset, button] of this.buttons) {
			const isActive = buttonPreset === preset;
			button.classList.toggle("is-active", isActive);
			button.setAttribute("aria-pressed", String(isActive));
		}
	}

	destroy(): void {
		this.element.remove();
		this.buttons.clear();
	}
}
