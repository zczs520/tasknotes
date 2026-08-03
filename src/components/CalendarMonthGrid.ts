export interface CalendarDateRange {
	start: string;
	end: string;
}

export interface CalendarMonthGridLabels {
	previousMonth: string;
	nextMonth: string;
	chooseDate: string;
}

export interface CalendarMonthGridOptions {
	container: HTMLElement;
	labels: CalendarMonthGridLabels;
	locale?: string;
	visibleMonth?: Date;
	selectedStart?: string;
	selectedEnd?: string;
	today?: Date;
	onSelect: (date: string) => void;
}

function atLocalNoon(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

export function formatCalendarDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function parseCalendarDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
	return formatCalendarDate(date) === value ? date : null;
}

export function addCalendarDays(date: Date, amount: number): Date {
	const result = atLocalNoon(date);
	result.setDate(result.getDate() + amount);
	return result;
}

export function getCalendarMonthDays(month: Date): Date[] {
	const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
	const mondayOffset = (first.getDay() + 6) % 7;
	const gridStart = addCalendarDays(first, -mondayOffset);
	return Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
}

export function getThisMonthRange(now = new Date()): CalendarDateRange {
	return {
		start: formatCalendarDate(new Date(now.getFullYear(), now.getMonth(), 1, 12)),
		end: formatCalendarDate(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12)),
	};
}

export function getLastMonthRange(now = new Date()): CalendarDateRange {
	return {
		start: formatCalendarDate(new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)),
		end: formatCalendarDate(new Date(now.getFullYear(), now.getMonth(), 0, 12)),
	};
}

export function getRecentThreeMonthsRange(now = new Date()): CalendarDateRange {
	return {
		start: formatCalendarDate(new Date(now.getFullYear(), now.getMonth() - 2, 1, 12)),
		end: formatCalendarDate(atLocalNoon(now)),
	};
}

export function getUpcomingWeekday(now: Date, weekday: number): Date | null {
	const current = atLocalNoon(now);
	const daysAhead = (weekday - current.getDay() + 7) % 7;
	if (weekday === 5 && (current.getDay() === 6 || current.getDay() === 0)) return null;
	return addCalendarDays(current, daysAhead);
}

export class CalendarMonthGrid {
	private visibleMonth: Date;
	private selectedStart: string;
	private selectedEnd: string;
	private readonly today: string;

	constructor(private readonly options: CalendarMonthGridOptions) {
		const initial =
			options.visibleMonth ?? parseCalendarDate(options.selectedStart ?? "") ?? new Date();
		this.visibleMonth = new Date(initial.getFullYear(), initial.getMonth(), 1, 12);
		this.selectedStart = options.selectedStart ?? "";
		this.selectedEnd = options.selectedEnd ?? "";
		this.today = formatCalendarDate(options.today ?? new Date());
		this.render();
	}

	setSelection(start: string, end = "", revealStart = false): void {
		this.selectedStart = start;
		this.selectedEnd = end;
		if (revealStart) {
			const date = parseCalendarDate(start);
			if (date) this.visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1, 12);
		}
		this.render();
	}

	private render(): void {
		const { container, labels, locale } = this.options;
		container.empty();
		container.addClass("tn-calendar-month");

		const header = container.createDiv("tn-calendar-month__header");
		const previous = header.createEl("button", {
			text: "‹",
			cls: "tn-calendar-month__nav",
			attr: { type: "button", "aria-label": labels.previousMonth },
		});
		previous.addEventListener("click", () => this.changeMonth(-1));

		header.createDiv({
			cls: "tn-calendar-month__title",
			text: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
				this.visibleMonth
			),
		});

		const next = header.createEl("button", {
			text: "›",
			cls: "tn-calendar-month__nav",
			attr: { type: "button", "aria-label": labels.nextMonth },
		});
		next.addEventListener("click", () => this.changeMonth(1));

		const grid = container.createDiv("tn-calendar-month__grid");
		grid.setAttribute("role", "grid");
		const monday = new Date(2024, 0, 1, 12);
		for (let index = 0; index < 7; index++) {
			grid.createDiv({
				cls: "tn-calendar-month__weekday",
				text: new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
					addCalendarDays(monday, index)
				),
			});
		}

		for (const date of getCalendarMonthDays(this.visibleMonth)) {
			const value = formatCalendarDate(date);
			const button = grid.createEl("button", {
				text: String(date.getDate()),
				cls: "tn-calendar-month__day",
				attr: {
					type: "button",
					"data-date": value,
					"aria-label": `${labels.chooseDate}: ${value}`,
				},
			});
			if (date.getMonth() !== this.visibleMonth.getMonth()) {
				button.addClass("is-outside-month");
			}
			if (value === this.today) button.addClass("is-today");
			if (value === this.selectedStart) button.addClass("is-range-start");
			if (value === this.selectedEnd) button.addClass("is-range-end");
			if (
				this.selectedStart &&
				this.selectedEnd &&
				value > this.selectedStart &&
				value < this.selectedEnd
			) {
				button.addClass("is-in-range");
			}
			button.addEventListener("click", () => this.options.onSelect(value));
		}
	}

	private changeMonth(amount: number): void {
		this.visibleMonth = new Date(
			this.visibleMonth.getFullYear(),
			this.visibleMonth.getMonth() + amount,
			1,
			12
		);
		this.render();
	}
}
