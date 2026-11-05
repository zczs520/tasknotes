/**
 * Configurable time-grid slot height.
 *
 * FullCalendar derives the height of a time-grid row from CSS (`.fc-timegrid-slot`
 * defaults to `1.5em`) and from the height of its label cell. Both make a
 * 15-minute grid twice as tall as a 30-minute grid, which forces long vertical
 * scrolling even though the day itself did not get longer.
 *
 * The rendered row height is therefore driven by a single CSS custom property
 * that each calendar root element sets from the user's configuration.
 */

export const CALENDAR_SLOT_HEIGHT_MIN = 5;
export const CALENDAR_SLOT_HEIGHT_MAX = 60;
export const CALENDAR_SLOT_HEIGHT_DEFAULT = 24;
export const CALENDAR_SLOT_HEIGHT_VAR = "--tn-calendar-slot-height";
export const CALENDAR_SLOT_HEIGHT_DATA_ATTR = "tnSlotHeight";

export function normalizeCalendarSlotHeight(
	value: unknown,
	fallback: number = CALENDAR_SLOT_HEIGHT_DEFAULT
): number {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}

	return Math.min(
		CALENDAR_SLOT_HEIGHT_MAX,
		Math.max(CALENDAR_SLOT_HEIGHT_MIN, Math.round(numeric))
	);
}

/**
 * Apply the configured slot height to the calendar root element. The CSS custom
 * property is inherited by every time-grid row, so a single write is enough.
 */
export function applyCalendarSlotHeight(
	calendarEl: HTMLElement | null,
	slotHeight: unknown
): void {
	if (!calendarEl) {
		return;
	}

	const normalized = normalizeCalendarSlotHeight(slotHeight);
	calendarEl.style.setProperty(CALENDAR_SLOT_HEIGHT_VAR, `${normalized}px`);
	calendarEl.dataset[CALENDAR_SLOT_HEIGHT_DATA_ATTR] = String(normalized);
}
