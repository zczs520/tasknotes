import { Notice } from "obsidian";
import {
	addCalendarDays,
	CalendarMonthGrid,
	formatCalendarDate,
	getUpcomingWeekday,
	parseCalendarDate,
	type CalendarMonthGridLabels,
} from "./CalendarMonthGrid";

export interface ScheduledDatePopoverLabels extends CalendarMonthGridLabels {
	today: string;
	tomorrow: string;
	thisFriday: string;
	thisSunday: string;
	fridayPassed: string;
}

export interface ScheduledDatePopoverOptions {
	anchor: HTMLElement;
	currentDate: string;
	labels: ScheduledDatePopoverLabels;
	locale?: string;
	now?: Date;
	onSelect: (date: string) => void;
}

export class ScheduledDatePopover {
	private static active: ScheduledDatePopover | null = null;
	private root: HTMLElement | null = null;
	private readonly ownerDocument: Document;
	private readonly view: Window;

	constructor(private readonly options: ScheduledDatePopoverOptions) {
		this.ownerDocument = options.anchor.ownerDocument;
		this.view = this.ownerDocument.defaultView ?? window;
	}

	show(): void {
		if (ScheduledDatePopover.active) ScheduledDatePopover.active.close();
		ScheduledDatePopover.active = this;

		const root = this.ownerDocument.createElement("div");
		root.className = "tasknotes-plugin tn-scheduled-date-popover";
		root.setAttribute("role", "dialog");
		root.dataset.tnNoDrag = "true";
		root.addEventListener("click", (event) => event.stopPropagation());
		root.addEventListener("mousedown", (event) => event.stopPropagation());
		this.ownerDocument.body.appendChild(root);
		this.root = root;

		const quickActions = root.createDiv("tn-scheduled-date-popover__quick-actions");
		const now = this.options.now ?? new Date();
		this.addQuickAction(quickActions, this.options.labels.today, formatCalendarDate(now));
		this.addQuickAction(
			quickActions,
			this.options.labels.tomorrow,
			formatCalendarDate(addCalendarDays(now, 1))
		);
		this.addQuickAction(
			quickActions,
			this.options.labels.thisFriday,
			getUpcomingWeekday(now, 5)
				? formatCalendarDate(getUpcomingWeekday(now, 5) as Date)
				: null,
			this.options.labels.fridayPassed
		);
		this.addQuickAction(
			quickActions,
			this.options.labels.thisSunday,
			formatCalendarDate(getUpcomingWeekday(now, 0) ?? now)
		);

		const calendar = root.createDiv("tn-scheduled-date-popover__calendar");
		new CalendarMonthGrid({
			container: calendar,
			labels: this.options.labels,
			locale: this.options.locale,
			visibleMonth: parseCalendarDate(this.options.currentDate) ?? now,
			selectedStart: this.options.currentDate,
			today: now,
			onSelect: (date) => this.select(date),
		});

		this.position();
		this.view.setTimeout(() => root.querySelector<HTMLButtonElement>("button")?.focus(), 0);
		this.ownerDocument.addEventListener("mousedown", this.handleOutsidePointer, true);
		this.ownerDocument.addEventListener("keydown", this.handleKeydown, true);
		this.view.addEventListener("resize", this.closeOnViewportChange);
		this.view.addEventListener("scroll", this.closeOnViewportChange, true);
	}

	close(): void {
		this.ownerDocument.removeEventListener("mousedown", this.handleOutsidePointer, true);
		this.ownerDocument.removeEventListener("keydown", this.handleKeydown, true);
		this.view.removeEventListener("resize", this.closeOnViewportChange);
		this.view.removeEventListener("scroll", this.closeOnViewportChange, true);
		this.root?.remove();
		this.root = null;
		if (ScheduledDatePopover.active === this) ScheduledDatePopover.active = null;
	}

	private addQuickAction(
		container: HTMLElement,
		label: string,
		date: string | null,
		invalidNotice?: string
	): void {
		const button = container.createEl("button", {
			text: label,
			cls: "tn-scheduled-date-popover__quick-button",
			attr: { type: "button" },
		});
		button.addEventListener("click", () => {
			if (!date) {
				if (invalidNotice) new Notice(invalidNotice);
				return;
			}
			this.select(date);
		});
	}

	private select(date: string): void {
		this.options.onSelect(date);
		this.close();
	}

	private position(): void {
		if (!this.root) return;
		const anchorRect = this.options.anchor.getBoundingClientRect();
		const rootRect = this.root.getBoundingClientRect();
		const gap = 6;
		const margin = 10;
		let left = anchorRect.left + this.view.scrollX;
		left = Math.min(left, this.view.scrollX + this.view.innerWidth - rootRect.width - margin);
		left = Math.max(this.view.scrollX + margin, left);
		let top = anchorRect.bottom + this.view.scrollY + gap;
		if (anchorRect.bottom + rootRect.height + gap > this.view.innerHeight - margin) {
			top = anchorRect.top + this.view.scrollY - rootRect.height - gap;
		}
		this.root.style.left = `${left}px`;
		this.root.style.top = `${Math.max(this.view.scrollY + margin, top)}px`;
	}

	private readonly handleOutsidePointer = (event: MouseEvent): void => {
		const target = event.target as Node | null;
		if (target && (this.root?.contains(target) || this.options.anchor.contains(target))) return;
		this.close();
	};

	private readonly handleKeydown = (event: KeyboardEvent): void => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		this.close();
		this.options.anchor.focus();
	};

	private readonly closeOnViewportChange = (): void => this.close();
}
