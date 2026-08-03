import {
	formatCalendarDate,
	getCalendarMonthDays,
	getLastMonthRange,
	getRecentThreeMonthsRange,
	getThisMonthRange,
	getUpcomingWeekday,
} from "../../../src/components/CalendarMonthGrid";

describe("CalendarMonthGrid date helpers", () => {
	it("builds a Monday-first six-week month grid", () => {
		const days = getCalendarMonthDays(new Date(2026, 7, 1));
		expect(days).toHaveLength(42);
		expect(formatCalendarDate(days[0])).toBe("2026-07-27");
		expect(formatCalendarDate(days[41])).toBe("2026-09-06");
	});

	it("calculates the three Kanban range shortcuts", () => {
		const now = new Date(2026, 7, 5);
		expect(getThisMonthRange(now)).toEqual({ start: "2026-08-01", end: "2026-08-31" });
		expect(getLastMonthRange(now)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
		expect(getRecentThreeMonthsRange(now)).toEqual({
			start: "2026-06-01",
			end: "2026-08-05",
		});
	});

	it("disables this Friday after it has passed for the week", () => {
		expect(getUpcomingWeekday(new Date(2026, 7, 7), 5)).not.toBeNull();
		expect(getUpcomingWeekday(new Date(2026, 7, 8), 5)).toBeNull();
		expect(getUpcomingWeekday(new Date(2026, 7, 9), 5)).toBeNull();
	});
});
