import { App, Modal, Notice, setIcon } from "obsidian";
import { validateKanbanCustomDateRange } from "../bases/kanbanTimeFilter";
import {
	CalendarMonthGrid,
	getLastMonthRange,
	getRecentThreeMonthsRange,
	getThisMonthRange,
	parseCalendarDate,
	type CalendarDateRange,
} from "../components/CalendarMonthGrid";

export interface KanbanTimeFilterModalLabels {
	title: string;
	start: string;
	end: string;
	apply: string;
	cancel: string;
	invalidRange: string;
	thisMonth: string;
	lastMonth: string;
	recentThreeMonths: string;
	previousMonth: string;
	nextMonth: string;
	chooseDate: string;
	selectEnd: string;
}

export interface KanbanTimeFilterModalValue {
	start: string;
	end: string;
}

export class KanbanTimeFilterModal extends Modal {
	private resolveResult: ((value: KanbanTimeFilterModalValue | null) => void) | null = null;
	private selectedStart = "";
	private selectedEnd = "";
	private summaryEl: HTMLElement | null = null;
	private applyButton: HTMLButtonElement | null = null;
	private calendar: CalendarMonthGrid | null = null;
	private presetButtons: HTMLButtonElement[] = [];

	constructor(
		app: App,
		private readonly labels: KanbanTimeFilterModalLabels,
		private readonly initialValue: KanbanTimeFilterModalValue,
		private readonly now = new Date()
	) {
		super(app);
	}

	show(): Promise<KanbanTimeFilterModalValue | null> {
		return new Promise((resolve) => {
			this.resolveResult = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass("tasknotes-plugin", "tn-kanban-time-range-modal");
		this.contentEl.addClass("tn-kanban-time-range-picker");
		this.selectedStart = parseCalendarDate(this.initialValue.start)
			? this.initialValue.start
			: "";
		this.selectedEnd = parseCalendarDate(this.initialValue.end) ? this.initialValue.end : "";

		const header = this.contentEl.createDiv("tn-kanban-time-range-picker__header");
		header.createEl("h2", { text: this.labels.title });

		const body = this.contentEl.createDiv("tn-kanban-time-range-picker__body");
		const presets = body.createDiv("tn-kanban-time-range-picker__presets");
		this.addPreset(presets, this.labels.thisMonth, getThisMonthRange(this.now));
		this.addPreset(presets, this.labels.lastMonth, getLastMonthRange(this.now));
		this.addPreset(presets, this.labels.recentThreeMonths, getRecentThreeMonthsRange(this.now));

		const main = body.createDiv("tn-kanban-time-range-picker__main");
		const summary = main.createDiv("tn-kanban-time-range-picker__summary");
		const summaryIcon = summary.createSpan("tn-kanban-time-range-picker__summary-icon");
		setIcon(summaryIcon, "calendar-range");
		this.summaryEl = summary.createSpan("tn-kanban-time-range-picker__summary-text");

		const calendarContainer = main.createDiv("tn-kanban-time-range-picker__calendar");
		this.calendar = new CalendarMonthGrid({
			container: calendarContainer,
			labels: this.labels,
			visibleMonth: parseCalendarDate(this.selectedStart) ?? this.now,
			selectedStart: this.selectedStart,
			selectedEnd: this.selectedEnd,
			today: this.now,
			onSelect: (date) => this.selectCalendarDate(date),
		});

		const actions = this.contentEl.createDiv("tn-kanban-time-range-picker__actions");
		const cancel = actions.createEl("button", {
			text: this.labels.cancel,
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.closeWithResult(null));
		this.applyButton = actions.createEl("button", {
			text: this.labels.apply,
			cls: "mod-cta",
			attr: { type: "button" },
		});
		this.applyButton.addEventListener("click", () => this.apply());
		this.contentEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && this.selectedEnd) {
				event.preventDefault();
				this.apply();
			}
		});

		this.syncSelectionState();
		const win = this.contentEl.ownerDocument.defaultView ?? window;
		win.setTimeout(() => this.presetButtons[0]?.focus(), 0);
	}

	onClose(): void {
		this.finish(null);
		this.summaryEl = null;
		this.applyButton = null;
		this.calendar = null;
		this.presetButtons = [];
		this.contentEl.empty();
	}

	private addPreset(container: HTMLElement, label: string, range: CalendarDateRange): void {
		const button = container.createEl("button", {
			text: label,
			cls: "tn-kanban-time-range-picker__preset",
			attr: { type: "button" },
		});
		button.dataset.start = range.start;
		button.dataset.end = range.end;
		button.addEventListener("click", () => {
			this.selectedStart = range.start;
			this.selectedEnd = range.end;
			this.calendar?.setSelection(range.start, range.end, true);
			this.syncSelectionState();
		});
		this.presetButtons.push(button);
	}

	private selectCalendarDate(date: string): void {
		if (!this.selectedStart || this.selectedEnd) {
			this.selectedStart = date;
			this.selectedEnd = "";
		} else if (date < this.selectedStart) {
			this.selectedEnd = this.selectedStart;
			this.selectedStart = date;
		} else {
			this.selectedEnd = date;
		}
		this.calendar?.setSelection(this.selectedStart, this.selectedEnd);
		this.syncSelectionState();
	}

	private syncSelectionState(): void {
		if (this.summaryEl) {
			this.summaryEl.textContent = this.selectedStart
				? `${this.selectedStart}  —  ${this.selectedEnd || this.labels.selectEnd}`
				: `${this.labels.start}  —  ${this.labels.end}`;
		}
		if (this.applyButton) {
			this.applyButton.disabled = !validateKanbanCustomDateRange(
				this.selectedStart,
				this.selectedEnd
			);
		}
		for (const button of this.presetButtons) {
			button.toggleClass(
				"is-active",
				button.dataset.start === this.selectedStart &&
					button.dataset.end === this.selectedEnd
			);
		}
	}

	private apply(): void {
		if (!validateKanbanCustomDateRange(this.selectedStart, this.selectedEnd)) {
			new Notice(this.labels.invalidRange);
			return;
		}
		this.closeWithResult({ start: this.selectedStart, end: this.selectedEnd });
	}

	private closeWithResult(value: KanbanTimeFilterModalValue | null): void {
		this.finish(value);
		this.close();
	}

	private finish(value: KanbanTimeFilterModalValue | null): void {
		const resolve = this.resolveResult;
		this.resolveResult = null;
		resolve?.(value);
	}
}
