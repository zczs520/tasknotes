/**
 * Day-by-day navigation for the calendar toolbar.
 *
 * FullCalendar's built-in prev/next buttons move by the current view's duration
 * (a week, three days, a month). The extra day buttons always move exactly one
 * day, so a week view can be stepped through day by day while the original
 * period buttons keep their behaviour.
 */

export const CALENDAR_DAY_NAVIGATION_BUTTONS = [
	"prevPeriod",
	"prevDay",
	"nextDay",
	"nextPeriod",
] as const;

export type CalendarDayNavigationButton = (typeof CALENDAR_DAY_NAVIGATION_BUTTONS)[number];

/** Ordered like `<< < > >>`, followed by the existing toolbar buttons. */
export const CALENDAR_DAY_NAVIGATION_TOOLBAR = `${CALENDAR_DAY_NAVIGATION_BUTTONS.join(
	","
)} todayAligned refreshCalendars`;
